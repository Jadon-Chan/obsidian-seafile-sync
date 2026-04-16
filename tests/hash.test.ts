import { describe, expect, it } from "vitest";
import { sha1Hex } from "../src/utils/hash";

function bytesOf(s: string): ArrayBuffer {
	return new TextEncoder().encode(s).buffer as ArrayBuffer;
}

describe("sha1Hex", () => {
	it("matches known SHA-1 of empty string", async () => {
		const h = await sha1Hex(new ArrayBuffer(0));
		expect(h).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
	});
	it("matches known SHA-1 of 'abc'", async () => {
		const h = await sha1Hex(bytesOf("abc"));
		expect(h).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
	});
	it("matches known SHA-1 of a longer string", async () => {
		const h = await sha1Hex(bytesOf("The quick brown fox jumps over the lazy dog"));
		expect(h).toBe("2fd4e1c67a2d28fced849ee1bb76e7391b93eb12");
	});
	it("is deterministic across calls", async () => {
		const a = await sha1Hex(bytesOf("hello world"));
		const b = await sha1Hex(bytesOf("hello world"));
		expect(a).toBe(b);
	});
	it("differs for different content", async () => {
		const a = await sha1Hex(bytesOf("a"));
		const b = await sha1Hex(bytesOf("b"));
		expect(a).not.toBe(b);
	});
});
