import { describe, expect, it } from "vitest";
import { sortTasks, SyncTask } from "../src/sync/tasks";

describe("sortTasks", () => {
	it("orders by kind priority: upload → download → delete-local → delete-remote → drop-record → conflict", () => {
		const tasks: SyncTask[] = [
			{ kind: "conflict", vaultPath: "a" },
			{ kind: "drop-record", vaultPath: "a" },
			{ kind: "delete-remote", vaultPath: "a" },
			{ kind: "delete-local", vaultPath: "a" },
			{ kind: "download", vaultPath: "a" },
			{ kind: "upload", vaultPath: "a" },
		];
		const kinds = sortTasks(tasks).map((t) => t.kind);
		expect(kinds).toEqual([
			"upload",
			"download",
			"delete-local",
			"delete-remote",
			"drop-record",
			"conflict",
		]);
	});

	it("breaks ties by vaultPath lexicographically", () => {
		const tasks: SyncTask[] = [
			{ kind: "upload", vaultPath: "zeta.md" },
			{ kind: "upload", vaultPath: "alpha.md" },
			{ kind: "upload", vaultPath: "mid.md" },
		];
		const paths = sortTasks(tasks).map((t) => t.vaultPath);
		expect(paths).toEqual(["alpha.md", "mid.md", "zeta.md"]);
	});

	it("does not mutate the input array", () => {
		const tasks: SyncTask[] = [
			{ kind: "conflict", vaultPath: "a" },
			{ kind: "upload", vaultPath: "a" },
		];
		const snapshot = tasks.map((t) => t.kind);
		sortTasks(tasks);
		expect(tasks.map((t) => t.kind)).toEqual(snapshot);
	});
});
