import { describe, expect, it } from "vitest";
import { buildMultipart } from "../src/utils/multipart";

function decode(buf: ArrayBuffer): string {
	return new TextDecoder("utf-8").decode(buf);
}

describe("buildMultipart", () => {
	it("produces a valid content-type with a boundary matching the body", () => {
		const mp = buildMultipart([{ name: "parent_dir", value: "/" }]);
		const m = mp.contentType.match(/boundary=(.+)$/);
		expect(m).not.toBeNull();
		const boundary = m![1]!;
		const text = decode(mp.body);
		expect(text.startsWith(`--${boundary}\r\n`)).toBe(true);
		expect(text.endsWith(`--${boundary}--\r\n`)).toBe(true);
	});

	it("emits one text field with CRLF framing", () => {
		const mp = buildMultipart([{ name: "replace", value: "1" }]);
		const text = decode(mp.body);
		expect(text).toContain('Content-Disposition: form-data; name="replace"\r\n');
		expect(text).toContain("\r\n\r\n1\r\n");
	});

	it("emits a file field with filename and content-type", () => {
		const payload = new Uint8Array([65, 66, 67]);
		const mp = buildMultipart([
			{
				name: "file",
				filename: "note.md",
				value: payload,
				contentType: "application/octet-stream",
			},
		]);
		const text = decode(mp.body);
		expect(text).toContain(
			'Content-Disposition: form-data; name="file"; filename="note.md"\r\n',
		);
		expect(text).toContain("Content-Type: application/octet-stream\r\n");
		expect(text).toContain("\r\n\r\nABC\r\n");
	});

	it("does not corrupt binary payload bytes (round-trips 0xFF / 0x7F)", () => {
		const payload = new Uint8Array([0x00, 0xff, 0x7f, 0x01]);
		const mp = buildMultipart([
			{
				name: "file",
				filename: "bin",
				value: payload,
				contentType: "application/octet-stream",
			},
		]);
		// Locate the double-CRLF then the next 4 bytes.
		const body = new Uint8Array(mp.body);
		const needle = new Uint8Array([0x0d, 0x0a, 0x0d, 0x0a]);
		let idx = -1;
		outer: for (let i = 0; i < body.length - needle.length; i++) {
			for (let j = 0; j < needle.length; j++) {
				if (body[i + j] !== needle[j]) continue outer;
			}
			idx = i + needle.length;
			break;
		}
		expect(idx).toBeGreaterThan(0);
		expect(Array.from(body.slice(idx, idx + 4))).toEqual([0x00, 0xff, 0x7f, 0x01]);
	});

	it("each call uses a fresh boundary", () => {
		const a = buildMultipart([{ name: "x", value: "1" }]);
		const b = buildMultipart([{ name: "x", value: "1" }]);
		expect(a.contentType).not.toBe(b.contentType);
	});

	it("escapes CR/LF and quotes out of filenames", () => {
		const mp = buildMultipart([
			{
				name: "file",
				filename: 'a"b\r\nc',
				value: new Uint8Array(),
			},
		]);
		const text = decode(mp.body);
		expect(text).toContain('filename="a_b__c"');
	});
});
