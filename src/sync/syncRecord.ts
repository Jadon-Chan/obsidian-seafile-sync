// Per-file state captured at the end of the last successful sync.
// Matches design.md §5.2.1.

export interface SyncRecord {
	localMtime: number;
	remoteMtime: number;
	localSize: number;
	remoteSize: number;
	fileId: string;
	localHash?: string;
}

export type SyncRecordMap = Record<string, SyncRecord>;
