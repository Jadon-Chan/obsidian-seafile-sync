import { App, TFile, TFolder, normalizePath } from "obsidian";
import { SeafileClient } from "../api/client";
import { TokenInvalidError } from "../api/types";
import { log } from "../utils/logger";
import {
	conflictName,
	parentDir,
	stripLeadingSlash,
	vaultToSeafile,
} from "../utils/paths";
import { sha1Hex } from "../utils/hash";
import { pruneTrash, stashLocal } from "../utils/trash";
import { readBaseSnapshot, writeBaseSnapshot } from "../utils/baseCache";
import { diff3Merge, looksBinary } from "../utils/diff3";
import { ConflictResolver, ConflictStrategy } from "./conflict";
import { decideAll } from "./decide";
import { mergeForDecision, scanLocal, scanRemote } from "./scan";
import { sortTasks, SyncTask } from "./tasks";
import { SyncRecord, SyncRecordMap } from "./syncRecord";

export interface EngineConfig {
	repoId: string;
	syncRoot: string;
	excludes: string[];
	trashDir: string | null;
	trashRetentionDays: number;
	baseDir: string | null;
	smartMerge: boolean;
}

export interface EngineCallbacks {
	onProgress?: (done: number, total: number, currentPath?: string) => void;
	onLog?: (line: string) => void;
	resolveConflict: ConflictResolver;
	persistRecords: (records: SyncRecordMap) => Promise<void>;
}

export interface SyncSummary {
	executed: number;
	skipped: number;
	errors: Array<{ path: string; message: string }>;
	tokenInvalid: boolean;
}

export class SyncEngine {
	private stickyConflictChoice: ConflictStrategy | null = null;
	private stashStamp: Date = new Date();

	private async stash(cfg: EngineConfig, vaultPath: string): Promise<void> {
		if (!cfg.trashDir) return;
		await stashLocal(this.app, cfg.trashDir, vaultPath, this.stashStamp);
	}

	constructor(
		private readonly app: App,
		private readonly client: SeafileClient,
	) {}

	async sync(
		cfg: EngineConfig,
		records: SyncRecordMap,
		cb: EngineCallbacks,
	): Promise<SyncSummary> {
		const summary: SyncSummary = { executed: 0, skipped: 0, errors: [], tokenInvalid: false };
		this.stickyConflictChoice = null;
		this.stashStamp = new Date();
		if (cfg.trashDir) {
			pruneTrash(this.app, cfg.trashDir, cfg.trashRetentionDays).catch(() => {});
		}
		try {
			const [local, remote] = await Promise.all([
				scanLocal(this.app, cfg.excludes),
				scanRemote(this.client, cfg.repoId, cfg.syncRoot, cfg.excludes),
			]);
			this.seedRecordsForExactMatches(local, remote, records);

			const merged = mergeForDecision(local, remote, records);
			const tasks = sortTasks(decideAll(merged));
			cb.onLog?.(`planned ${tasks.length} task(s)`);

			let done = 0;
			cb.onProgress?.(0, tasks.length);
			for (const task of tasks) {
				cb.onProgress?.(done, tasks.length, task.vaultPath);
				try {
					await this.execute(task, cfg, records, remote, cb);
					summary.executed++;
					await cb.persistRecords(records);
				} catch (e) {
					if (e instanceof TokenInvalidError) {
						summary.tokenInvalid = true;
						throw e;
					}
					const msg = (e as Error)?.message ?? String(e);
					log.error("task failed", task, e);
					summary.errors.push({ path: task.vaultPath, message: msg });
				}
				done++;
				cb.onProgress?.(done, tasks.length, task.vaultPath);
			}
			return summary;
		} catch (e) {
			if (e instanceof TokenInvalidError) {
				summary.tokenInvalid = true;
				return summary;
			}
			throw e;
		}
	}

	private seedRecordsForExactMatches(
		local: Map<string, { mtime: number; size: number }>,
		remote: Map<string, { mtime: number; size: number; fileId: string }>,
		records: SyncRecordMap,
	): void {
		for (const [p, l] of local) {
			if (records[p]) continue;
			const r = remote.get(p);
			if (!r) continue;
			if (l.size === r.size) {
				records[p] = {
					localMtime: l.mtime,
					remoteMtime: r.mtime,
					localSize: l.size,
					remoteSize: r.size,
					fileId: r.fileId,
				};
			}
		}
	}

