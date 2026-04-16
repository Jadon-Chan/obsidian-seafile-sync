// Path helpers: vault paths use forward slashes without a leading slash.
// Seafile paths use a leading slash. Root in Seafile is "/".

import type { VaultConfigSyncSettings } from "../settings";

export function vaultToSeafile(root: string, vaultPath: string): string {
	const normRoot = normalizeSeafilePath(root);
	const clean = stripLeadingSlash(vaultPath);
	if (clean === "") return normRoot === "" ? "/" : normRoot || "/";
	const base = normRoot === "" || normRoot === "/" ? "" : normRoot;
	return (base + "/" + clean).replace(/\/+/g, "/");
}

export function seafileToVault(root: string, seafilePath: string): string {
	const normRoot = normalizeSeafilePath(root);
	const p = normalizeSeafilePath(seafilePath);
	if (normRoot === "" || normRoot === "/") {
		return stripLeadingSlash(p);
	}
	if (p === normRoot) return "";
	if (p.startsWith(normRoot + "/")) {
		return p.slice(normRoot.length + 1);
	}
	return stripLeadingSlash(p);
}

export function normalizeSeafilePath(p: string): string {
	if (!p || p === "/") return "/";
	let out = p.trim();
	if (!out.startsWith("/")) out = "/" + out;
	out = out.replace(/\/+/g, "/");
	if (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
	return out;
}

export function stripLeadingSlash(p: string): string {
	return p.replace(/^\/+/, "");
}

export function parentDir(seafilePath: string): string {
	const p = normalizeSeafilePath(seafilePath);
	if (p === "/") return "/";
	const idx = p.lastIndexOf("/");
	return idx <= 0 ? "/" : p.slice(0, idx);
}

export function basename(seafilePath: string): string {
	const p = normalizeSeafilePath(seafilePath);
	const idx = p.lastIndexOf("/");
	return idx < 0 ? p : p.slice(idx + 1);
}

// eslint-disable-next-line obsidianmd/hardcoded-config-path -- overridden at startup via setConfigDir
let CONFIG_DIR = ".obsidian";
const SELF_PLUGIN_DIR_NAME = "obsidian-seafile-sync";
let SELF_PLUGIN_PATH = `${CONFIG_DIR}/plugins/${SELF_PLUGIN_DIR_NAME}`;

export function setConfigDir(dir: string): void {
	CONFIG_DIR = dir;
	SELF_PLUGIN_PATH = `${dir}/plugins/${SELF_PLUGIN_DIR_NAME}`;
}

export function isUnderConfigDir(vaultPath: string): boolean {
	const p = stripLeadingSlash(vaultPath);
	return p === CONFIG_DIR || p.startsWith(CONFIG_DIR + "/");
}

// Files Obsidian writes per-device that must never sync regardless of toggles.
const ALWAYS_EXCLUDED_CONFIG_LEAVES = new Set([
	"workspace.json",
	"workspace-mobile.json",
	"graph.json",
]);

export type ConfigCategory =
	| "self"
	| "always-excluded"
	| "appearance"
	| "hotkeys"
	| "themesAndSnippets"
	| "mainSettings"
	| "communityPluginList"
	| "communityPluginContent";

export function classifyConfigPath(vaultPath: string): ConfigCategory | null {
	const p = stripLeadingSlash(vaultPath);
	if (!isUnderConfigDir(p)) return null;
	if (p === SELF_PLUGIN_PATH || p.startsWith(SELF_PLUGIN_PATH + "/")) return "self";
	const rel = p === CONFIG_DIR ? "" : p.slice(CONFIG_DIR.length + 1);
	if (ALWAYS_EXCLUDED_CONFIG_LEAVES.has(rel)) return "always-excluded";
	if (rel === "appearance.json") return "appearance";
	if (rel === "hotkeys.json") return "hotkeys";
	if (rel === "community-plugins.json") return "communityPluginList";
	if (rel === "themes" || rel.startsWith("themes/")) return "themesAndSnippets";
	if (rel === "snippets" || rel.startsWith("snippets/")) return "themesAndSnippets";
	if (rel === "plugins" || rel.startsWith("plugins/")) return "communityPluginContent";
	return "mainSettings";
}

function isGlob(pat: string): boolean {
	return pat.includes("*") || pat.includes("?");
}

export function globToRegex(glob: string): RegExp {
	const pat = stripLeadingSlash(glob);
	let re = "";
	let i = 0;
	while (i < pat.length) {
		const c = pat[i]!;
		if (c === "*") {
			if (pat[i + 1] === "*") {
				if (pat[i + 2] === "/") {
					re += "(?:.*/)?";
					i += 3;
				} else {
					re += ".*";
					i += 2;
				}
			} else {
				re += "[^/]*";
				i++;
			}
		} else if (c === "?") {
			re += "[^/]";
			i++;
		} else if (/[.+^$|()[\]{}\\]/.test(c)) {
			re += "\\" + c;
			i++;
		} else {
			re += c;
			i++;
		}
	}
	return new RegExp("^" + re + "$");
}

function isVaultConfigPathAllowed(
	cat: ConfigCategory,
	vcs: VaultConfigSyncSettings | undefined,
): boolean {
	if (cat === "self" || cat === "always-excluded") return false;
	if (!vcs || !vcs.enabled) return false;
	switch (cat) {
		case "appearance":
			return vcs.appearance;
		case "hotkeys":
			return vcs.hotkeys;
		case "themesAndSnippets":
			return vcs.themesAndSnippets;
		case "mainSettings":
			return vcs.mainSettings;
		case "communityPluginList":
			return vcs.communityPluginList;
		case "communityPluginContent":
			return vcs.communityPluginContent;
	}
}

export function isExcluded(
	vaultPath: string,
	extra: string[] = [],
	vcs?: VaultConfigSyncSettings,
): boolean {
	const p = stripLeadingSlash(vaultPath);

	if (isUnderConfigDir(p)) {
		const cat = classifyConfigPath(p);
		// classify always returns a category for paths under the config dir.
		if (!cat || !isVaultConfigPathAllowed(cat, vcs)) return true;
	} else {
		if (p === ".trash" || p.startsWith(".trash/")) return true;
		if (p === ".git" || p.startsWith(".git/")) return true;
	}

	for (const raw of extra) {
		const pat = stripLeadingSlash(raw);
		if (!pat) continue;
		if (isGlob(pat)) {
			if (globToRegex(pat).test(p)) return true;
		} else if (pat.endsWith("/")) {
			if (p === pat.slice(0, -1) || p.startsWith(pat)) return true;
		} else if (p === pat) {
			return true;
		}
	}
	return false;
}

export function conflictName(vaultPath: string): string {
	const idx = vaultPath.lastIndexOf(".");
	const slash = vaultPath.lastIndexOf("/");
	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	if (idx <= slash) return `${vaultPath}.conflict-${ts}`;
	return `${vaultPath.slice(0, idx)}.conflict-${ts}${vaultPath.slice(idx)}`;
}
