import { App } from "obsidian";
import { SeafileClient } from "../api/client";
import { isExcluded, seafileToVault, normalizeSeafilePath } from "../utils/paths";
import { FileState } from "./decide";
import { SyncRecordMap } from "./syncRecord";

export async function scanLocal(
	app: App,
	extraExcludes: string[] = [],
): Promise<Map<string, FileState>> {
	const out = new Map<string, FileState>();
	const files = app.vault.getFiles();
	for (const f of files) {
		if (isExcluded(f.path, extraExcludes)) continue;
		const stat = await app.vault.adapter.stat(f.path);
		if (!stat) continue;
		out.set(f.path, { mtime: stat.mtime, size: stat.size });
	}
	return out;
}

export async function scanRemote(
	client: SeafileClient,
	repoId: string,
	root: string,
	extraExcludes: string[] = [],
): Promise<Map<string, FileState & { fileId: string }>> {
	const out = new Map<string, FileState & { fileId: string }>();
	const normRoot = normalizeSeafilePath(root);
	await walk(client, repoId, normRoot, normRoot, out, extraExcludes);
	return out;
}

async function walk(
	client: SeafileClient,
	repoId: string,
	root: string,
	dir: string,
	sink: Map<string, FileState & { fileId: string }>,
	extraExcludes: string[],
): Promise<void> {
	const entries = await client.listDir(repoId, dir);
	for (const e of entries) {
		const full = dir === "/" ? `/${e.name}` : `${dir}/${e.name}`;
		if (e.type === "file") {
			const vp = seafileToVault(root, full);
			if (!vp) continue;
			if (isExcluded(vp, extraExcludes)) continue;
			sink.set(vp, {
				mtime: e.mtime * 1000,
				size: e.size ?? 0,
				fileId: e.id,
			});
		} else {
			const vpDir = seafileToVault(root, full);
			// Skip whole subtrees that match a prefix exclude.
			if (vpDir && isExcluded(vpDir + "/", extraExcludes)) continue;
			await walk(client, repoId, root, full, sink, extraExcludes);
		}
	}
}

export interface MergedEntry {
	vaultPath: string;
	local?: FileState;
	remote?: FileState & { fileId: string };
	record?: SyncRecordMap[string];
}

export function mergeForDecision(
	local: Map<string, FileState>,
	remote: Map<string, FileState & { fileId: string }>,
	records: SyncRecordMap,
): MergedEntry[] {
	const all = new Set<string>();
	for (const k of local.keys()) all.add(k);
	for (const k of remote.keys()) all.add(k);
	for (const k of Object.keys(records)) all.add(k);

	const out: MergedEntry[] = [];
	for (const p of all) {
		out.push({
			vaultPath: p,
			local: local.get(p),
			remote: remote.get(p),
			record: records[p],
		});
	}
	return out;
}
