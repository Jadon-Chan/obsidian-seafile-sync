import { describe, expect, it } from "vitest";
import {
	basename,
	classifyConfigPath,
	conflictName,
	isExcluded,
	normalizeSeafilePath,
	parentDir,
	seafileToVault,
	vaultToSeafile,
} from "../src/utils/paths";
import {
	DEFAULT_VAULT_CONFIG_SYNC,
	type VaultConfigSyncSettings,
} from "../src/settings";

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
	it("always excludes config dir", () => {
		const configDir = ".obsidian"; // eslint-disable-line obsidianmd/hardcoded-config-path
		expect(isExcluded(`${configDir}/config`)).toBe(true);
		expect(isExcluded(`${configDir}/plugins/x/main.js`)).toBe(true);
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

// eslint-disable-next-line obsidianmd/hardcoded-config-path -- tests use the default
const CD = ".obsidian";

describe("classifyConfigPath", () => {
	it("returns null for non-config paths", () => {
		expect(classifyConfigPath("notes/a.md")).toBeNull();
	});
	it("classifies the standard files", () => {
		expect(classifyConfigPath(`${CD}/appearance.json`)).toBe("appearance");
		expect(classifyConfigPath(`${CD}/hotkeys.json`)).toBe("hotkeys");
		expect(classifyConfigPath(`${CD}/community-plugins.json`)).toBe(
			"communityPluginList",
		);
		expect(classifyConfigPath(`${CD}/themes/Minimal/theme.css`)).toBe(
			"themesAndSnippets",
		);
		expect(classifyConfigPath(`${CD}/snippets/x.css`)).toBe("themesAndSnippets");
		expect(classifyConfigPath(`${CD}/plugins/foo/main.js`)).toBe(
			"communityPluginContent",
		);
		expect(classifyConfigPath(`${CD}/app.json`)).toBe("mainSettings");
		expect(classifyConfigPath(`${CD}/daily-notes.json`)).toBe("mainSettings");
	});
	it("flags always-excluded layout files", () => {
		expect(classifyConfigPath(`${CD}/workspace.json`)).toBe("always-excluded");
		expect(classifyConfigPath(`${CD}/workspace-mobile.json`)).toBe("always-excluded");
		expect(classifyConfigPath(`${CD}/graph.json`)).toBe("always-excluded");
	});
	it("flags this plugin's own folder as self", () => {
		expect(classifyConfigPath(`${CD}/plugins/obsidian-seafile-sync/data.json`)).toBe(
			"self",
		);
		expect(classifyConfigPath(`${CD}/plugins/obsidian-seafile-sync`)).toBe("self");
	});
});

describe("isExcluded with vault config sync", () => {
	const allOn: VaultConfigSyncSettings = {
		...DEFAULT_VAULT_CONFIG_SYNC,
		enabled: true,
		appearance: true,
		hotkeys: true,
		themesAndSnippets: true,
		mainSettings: true,
		communityPluginList: true,
		communityPluginContent: true,
	};

	it("excludes all of the config dir when vcs is undefined", () => {
		expect(isExcluded(`${CD}/appearance.json`)).toBe(true);
	});
	it("excludes all of the config dir when master switch is off", () => {
		const vcs: VaultConfigSyncSettings = { ...allOn, enabled: false };
		expect(isExcluded(`${CD}/appearance.json`, [], vcs)).toBe(true);
	});
	it("includes appearance when toggled on", () => {
		expect(isExcluded(`${CD}/appearance.json`, [], allOn)).toBe(false);
	});
	it("respects per-category toggles", () => {
		const vcs: VaultConfigSyncSettings = { ...allOn, hotkeys: false };
		expect(isExcluded(`${CD}/hotkeys.json`, [], vcs)).toBe(true);
		expect(isExcluded(`${CD}/appearance.json`, [], vcs)).toBe(false);
	});
	it("always excludes workspace files regardless of toggles", () => {
		expect(isExcluded(`${CD}/workspace.json`, [], allOn)).toBe(true);
		expect(isExcluded(`${CD}/workspace-mobile.json`, [], allOn)).toBe(true);
		expect(isExcluded(`${CD}/graph.json`, [], allOn)).toBe(true);
	});
	it("always excludes this plugin's own folder", () => {
		expect(
			isExcluded(`${CD}/plugins/obsidian-seafile-sync/data.json`, [], allOn),
		).toBe(true);
		expect(isExcluded(`${CD}/plugins/obsidian-seafile-sync/main.js`, [], allOn)).toBe(
			true,
		);
	});
	it("still excludes .git/ and .trash/ even with vcs on", () => {
		expect(isExcluded(".git/HEAD", [], allOn)).toBe(true);
		expect(isExcluded(".trash/x.md", [], allOn)).toBe(true);
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
