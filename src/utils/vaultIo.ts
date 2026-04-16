// Path-aware vault I/O. Files under the vault config directory (.obsidian/)
// are hidden from app.vault.getFiles() and have no TFile, so we route those
// through the data adapter directly. Regular vault files prefer the TFile API
// so Obsidian's in-memory caches stay coherent.

import { App, TFile, TFolder, normalizePath } from "obsidian";
import { isUnderConfigDir, stripLeadingSlash } from "./paths";

export async function readBytes(app: App, vaultPath: string): Promise<ArrayBuffer> {
	if (isUnderConfigDir(vaultPath)) {
		return app.vault.adapter.readBinary(vaultPath);
	}
	const f = app.vault.getAbstractFileByPath(vaultPath);
	if (f instanceof TFile) return app.vault.readBinary(f);
	return app.vault.adapter.readBinary(vaultPath);
}

export async function writeBytes(
	app: App,
	vaultPath: string,
	data: ArrayBuffer,
): Promise<void> {
	const norm = normalizePath(stripLeadingSlash(vaultPath));
	await ensureParent(app, norm);
	if (isUnderConfigDir(norm)) {
		await app.vault.adapter.writeBinary(norm, data);
		return;
	}
	const existing = app.vault.getAbstractFileByPath(norm);
	if (existing instanceof TFile) {
		await app.vault.modifyBinary(existing, data);
	} else {
		await app.vault.createBinary(norm, data);
	}
}

export async function existsAt(app: App, vaultPath: string): Promise<boolean> {
	if (isUnderConfigDir(vaultPath)) return app.vault.adapter.exists(vaultPath);
	const f = app.vault.getAbstractFileByPath(vaultPath);
	if (f instanceof TFile) return true;
	return app.vault.adapter.exists(vaultPath);
}

export async function statAt(
	app: App,
	vaultPath: string,
): Promise<{ mtime: number; size: number } | null> {
	const s = await app.vault.adapter.stat(vaultPath);
	if (!s) return null;
	return { mtime: s.mtime, size: s.size };
}

export async function deleteAt(app: App, vaultPath: string): Promise<void> {
	if (isUnderConfigDir(vaultPath)) {
		if (await app.vault.adapter.exists(vaultPath)) {
			await app.vault.adapter.remove(vaultPath);
		}
		return;
	}
	const f = app.vault.getAbstractFileByPath(vaultPath);
	if (f instanceof TFile) {
		await app.fileManager.trashFile(f);
	}
}

export async function ensureDirRecursive(app: App, dir: string): Promise<void> {
	if (!dir) return;
	const norm = normalizePath(dir);
	if (await app.vault.adapter.exists(norm)) return;
	const idx = norm.lastIndexOf("/");
	if (idx > 0) await ensureDirRecursive(app, norm.slice(0, idx));
	await app.vault.adapter.mkdir(norm);
}

async function ensureParent(app: App, vaultPath: string): Promise<void> {
	const idx = vaultPath.lastIndexOf("/");
	if (idx <= 0) return;
	const dir = vaultPath.slice(0, idx);
	if (isUnderConfigDir(dir)) {
		await ensureDirRecursive(app, dir);
		return;
	}
	const found = app.vault.getAbstractFileByPath(dir);
	if (found instanceof TFolder) return;
	if (!found) {
		await app.vault.createFolder(dir);
	}
}
