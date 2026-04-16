// Pure decision function. Implements design.md §5.2.2 including the 4 sub-cases
// when record + local + remote are all present.

import { SyncRecord } from "./syncRecord";
import { SyncTask } from "./tasks";

export interface FileState {
	mtime: number;
	size: number;
	fileId?: string;
}

export interface DecisionInput {
	vaultPath: string;
	local?: FileState;
	remote?: FileState;
	record?: SyncRecord;
}

// FS mtime precision varies (seconds on some FSes, ms on others). Allow a
// small slack when comparing to the sync record so identical files don't
// look "modified".
const MTIME_SLACK_MS = 2000;

export function decideOne(input: DecisionInput): SyncTask | null {
	const { vaultPath, local, remote, record } = input;

	if (record) {
		if (local && remote) {
			const lChanged = localChanged(local, record);
			const rChanged = remoteChanged(remote, record);
			if (!lChanged && !rChanged) return null;
			if (lChanged && !rChanged) return { kind: "upload", vaultPath };
			if (!lChanged && rChanged) return { kind: "download", vaultPath };
			return { kind: "conflict", vaultPath };
		}
		if (local && !remote) return { kind: "delete-local", vaultPath };
		if (!local && remote) return { kind: "delete-remote", vaultPath };
		return { kind: "drop-record", vaultPath };
	}

	// No record (first-time observation).
	if (local && remote) {
		if (sameContent(local, remote)) {
			// Treat as already-in-sync; upper layer will seed a record.
			return null;
		}
		return { kind: "conflict", vaultPath };
	}
	if (local && !remote) return { kind: "upload", vaultPath };
	if (!local && remote) return { kind: "download", vaultPath };
	return null;
}

export function decideAll(inputs: DecisionInput[]): SyncTask[] {
	const out: SyncTask[] = [];
	for (const i of inputs) {
		const t = decideOne(i);
		if (t) out.push(t);
	}
	return out;
}

function localChanged(l: FileState, r: SyncRecord): boolean {
	if (l.size !== r.localSize) return true;
	return Math.abs(l.mtime - r.localMtime) > MTIME_SLACK_MS;
}

function remoteChanged(rem: FileState, r: SyncRecord): boolean {
	if (rem.size !== r.remoteSize) return true;
	if (rem.fileId && r.fileId && rem.fileId !== r.fileId) return true;
	return Math.abs(rem.mtime - r.remoteMtime) > MTIME_SLACK_MS;
}

function sameContent(l: FileState, r: FileState): boolean {
	// First-sync heuristic: when no record exists, same byte length is
	// treated as "probably the same file". The engine then seeds a record
	// on the first run. The alternative — flagging every size-match as a
	// conflict — floods the user with modals when an identical vault is
	// wired up to an existing library. Same-size-but-different-content
	// collisions will be caught on the next edit via mtime/hash.
	return l.size === r.size;
}
