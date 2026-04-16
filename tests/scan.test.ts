import { describe, expect, it } from "vitest";
import { mergeForDecision } from "../src/sync/scan";
import { SyncRecord } from "../src/sync/syncRecord";

const rec: SyncRecord = {
	localMtime: 1,
	remoteMtime: 1,
	localSize: 1,
	remoteSize: 1,
	fileId: "x",
};

describe("mergeForDecision", () => {
	it("unions keys across the three sources", () => {
		const local = new Map([["a.md", { mtime: 1, size: 1 }]]);
		const remote = new Map([
			["b.md", { mtime: 1, size: 1, fileId: "r" }],
		]);
		const records = { "c.md": rec };
		const merged = mergeForDecision(local, remote, records);
		const paths = merged.map((m) => m.vaultPath).sort();
		expect(paths).toEqual(["a.md", "b.md", "c.md"]);
	});

	it("tags each entry with the right sources", () => {
		const local = new Map([["a.md", { mtime: 5, size: 5 }]]);
		const remote = new Map([
			["a.md", { mtime: 7, size: 7, fileId: "r" }],
		]);
		const records = { "a.md": rec };
		const [entry] = mergeForDecision(local, remote, records);
		expect(entry.local).toEqual({ mtime: 5, size: 5 });
		expect(entry.remote).toEqual({ mtime: 7, size: 7, fileId: "r" });
		expect(entry.record).toBe(rec);
	});

	it("entries not present in a source are undefined", () => {
		const local = new Map([["a.md", { mtime: 1, size: 1 }]]);
		const remote = new Map<string, { mtime: number; size: number; fileId: string }>();
		const [entry] = mergeForDecision(local, remote, {});
		expect(entry.remote).toBeUndefined();
		expect(entry.record).toBeUndefined();
	});
});
