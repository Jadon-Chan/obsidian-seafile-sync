import { App, TFile, normalizePath } from "obsidian";
import { stripLeadingSlash } from "./paths";
import { log } from "./logger";

// Format a Date as YYYYMMDD-HHMMSS in local time.
function stampDir(d: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return (
		`${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
		`-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
	);
}

function parseStampDir(name: string): number | null {
	const m = name.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
	if (!m) return null;
	const [, y, mo, da, h, mi, se] = m;
	const t = new Date(
		Number(y), Number(mo) - 1, Number(da),
		Number(h), Number(mi), Number(se),
	).getTime();
	return Number.isFinite(t) ? t : null;
}

async function ensureFolder(app: App, dir: string): Promise<void> {
	if (!dir) return;
	const norm = normalizePath(dir);
	if (await app.vault.adapter.exists(norm)) return;
	// Create parents recursively via vault.adapter.mkdir (idempotent on Obsidian).
	await app.vault.adapter.mkdir(norm);
}

// Copy the current contents of a vault file into the trash tree before the
// sync engine overwrites or deletes it. No-op if the file doesn't exist.
export async function stashLocal(
	app: App,
	trashBase: string,
	vaultPath: string,
	stampBase: Date,
): Promise<void> {
	try {
		const abs = app.vault.getAbstractFileByPath(vaultPath);
		if (!(abs instanceof TFile)) return;
		const data = await app.vault.readBinary(abs);
		const dest = normalizePath(
			`${stripLeadingSlash(trashBase)}/${stampDir(stampBase)}/${stripLeadingSlash(vaultPath)}`,
		);
		const idx = dest.lastIndexOf("/");
		if (idx > 0) await ensureFolder(app, dest.slice(0, idx));
		await app.vault.adapter.writeBinary(dest, data);
	} catch (e) {
		log.warn("trash stash failed", vaultPath, e);
	}
}

// Remove trash subfolders whose timestamp is older than `retentionDays`.
// retentionDays <= 0 means keep forever.
export async function pruneTrash(
	app: App,
	trashBase: string,
	retentionDays: number,
): Promise<void> {
	if (retentionDays <= 0) return;
	const base = normalizePath(stripLeadingSlash(trashBase));
	if (!(await app.vault.adapter.exists(base))) return;
	const cutoff = Date.now() - retentionDays * 86_400_000;
	try {
		const listing = await app.vault.adapter.list(base);
		for (const folder of listing.folders) {
			const name = folder.split("/").pop() ?? "";
			const t = parseStampDir(name);
			if (t !== null && t < cutoff) {
				try {
					await app.vault.adapter.rmdir(folder, true);
				} catch (e) {
					log.warn("trash prune failed", folder, e);
				}
			}
		}
	} catch (e) {
		log.warn("trash list failed", base, e);
	}
}
