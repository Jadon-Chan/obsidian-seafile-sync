import { describe, expect, it } from "vitest";
import { decideOne, DecisionInput } from "../src/sync/decide";
import { SyncRecord } from "../src/sync/syncRecord";

const recOf = (o: Partial<SyncRecord> = {}): SyncRecord => ({
	localMtime: 1_000_000,
	remoteMtime: 1_000_000,
	localSize: 100,
	remoteSize: 100,
	fileId: "abc",
	...o,
});

const fs = (mtime: number, size: number, fileId?: string) => ({
	mtime,
	size,
	...(fileId !== undefined ? { fileId } : {}),
});

function d(p: Partial<DecisionInput> = {}): DecisionInput {
	return { vaultPath: "a.md", ...p };
}

describe("decideOne — primary matrix (design.md §5.2.2)", () => {
	it("record + local + remote, neither changed → null", () => {
		expect(
			decideOne(
				d({
					local: fs(1_000_000, 100),
					remote: fs(1_000_000, 100, "abc"),
					record: recOf(),
				}),
			),
		).toBeNull();
	});

	it("record + local + remote, local changed → upload", () => {
		expect(
			decideOne(
				d({
					local: fs(2_000_000, 120),
					remote: fs(1_000_000, 100, "abc"),
					record: recOf(),
				}),
			),
		).toEqual({ kind: "upload", vaultPath: "a.md" });
	});

	it("record + local + remote, remote changed → download", () => {
		expect(
			decideOne(
				d({
					local: fs(1_000_000, 100),
					remote: fs(2_000_000, 150, "xyz"),
					record: recOf(),
				}),
			),
		).toEqual({ kind: "download", vaultPath: "a.md" });
	});

	it("record + local + remote, both changed → conflict", () => {
		expect(
			decideOne(
				d({
					local: fs(2_000_000, 120),
					remote: fs(3_000_000, 150, "xyz"),
					record: recOf(),
				}),
			),
		).toEqual({ kind: "conflict", vaultPath: "a.md" });
	});

	it("record + local, no remote → delete local", () => {
		expect(
			decideOne(d({ local: fs(1_000_000, 100), record: recOf() })),
		).toEqual({ kind: "delete-local", vaultPath: "a.md" });
	});

	it("record + remote, no local → delete remote", () => {
		expect(
			decideOne(d({ remote: fs(1_000_000, 100, "abc"), record: recOf() })),
		).toEqual({ kind: "delete-remote", vaultPath: "a.md" });
	});

	it("record only → drop record", () => {
		expect(decideOne(d({ record: recOf() }))).toEqual({
			kind: "drop-record",
			vaultPath: "a.md",
		});
	});

	it("local only, no record → upload", () => {
		expect(decideOne(d({ local: fs(1_000_000, 100) }))).toEqual({
			kind: "upload",
			vaultPath: "a.md",
		});
	});

	it("remote only, no record → download", () => {
		expect(decideOne(d({ remote: fs(1_000_000, 100, "abc") }))).toEqual({
			kind: "download",
			vaultPath: "a.md",
		});
	});

	it("local + remote, no record, different sizes → conflict", () => {
		expect(
			decideOne(
				d({
					local: fs(1_000_000, 100),
					remote: fs(1_000_000, 200, "abc"),
				}),
			),
		).toEqual({ kind: "conflict", vaultPath: "a.md" });
	});

	it("local + remote, no record, same size → null (will be seeded)", () => {
		expect(
			decideOne(
				d({
					local: fs(1_000_000, 100),
					remote: fs(1_000_000, 100, "abc"),
				}),
			),
		).toBeNull();
	});

	it("no record, no local, no remote → null", () => {
		expect(decideOne(d())).toBeNull();
	});
});

describe("decideOne — mtime slack", () => {
	it("tolerates sub-second mtime drift", () => {
		expect(
			decideOne(
				d({
					local: fs(1_001_000, 100),
					remote: fs(1_000_500, 100, "abc"),
					record: recOf(),
				}),
			),
		).toBeNull();
	});
	it("detects remote change via fileId even if mtime matches", () => {
		expect(
			decideOne(
				d({
					local: fs(1_000_000, 100),
					remote: fs(1_000_000, 100, "different"),
					record: recOf(),
				}),
			),
		).toEqual({ kind: "download", vaultPath: "a.md" });
	});
});
