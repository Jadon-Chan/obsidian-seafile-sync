// Path helpers: vault paths use forward slashes without a leading slash.
// Seafile paths use a leading slash. Root in Seafile is "/".

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

// eslint-disable-next-line obsidianmd/hardcoded-config-path -- initial default, overridden by setConfigDir
let DEFAULT_EXCLUDES = [".obsidian/", ".trash/", ".git/"];

export function setConfigDir(dir: string): void {
	DEFAULT_EXCLUDES = [`${dir}/`, ".trash/", ".git/"];
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

export function isExcluded(vaultPath: string, extra: string[] = []): boolean {
	const p = stripLeadingSlash(vaultPath);
	const patterns = DEFAULT_EXCLUDES.concat(extra.map((x) => stripLeadingSlash(x)));
	for (const pat of patterns) {
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