	private async execute(
		task: SyncTask,
		cfg: EngineConfig,
		records: SyncRecordMap,
		remote: Map<string, { mtime: number; size: number; fileId: string }>,
		cb: EngineCallbacks,
	): Promise<void> {
		switch (task.kind) {
			case "drop-record":
				delete records[task.vaultPath];
				return;

			case "upload":
				await this.doUpload(task.vaultPath, cfg, records);
				return;

			case "download":
				await this.doDownload(task.vaultPath, cfg, records, remote);
				return;

			case "delete-local":
				await this.doDeleteLocal(task.vaultPath, records, cfg);
				return;

			case "delete-remote":
				await this.doDeleteRemote(task.vaultPath, cfg, records);
				return;

			case "conflict": {
				if (cfg.smartMerge && cfg.baseDir) {
					const merged = await this.trySmartMerge(task.vaultPath, cfg, records, remote);
					if (merged) {
						cb.onLog?.(`auto-merged ${task.vaultPath}`);
						return;
					}
				}
				let choice: ConflictStrategy | "cancel";
				if (this.stickyConflictChoice) {
					choice = this.stickyConflictChoice;
				} else {
					const res = await cb.resolveConflict(task.vaultPath);
					choice = res.choice;
					if (res.applyToAll && choice !== "cancel") {
						this.stickyConflictChoice = choice;
					}
				}
				if (choice === "cancel") return;
				if (choice === "keep-local") {
					await this.doUpload(task.vaultPath, cfg, records);
					return;
				}
				if (choice === "keep-remote") {
					await this.doDownload(task.vaultPath, cfg, records, remote);
					return;
				}
				// keep-both: download remote to a side file, leave local alone.
				const sidePath = conflictName(task.vaultPath);
				await this.doDownloadTo(task.vaultPath, sidePath, cfg);
				// Re-upload local to make remote match local so the base record
				// is clean for future syncs.
				await this.doUpload(task.vaultPath, cfg, records);
				return;
			}
		}
	}

	// Attempt a three-way merge for a conflict. Returns true if merged cleanly
	// (and the merged content has been uploaded + record updated); false means
	// caller should fall back to the user-driven resolver.
	private async trySmartMerge(
		vaultPath: string,
		cfg: EngineConfig,
		records: SyncRecordMap,
		remote: Map<string, { mtime: number; size: number; fileId: string }>,
	): Promise<boolean> {
		if (!cfg.baseDir) return false;
		const file = this.app.vault.getAbstractFileByPath(vaultPath);
		if (!(file instanceof TFile)) return false;
		const baseBytes = await readBaseSnapshot(this.app, cfg.baseDir, vaultPath);
		if (!baseBytes) return false;
		const localBytes = await this.app.vault.readBinary(file);
		const seafilePath = vaultToSeafile(cfg.syncRoot, vaultPath);
		const remoteBytes = await this.client.downloadFile(cfg.repoId, seafilePath);
		if (looksBinary(baseBytes) || looksBinary(localBytes) || looksBinary(remoteBytes)) {
			return false;
		}
		const dec = new TextDecoder("utf-8", { fatal: false });
		const result = diff3Merge(
			dec.decode(baseBytes),
			dec.decode(localBytes),
			dec.decode(remoteBytes),
		);
		if (result.conflict) return false;
		const mergedBytes = new TextEncoder().encode(result.text).buffer as ArrayBuffer;
		await this.stash(cfg, vaultPath);
		await this.writeVaultBinary(vaultPath, mergedBytes);
		await this.client.uploadFile(cfg.repoId, seafilePath, mergedBytes);
		const detail = await this.client.fileDetail(cfg.repoId, seafilePath);
		const stat = await this.app.vault.adapter.stat(vaultPath);
		const hash = await sha1Hex(mergedBytes);
		records[vaultPath] = {
			localMtime: stat?.mtime ?? Date.now(),
			remoteMtime: detail.mtime * 1000,
			localSize: stat?.size ?? mergedBytes.byteLength,
			remoteSize: detail.size,
			fileId: detail.id,
			localHash: hash,
		};
		// Refresh remote map so later tasks see post-merge state.
		remote.set(vaultPath, {
			mtime: detail.mtime * 1000,
			size: detail.size,
			fileId: detail.id,
		});
		await writeBaseSnapshot(this.app, cfg.baseDir, vaultPath, mergedBytes);
		return true;
	}

