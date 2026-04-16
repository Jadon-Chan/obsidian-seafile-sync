export type SyncTask =
	| { kind: "upload"; vaultPath: string }
	| { kind: "download"; vaultPath: string }
	| { kind: "delete-local"; vaultPath: string }
	| { kind: "delete-remote"; vaultPath: string }
	| { kind: "drop-record"; vaultPath: string }
	| { kind: "conflict"; vaultPath: string };

const ORDER: Record<SyncTask["kind"], number> = {
	upload: 0,
	download: 1,
	"delete-local": 2,
	"delete-remote": 3,
	"drop-record": 4,
	conflict: 5,
};

export function sortTasks(tasks: SyncTask[]): SyncTask[] {
	return [...tasks].sort((a, b) => {
		const d = ORDER[a.kind] - ORDER[b.kind];
		if (d !== 0) return d;
		return a.vaultPath.localeCompare(b.vaultPath);
	});
}
