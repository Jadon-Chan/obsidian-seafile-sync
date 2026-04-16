import { App, Modal } from "obsidian";
import { ConflictResolution, ConflictStrategy } from "../sync/conflict";

export class ConflictModal extends Modal {
	private resolved = false;
	private applyToAll = false;
	constructor(
		app: App,
		private readonly vaultPath: string,
		private readonly onChoose: (res: ConflictResolution) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Sync conflict" });
		contentEl.createEl("p", {
			text: `Both copies of "${this.vaultPath}" changed since the last sync. Choose how to resolve:`,
		});

		const row = contentEl.createDiv({ cls: "seafile-sync-conflict-buttons" });

		const mkBtn = (label: string, choice: ConflictStrategy) => {
			const b = row.createEl("button", { text: label });
			b.onclick = () => this.choose(choice);
		};
		mkBtn("Keep local", "keep-local");
		mkBtn("Keep remote", "keep-remote");
		mkBtn("Keep both", "keep-both");

		const applyRow = contentEl.createDiv({ cls: "seafile-sync-conflict-apply-all" });
		const cb = applyRow.createEl("input", { type: "checkbox" });
		cb.id = "seafile-sync-apply-all";
		cb.onchange = () => {
			this.applyToAll = cb.checked;
		};
		const label = applyRow.createEl("label", {
			text: " Apply this choice to all remaining conflicts in this sync",
		});
		label.htmlFor = cb.id;

		const cancel = contentEl.createEl("button", {
			text: "Skip this file",
			cls: "seafile-sync-conflict-skip",
		});
		cancel.onclick = () => this.choose("cancel");
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) {
			this.onChoose({ choice: "cancel", applyToAll: false });
		}
	}

	private choose(c: ConflictStrategy | "cancel"): void {
		this.resolved = true;
		this.onChoose({ choice: c, applyToAll: this.applyToAll });
		this.close();
	}
}

export function promptConflict(app: App, vaultPath: string): Promise<ConflictResolution> {
	return new Promise<ConflictResolution>((resolve) => {
		new ConflictModal(app, vaultPath, resolve).open();
	});
}
