import { App, normalizePath } from "obsidian";
import { stripLeadingSlash } from "./paths";
import { log } from "./logger";

function cachePath(baseDir: string, vaultPath: string): string {
	return normalizePath(
		`${stripLeadingSlash(baseDir)}/${stripLeadingSlash(vaultPath)}`,
	);
}

async function ensureFolder(app: App, dir: string): Promise<void> {
	if (!dir) return;
	const norm = normalizePath(dir);
	if (await app.vault.adapter.exists(norm)) return;
	await app.vault.adapter.mkdir(norm);
}

export async function writeBaseSnapshot(
	app: App,
	baseDir: string,
	vaultPath: string,
	data: ArrayBuffer,
): Promise<void> {
	try {
		const dest = cachePath(baseDir, vaultPath);
		const idx = dest.lastIndexOf("/");
		if (idx > 0) await ensureFolder(app, dest.slice(0, idx));
		await app.vault.adapter.writeBinary(dest, data);
	} catch (e) {
		log.warn("base snapshot write failed", vaultPath, e);
	}
}

export async function readBaseSnapshot(
	app: App,
	baseDir: string,
	vaultPath: string,
): Promise<ArrayBuffer | null> {
	const p = cachePath(baseDir, vaultPath);
	try {
		if (!(await app.vault.adapter.exists(p))) return null;
		return await app.vault.adapter.readBinary(p);
	} catch (e) {
		log.warn("base snapshot read failed", vaultPath, e);
		return null;
	}
}
