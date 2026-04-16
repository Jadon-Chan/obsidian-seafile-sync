import { describe, expect, it } from "vitest";
import {
	basename,
	conflictName,
	isExcluded,
	normalizeSeafilePath,
	parentDir,
	seafileToVault,
	vaultToSeafile,
} from "../src/utils/paths";

describe("normalizeSeafilePath", () => {
	it("returns / for empty or slash", () => {
		expect(normalizeSeafilePath("")).toBe("/");
		expect(normalizeSeafilePath("/")).toBe("/");
	});
	it("prepends leading slash", () => {
		expect(normalizeSeafilePath("a/b")).toBe("/a/b");
	});
	it("collapses duplicate slashes and trims trailing", () => {
		expect(normalizeSeafilePath("///a//b//")).toBe("/a/b");
	});
});

describe("vaultToSeafile / seafileToVault", () => {
	it("root-rooted mapping", () => {
		expect(vaultToSeafile("/", "notes/a.md")).toBe("/notes/a.md");
		expect(seafileToVault("/", "/notes/a.md")).toBe("notes/a.md");
	});
	it("sub-root mapping", () => {
		expect(vaultToSeafile("/vault", "notes/a.md")).toBe("/vault/notes/a.md");
		expect(seafileToVault("/vault", "/vault/notes/a.md")).toBe("notes/a.md");
	});
	it("handles unicode filenames", () => {
		expect(vaultToSeafile("/", "课程/讲义.md")).toBe("/课程/讲义.md");
		expect(seafileToVault("/", "/课程/讲义.md")).toBe("课程/讲义.md");
	});
	it("round-trips nested paths with spaces", () => {
		const v = "a b/c d/e.md";
		expect(seafileToVault("/", vaultToSeafile("/", v))).toBe(v);
	});
});

describe("parentDir / basename", () => {
	it("parentDir of top-level file is /", () => {
		expect(parentDir("/a.md")).toBe("/");
	});
	it("parentDir of nested", () => {
		expect(parentDir("/a/b/c.md")).toBe("/a/b");
	});
	it("basename", () => {
		expect(basename("/a/b/c.md")).toBe("c.md");
		expect(basename("/top.md")).toBe("top.md");
	});
});

describe("isExcluded", () => {
	it("always excludes .obsidian/**", () => {
		expect(isExcluded(".obsidian/config")).toBe(true);
		expect(isExcluded(".obsidian/plugins/x/main.js")).toBe(true);
	});
	it("does not exclude unrelated paths", () => {
		expect(isExcluded("notes/a.md")).toBe(false);
		expect(isExcluded("obsidian-tricks.md")).toBe(false);
	});
	it("honours extra prefixes", () => {
		expect(isExcluded("drafts/x.md", ["drafts/"])).toBe(true);
	});
	it("matches **/*.ext globs at any depth", () => {
		expect(isExcluded("a.png", ["**/*.png"])).toBe(true);
		expect(isExcluded("notes/a.png", ["**/*.png"])).toBe(true);
		expect(isExcluded("notes/sub/a.png", ["**/*.png"])).toBe(true);
		expect(isExcluded("notes/a.md", ["**/*.png"])).toBe(false);
	});
	it("matches prefix/** globs", () => {
		expect(isExcluded("templates/x.md", ["templates/**"])).toBe(true);
		expect(isExcluded("templates/a/b.md", ["templates/**"])).toBe(true);
		expect(isExcluded("templates-x/a.md", ["templates/**"])).toBe(false);
	});
	it("single * does not cross /", () => {
		expect(isExcluded("notes/a.tmp", ["notes/*.tmp"])).toBe(true);
		expect(isExcluded("notes/sub/a.tmp", ["notes/*.tmp"])).toBe(false);
	});
	it("escapes regex specials in literal segments", () => {
		expect(isExcluded("a.b+c.md", ["a.b+c.md"])).toBe(true);
		expect(isExcluded("aXb+c.md", ["a.b+c.md"])).toBe(false);
	});
});

describe("conflictName", () => {
	it("inserts the marker before the extension", () => {
		const n = conflictName("notes/a.md");
		expect(n.startsWith("notes/a.conflict-")).toBe(true);
		expect(n.endsWith(".md")).toBe(true);
	});
	it("handles extension-less files", () => {
		const n = conflictName("README");
		expect(n.startsWith("README.conflict-")).toBe(true);
	});
});
