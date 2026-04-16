// Line-based three-way merge. Uses LCS to find matching runs between base and
// each side, then walks the base finding "stable" positions (matched in both
// sides) and merging the intervening chunks:
//   - one side equals base in the chunk → take the other side's chunk
//   - both sides are identical → take either
//   - otherwise → conflict (emit git-style markers, flag conflict=true)

export interface Diff3Result {
	text: string;
	conflict: boolean;
}

function lcsTable(a: string[], b: string[]): number[][] {
	const n = a.length;
	const m = b.length;
	const L: number[][] = Array.from({ length: n + 1 }, () =>
		new Array(m + 1).fill(0),
	);
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			L[i]![j] =
				a[i - 1] === b[j - 1]
					? L[i - 1]![j - 1]! + 1
					: Math.max(L[i - 1]![j]!, L[i]![j - 1]!);
		}
	}
	return L;
}

// Pairs (aIdx, bIdx) of aligned matching lines, in increasing order.
function matchPairs(a: string[], b: string[]): Array<[number, number]> {
	const L = lcsTable(a, b);
	const pairs: Array<[number, number]> = [];
	let i = a.length;
	let j = b.length;
	while (i > 0 && j > 0) {
		if (a[i - 1] === b[j - 1]) {
			pairs.push([i - 1, j - 1]);
			i--;
			j--;
		} else if (L[i - 1]![j]! >= L[i]![j - 1]!) {
			i--;
		} else {
			j--;
		}
	}
	pairs.reverse();
	return pairs;
}

function arrEq(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

// Split preserving the line-ending style: we split on \n and remember whether
// the original ended in a newline so we can rejoin exactly.
function splitLines(s: string): { lines: string[]; trailingNL: boolean } {
	if (s === "") return { lines: [], trailingNL: false };
	const trailingNL = s.endsWith("\n");
	const body = trailingNL ? s.slice(0, -1) : s;
	return { lines: body.split("\n"), trailingNL };
}

function joinLines(lines: string[], trailingNL: boolean): string {
	if (lines.length === 0) return trailingNL ? "\n" : "";
	return lines.join("\n") + (trailingNL ? "\n" : "");
}

export function diff3Merge(
	baseText: string,
	localText: string,
	remoteText: string,
): Diff3Result {
	if (localText === remoteText) {
		return { text: localText, conflict: false };
	}
	if (baseText === localText) {
		return { text: remoteText, conflict: false };
	}
	if (baseText === remoteText) {
		return { text: localText, conflict: false };
	}

	const base = splitLines(baseText);
	const local = splitLines(localText);
	const remote = splitLines(remoteText);

	const baseToLocal = new Array<number>(base.lines.length).fill(-1);
	for (const [bi, li] of matchPairs(base.lines, local.lines)) {
		baseToLocal[bi] = li;
	}
	const baseToRemote = new Array<number>(base.lines.length).fill(-1);
	for (const [bi, ri] of matchPairs(base.lines, remote.lines)) {
		baseToRemote[bi] = ri;
	}

	const out: string[] = [];
	let conflict = false;
	let bi = 0;
	let li = 0;
	let ri = 0;

	while (bi <= base.lines.length) {
		// Find next base index that is "stable" — matched in both sides and
		// consistent with how far we've already consumed each side.
		let nextStable = bi;
		while (nextStable < base.lines.length) {
			const lm = baseToLocal[nextStable]!;
			const rm = baseToRemote[nextStable]!;
			if (lm !== -1 && rm !== -1 && lm >= li && rm >= ri) break;
			nextStable++;
		}
		const baseChunk = base.lines.slice(bi, nextStable);
		const lEnd =
			nextStable < base.lines.length
				? baseToLocal[nextStable]!
				: local.lines.length;
		const rEnd =
			nextStable < base.lines.length
				? baseToRemote[nextStable]!
				: remote.lines.length;
		const localChunk = local.lines.slice(li, lEnd);
		const remoteChunk = remote.lines.slice(ri, rEnd);

		if (arrEq(baseChunk, localChunk)) {
			out.push(...remoteChunk);
		} else if (arrEq(baseChunk, remoteChunk)) {
			out.push(...localChunk);
		} else if (arrEq(localChunk, remoteChunk)) {
			out.push(...localChunk);
		} else {
			conflict = true;
			out.push("<<<<<<< LOCAL");
			out.push(...localChunk);
			out.push("=======");
			out.push(...remoteChunk);
			out.push(">>>>>>> REMOTE");
		}

		if (nextStable >= base.lines.length) break;
		out.push(base.lines[nextStable]!);
		bi = nextStable + 1;
		li = lEnd + 1;
		ri = rEnd + 1;
	}

	// Use local's trailing-newline style to keep most editors happy.
	return { text: joinLines(out, local.trailingNL), conflict };
}

// Crude binary detector: null byte in the first 8 KiB → binary.
export function looksBinary(data: ArrayBuffer): boolean {
	const view = new Uint8Array(data, 0, Math.min(data.byteLength, 8192));
	for (let i = 0; i < view.length; i++) if (view[i] === 0) return true;
	return false;
}
