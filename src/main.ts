import { Notice, Plugin, TAbstractFile } from "obsidian";
import { SeafileClient } from "./api/client";
import { TokenInvalidError } from "./api/types";
import { DEFAULT_SETTINGS, PersistedData, SeafileSettings } from "./settings";
import { SyncEngine } from "./sync/engine";
import { SyncRecordMap } from "./sync/syncRecord";
import { promptConflict } from "./ui/conflictModal";
import { SeafileSettingsTab } from "./ui/settingsTab";
import { StatusBarController } from "./ui/statusBar";
import { isExcluded, setConfigDir } from "./utils/paths";
import { log } from "./utils/logger";

export default class SeafileSyncPlugin extends Plugin {
	settings!: SeafileSettings;
	records: SyncRecordMap = {};
	private client: SeafileClient | null = null;
	private status!: StatusBarController;
	private syncing = false;
	private autoSyncHandle: number | null = null;
	private realtimeHandle: number | null = null;
	private realtimeRegistered = false;
	private startupHandle: number | null = null;

	async onload(): Promise<void> {
		await this.loadAll();
		setConfigDir(this.app.vault.configDir);
		this.rebuildClient();

		this.status = new StatusBarController(this.addStatusBarItem());
		this.status.set({ kind: "idle", lastSyncAt: this.settings.lastSyncAt });

		this.addSettingTab(new SeafileSettingsTab(this.app, this));

		this.addCommand({
			id: "sync-now",
			name: "Sync now",
			callback: () => this.runSync(),
		});
		this.scheduleAutoSync();
		this.registerRealtimeWatchers();
		this.app.workspace.onLayoutReady(() => {
			if (!this.client || !this.settings.repoId) return;
			this.startupHandle = window.setTimeout(() => {
				this.startupHandle = null;
				if (this.syncing) return;
				this.runSync().catch((e) => log.error("startup sync failed", e));
			}, 3000);
		});

		this.addCommand({
			id: "clear-token",
			name: "Clear seafile token",
			callback: async () => {
				this.settings.apiToken = "";
				this.settings.accountEmail = "";
				await this.saveAll();
				this.rebuildClient();
				new Notice("Seafile token cleared.");
			},
		});
	}

	onunload(): void {
		if (this.realtimeHandle !== null) {
			window.clearTimeout(this.realtimeHandle);
			this.realtimeHandle = null;
		}
		if (this.startupHandle !== null) {
			window.clearTimeout(this.startupHandle);
			this.startupHandle = null;
		}
		if (this.autoSyncHandle !== null) {
			window.clearInterval(this.autoSyncHandle);
			this.autoSyncHandle = null;
		}
		log.info("unloaded");
	}

	scheduleAutoSync(): void {
		if (this.autoSyncHandle !== null) {
			window.clearInterval(this.autoSyncHandle);
			this.autoSyncHandle = null;
		}
		const minutes = this.settings.autoSyncMinutes;
		if (!minutes || minutes <= 0) return;
		const ms = Math.max(1, minutes) * 60_000;
		this.autoSyncHandle = window.setInterval(() => {
			if (this.syncing) return;
			if (!this.client || !this.settings.repoId) return;
			this.runSync().catch((e) => log.error("auto-sync failed", e));
		}, ms);
		this.registerInterval(this.autoSyncHandle);
	}

	private registerRealtimeWatchers(): void {
		if (this.realtimeRegistered) return;
		this.realtimeRegistered = true;
		const handler = (file: TAbstractFile) => this.onVaultChange(file.path);
		this.registerEvent(this.app.vault.on("modify", handler));
		this.registerEvent(this.app.vault.on("create", handler));
		this.registerEvent(this.app.vault.on("delete", handler));
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.onVaultChange(file.path);
				this.onVaultChange(oldPath);
			}),
		);
	}

	private onVaultChange(path: string): void {
		const secs = this.settings.realtimeSyncSeconds;
		if (!secs || secs <= 0) return;
		if (this.syncing) return;
		if (!this.client || !this.settings.repoId) return;
		if (isExcluded(path, this.settings.extraExcludes)) return;
		if (this.realtimeHandle !== null) {
			window.clearTimeout(this.realtimeHandle);
		}
		const ms = Math.max(1, secs) * 1000;
		this.realtimeHandle = window.setTimeout(() => {
			this.realtimeHandle = null;
			if (this.syncing) return;
			this.runSync().catch((e) => log.error("realtime sync failed", e));
		}, ms);
	}

	rebuildClient(): void {
		if (this.settings.apiToken && this.settings.serverUrl) {
			this.client = new SeafileClient({
				serverUrl: this.settings.serverUrl,
				token: this.settings.apiToken,
			});
		} else {
			this.client = null;
		}
	}

	async runSync(): Promise<void> {
		if (this.syncing) {
			new Notice("Sync already in progress.");
			return;
		}
		if (!this.client) {
			new Notice("Configure a seafile token in settings first");
			return;
		}
		if (!this.settings.repoId) {
			new Notice("Pick a seafile library in settings first");
			return;
		}
		this.syncing = true;
		try {
			const engine = new SyncEngine(this.app, this.client);
			const summary = await engine.sync(
				{
					repoId: this.settings.repoId,
					syncRoot: this.settings.syncRoot,
					excludes: this.settings.extraExcludes,
					trashDir: this.settings.trashEnabled
						? `${this.manifest.dir ?? `${this.app.vault.configDir}/plugins/obsidian-seafile-sync`}/trash`
						: null,
					trashRetentionDays: this.settings.trashRetentionDays,
					baseDir: `${this.manifest.dir ?? `${this.app.vault.configDir}/plugins/obsidian-seafile-sync`}/basecache`,
					smartMerge: this.settings.smartMerge,
				},
				this.records,
				{
					onProgress: (done, total, path) => {
						this.status.set({ kind: "syncing", done, total });
						if (path) log.debug("progress", done, "/", total, path);
					},
					onLog: (line) => log.info(line),
					resolveConflict: (p) => promptConflict(this.app, p),
					persistRecords: async () => {
						await this.saveAll();
					},
				},
			);
			if (summary.tokenInvalid) {
				this.status.set({ kind: "error", message: "token invalid" });
				new Notice("Seafile token is invalid. Re-paste it in settings.");
				return;
			}
			this.settings.lastSyncAt = Date.now();
			await this.saveAll();
			this.status.set({ kind: "idle", lastSyncAt: this.settings.lastSyncAt });
			const errN = summary.errors.length;
			if (errN > 0) {
				new Notice(`Sync finished with ${errN} error(s). See console.`);
			} else {
				new Notice(`Sync complete: ${summary.executed} task(s).`);
			}
		} catch (e) {
			if (e instanceof TokenInvalidError) {
				this.status.set({ kind: "error", message: "token invalid" });
				new Notice("Seafile token is invalid. Re-paste it in settings.");
			} else {
				const msg = (e as Error).message;
				log.error(e);
				this.status.set({ kind: "error", message: msg });
				new Notice(`Sync failed: ${msg}`);
			}
		} finally {
			this.syncing = false;
		}
	}

	async loadAll(): Promise<void> {
		const raw = (await this.loadData()) as Partial<PersistedData> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, raw?.settings ?? {});
		this.records = raw?.records ?? {};
	}

	async saveAll(): Promise<void> {
		const data: PersistedData = { settings: this.settings, records: this.records };
		await this.saveData(data);
	}
}