	// ---- Operations ------------------------------------------------------
	private async doUpload(
		vaultPath: string,
		cfg: EngineConfig,
		records: SyncRecordMap,
	): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(vaultPath);
		if (!(file instanceof TFile)) return;
		const data = await this.app.vault.readBinary(file);
		const hash = await sha1Hex(data);
		const prev = records[vaultPath];
		// Fast-path: file was only "touched" — same bytes as last sync. Skip
		// the upload and just refresh the record so next scan sees no change.
		if (prev?.localHash && prev.localHash === hash) {
			const stat = await this.app.vault.adapter.stat(vaultPath);
			records[vaultPath] = {
				...prev,
				localMtime: stat?.mtime ?? prev.localMtime,
				localSize: stat?.size ?? prev.localSize,
				localHash: hash,
			};
			return;
		}
		const seafilePath = vaultToSeafile(cfg.syncRoot, vaultPath);
		await this.client.ensureDir(cfg.repoId, parentDir(seafilePath));
		await this.client.uploadFile(cfg.repoId, seafilePath, data);
		const detail = await this.client.fileDetail(cfg.repoId, seafilePath);
		const stat = await this.app.vault.adapter.stat(vaultPath);
		if (cfg.baseDir) await writeBaseSnapshot(this.app, cfg.baseDir, vaultPath, data);
		const rec: SyncRecord = {
			localMtime: stat?.mtime ?? Date.now(),
			remoteMtime: detail.mtime * 1000,
			localSize: stat?.size ?? data.byteLength,
			remoteSize: detail.size,
			fileId: detail.id,
			localHash: hash,
		};
		records[vaultPath] = rec;
	}

	private async doDownload(
		vaultPath: string,
		cfg: EngineConfig,
		records: SyncRecordMap,
		remote: Map<string, { mtime: number; size: number; fileId: string }>,
	): Promise<void> {
		const seafilePath = vaultToSeafile(cfg.syncRoot, vaultPath);
		const bytes = await this.client.downloadFile(cfg.repoId, seafilePath);
		await this.stash(cfg, vaultPath);
		await this.writeVaultBinary(vaultPath, bytes);
		if (cfg.baseDir) await writeBaseSnapshot(this.app, cfg.baseDir, vaultPath, bytes);
		const stat = await this.app.vault.adapter.stat(vaultPath);
		const rem = remote.get(vaultPath);
		const hash = await sha1Hex(bytes);
		records[vaultPath] = {
			localMtime: stat?.mtime ?? Date.now(),
			remoteMtime: rem?.mtime ?? Date.now(),
			localSize: stat?.size ?? bytes.byteLength,
			remoteSize: rem?.size ?? bytes.byteLength,
			fileId: rem?.fileId ?? "",
			localHash: hash,
		};
	}

	private async doDownloadTo(
		srcVaultPath: string,
		destVaultPath: string,
		cfg: EngineConfig,
	): Promise<void> {
		const seafilePath = vaultToSeafile(cfg.syncRoot, srcVaultPath);
		const bytes = await this.client.downloadFile(cfg.repoId, seafilePath);
		await this.writeVaultBinary(destVaultPath, bytes);
	}

	private async doDeleteLocal(
		vaultPath: string,
		records: SyncRecordMap,
		cfg: EngineConfig,
	): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(vaultPath);
		if (file instanceof TFile) {
			await this.stash(cfg, vaultPath);
			await this.app.fileManager.trashFile(file);
		}
		delete records[vaultPath];
	}

	private async doDeleteRemote(
		vaultPath: string,
		cfg: EngineConfig,
		records: SyncRecordMap,
	): Promise<void> {
		const seafilePath = vaultToSeafile(cfg.syncRoot, vaultPath);
		await this.client.deleteFile(cfg.repoId, seafilePath);
		delete records[vaultPath];
	}

	private async writeVaultBinary(vaultPath: string, data: ArrayBuffer): Promise<void> {
		const normPath = normalizePath(stripLeadingSlash(vaultPath));
		await this.ensureVaultParent(normPath);
		const existing = this.app.vault.getAbstractFileByPath(normPath);
		if (existing instanceof TFile) {
			await this.app.vault.modifyBinary(existing, data);
		} else {
			await this.app.vault.createBinary(normPath, data);
		}
	}

	private async ensureVaultParent(vaultPath: string): Promise<void> {
		const idx = vaultPath.lastIndexOf("/");
		if (idx <= 0) return;
		const dir = vaultPath.slice(0, idx);
		const found = this.app.vault.getAbstractFileByPath(dir);
		if (found instanceof TFolder) return;
		if (!found) {
			await this.app.vault.createFolder(dir);
		}
	}
}
