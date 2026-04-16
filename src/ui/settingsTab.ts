import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { SeafileClient } from "../api/client";
import { SeafileRepo, TokenInvalidError } from "../api/types";
import type SeafileSyncPlugin from "../main";

export class SeafileSettingsTab extends PluginSettingTab {
	private repos: SeafileRepo[] = [];

	constructor(app: App, private readonly plugin: SeafileSyncPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Seafile account" });
		containerEl.createEl("p", {
			text:
				"Generate an API token from your Seafile profile page and paste it below. " +
				"On Tsinghua Cloud: sign in at cloud.tsinghua.edu.cn (Tsinghua SSO), " +
				"open your profile, then copy the API token.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Server URL")
			.setDesc("Seafile server root. Default is cloud.tsinghua.edu.cn.")
			.addText((t) =>
				t
					.setPlaceholder("https://cloud.tsinghua.edu.cn")
					.setValue(this.plugin.settings.serverUrl)
					.onChange(async (v) => {
						this.plugin.settings.serverUrl = v.trim();
						await this.plugin.saveAll();
					}),
			);

		new Setting(containerEl)
			.setName("API token")
			.setDesc("Stored locally in this plugin's data.json.")
			.addText((t) => {
				t.inputEl.type = "password";
				t.setPlaceholder("paste token here")
					.setValue(this.plugin.settings.apiToken)
					.onChange(async (v) => {
						this.plugin.settings.apiToken = v.trim();
						await this.plugin.saveAll();
						this.plugin.rebuildClient();
					});
			});

		new Setting(containerEl)
			.setName("Test connection")
			.setDesc(
				this.plugin.settings.accountEmail
					? `Signed in as ${this.plugin.settings.accountEmail}`
					: "Verify the token and load your libraries.",
			)
			.addButton((b) =>
				b.setButtonText("Test").onClick(async () => {
					await this.testConnection();
					this.display();
				}),
			)
			.addButton((b) =>
				b.setButtonText("Clear token").onClick(async () => {
					this.plugin.settings.apiToken = "";
					this.plugin.settings.accountEmail = "";
					this.plugin.settings.repoId = "";
					this.plugin.settings.repoName = "";
					await this.plugin.saveAll();
					this.plugin.rebuildClient();
					this.display();
				}),
			);

		containerEl.createEl("h2", { text: "Library" });

		const repoSetting = new Setting(containerEl)
			.setName("Seafile library")
			.setDesc("The Seafile library (repo) to sync with.");
		repoSetting.addDropdown((d) => {
			d.addOption("", "— select —");
			for (const r of this.repos) d.addOption(r.id, r.name);
			if (this.plugin.settings.repoId) {
				d.addOption(
					this.plugin.settings.repoId,
					this.plugin.settings.repoName || this.plugin.settings.repoId,
				);
			}
			d.setValue(this.plugin.settings.repoId).onChange(async (v) => {
				this.plugin.settings.repoId = v;
				this.plugin.settings.repoName =
					this.repos.find((r) => r.id === v)?.name ?? "";
				await this.plugin.saveAll();
			});
		});

		new Setting(containerEl)
			.setName("Sync root")
			.setDesc('Path inside the library. Use "/" for the library root.')
			.addText((t) =>
				t
					.setPlaceholder("/")
					.setValue(this.plugin.settings.syncRoot)
					.onChange(async (v) => {
						this.plugin.settings.syncRoot = v.trim() || "/";
						await this.plugin.saveAll();
					}),
			);

		new Setting(containerEl)
			.setName("Auto-sync interval")
			.setDesc("Minutes between automatic syncs. 0 disables it.")
			.addText((t) => {
				t.inputEl.type = "number";
				t.setValue(String(this.plugin.settings.autoSyncMinutes)).onChange(
					async (v) => {
						const n = Math.max(0, Math.floor(Number(v) || 0));
						this.plugin.settings.autoSyncMinutes = n;
						await this.plugin.saveAll();
						this.plugin.scheduleAutoSync();
					},
				);
			});

		new Setting(containerEl)
			.setName("Real-time sync delay")
			.setDesc(
				"Seconds of idle after a vault change before auto-syncing. 0 disables it.",
			)
			.addText((t) => {
				t.inputEl.type = "number";
				t.setValue(String(this.plugin.settings.realtimeSyncSeconds)).onChange(
					async (v) => {
						const n = Math.max(0, Math.floor(Number(v) || 0));
						this.plugin.settings.realtimeSyncSeconds = n;
						await this.plugin.saveAll();
					},
				);
			});

		new Setting(containerEl)
			.setName("Smart merge (text files)")
			.setDesc(
				"On conflict, try a three-way line merge before prompting. Falls back to the modal if the merge has conflicting hunks or either side is binary.",
			)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.smartMerge).onChange(async (v) => {
					this.plugin.settings.smartMerge = v;
					await this.plugin.saveAll();
				}),
			);

		new Setting(containerEl)
			.setName("Local trash")
			.setDesc(
				"Stash a copy of local files under the plugin folder before they are overwritten or deleted by a sync.",
			)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.trashEnabled).onChange(async (v) => {
					this.plugin.settings.trashEnabled = v;
					await this.plugin.saveAll();
				}),
			);

		new Setting(containerEl)
			.setName("Trash retention (days)")
			.setDesc("Trash snapshots older than this are pruned at sync start. 0 = keep forever.")
			.addText((t) => {
				t.inputEl.type = "number";
				t.setValue(String(this.plugin.settings.trashRetentionDays)).onChange(
					async (v) => {
						const n = Math.max(0, Math.floor(Number(v) || 0));
						this.plugin.settings.trashRetentionDays = n;
						await this.plugin.saveAll();
					},
				);
			});

		new Setting(containerEl)
			.setName("Extra excludes")
			.setDesc(
				"One pattern per line. Supports literal prefixes (drafts/) and globs (**/*.png, templates/**). .obsidian/, .trash/, .git/ are always excluded.",
			)
			.addTextArea((t) => {
				t.inputEl.rows = 4;
				t.setValue(this.plugin.settings.extraExcludes.join("\n")).onChange(
					async (v) => {
						this.plugin.settings.extraExcludes = v
							.split("\n")
							.map((x) => x.trim())
							.filter((x) => x.length > 0);
						await this.plugin.saveAll();
					},
				);
			});

		const last = this.plugin.settings.lastSyncAt;
		containerEl.createEl("p", {
			text: `Last sync: ${last ? new Date(last).toLocaleString() : "never"}`,
			cls: "setting-item-description",
		});
	}

	private async testConnection(): Promise<void> {
		const s = this.plugin.settings;
		if (!s.apiToken) {
			new Notice("Paste a token first.");
			return;
		}
		const client = new SeafileClient({ serverUrl: s.serverUrl, token: s.apiToken });
		try {
			const [info, repos] = await Promise.all([
				client.accountInfo(),
				client.listRepos(),
			]);
			this.repos = repos;
			this.plugin.settings.accountEmail = info.email;
			await this.plugin.saveAll();
			this.plugin.rebuildClient();
			new Notice(`Connected as ${info.email}. ${repos.length} librar(ies) found.`);
		} catch (e) {
			if (e instanceof TokenInvalidError) {
				new Notice("Token rejected. Generate a new one and paste it again.");
			} else {
				new Notice(`Connection failed: ${(e as Error).message}`);
			}
		}
	}
}
