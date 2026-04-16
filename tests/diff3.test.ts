import { describe, expect, it } from "vitest";
import { diff3Merge, looksBinary } from "../src/utils/diff3";

describe("diff3Merge", () => {
	it("returns either side when local == remote", () => {
		const r = diff3Merge("a\nb\n", "a\nb\nc\n", "a\nb\nc\n");
		expect(r.conflict).toBe(false);
		expect(r.text).toBe("a\nb\nc\n");
	});

	it("takes remote when only remote changed", () => {
		const r = diff3Merge("a\nb\nc\n", "a\nb\nc\n", "a\nB\nc\n");
		expect(r.conflict).toBe(false);
		expect(r.text).toBe("a\nB\nc\n");
	});

	it("takes local when only local changed", () => {
		const r = diff3Merge("a\nb\nc\n", "a\nB\nc\n", "a\nb\nc\n");
		expect(r.conflict).toBe(false);
		expect(r.text).toBe("a\nB\nc\n");
	});

	it("merges non-overlapping changes from both sides", () => {
		// base = 1..5, local edits line 2, remote edits line 4
		const base = "1\n2\n3\n4\n5\n";
		const local = "1\nTWO\n3\n4\n5\n";
		const remote = "1\n2\n3\nFOUR\n5\n";
		const r = diff3Merge(base, local, remote);
		expect(r.conflict).toBe(false);
		expect(r.text).toBe("1\nTWO\n3\nFOUR\n5\n");
	});

	it("merges inserts in different regions", () => {
		const base = "a\nb\nc\n";
		const local = "a\nLOCAL\nb\nc\n";
		const remote = "a\nb\nc\nREMOTE\n";
		const r = diff3Merge(base, local, remote);
		expect(r.conflict).toBe(false);
		expect(r.text).toBe("a\nLOCAL\nb\nc\nREMOTE\n");
	});

	it("flags conflict when both sides edit the same line differently", () => {
		const base = "a\nb\nc\n";
		const local = "a\nLOCAL\nc\n";
		const remote = "a\nREMOTE\nc\n";
		const r = diff3Merge(base, local, remote);
		expect(r.conflict).toBe(true);
		expect(r.text).toContain("<<<<<<< LOCAL");
		expect(r.text).toContain("LOCAL");
		expect(r.text).toContain("=======");
		expect(r.text).toContain("REMOTE");
		expect(r.text).toContain(">>>>>>> REMOTE");
	});

	it("accepts identical edits from both sides without conflict", () => {
		const base = "a\nb\nc\n";
		const local = "a\nSAME\nc\n";
		const remote = "a\nSAME\nc\n";
		const r = diff3Merge(base, local, remote);
		expect(r.conflict).toBe(false);
		expect(r.text).toBe("a\nSAME\nc\n");
	});

	it("preserves trailing-newline absence from local", () => {
		const r = diff3Merge("a\nb", "a\nB", "a\nb");
		expect(r.conflict).toBe(false);
		expect(r.text).toBe("a\nB");
	});
});

describe("looksBinary", () => {
	it("returns false for plain text", () => {
		const bytes = new TextEncoder().encode("hello world");
		expect(looksBinary(bytes.buffer as ArrayBuffer)).toBe(false);
	});
	it("returns true when a null byte is present", () => {
		const bytes = new Uint8Array([1, 2, 0, 4]);
		expect(looksBinary(bytes.buffer as ArrayBuffer)).toBe(true);
	});
});
