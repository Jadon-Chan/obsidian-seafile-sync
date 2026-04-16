// Builds a multipart/form-data body as an ArrayBuffer, so it works inside
// Obsidian's requestUrl on both desktop and mobile (no global FormData reliance).

export interface MultipartField {
	name: string;
	value: string | Uint8Array;
	filename?: string;
	contentType?: string;
}

export interface MultipartBody {
	contentType: string;
	body: ArrayBuffer;
}

const enc = new TextEncoder();

export function buildMultipart(fields: MultipartField[]): MultipartBody {
	const boundary = "----SeafileSyncBoundary" + Math.random().toString(16).slice(2);
	const parts: Uint8Array[] = [];
	const dashBoundary = enc.encode(`--${boundary}\r\n`);

	for (const f of fields) {
		parts.push(dashBoundary);
		let header = `Content-Disposition: form-data; name="${f.name}"`;
		if (f.filename !== undefined) {
			header += `; filename="${encodeFilename(f.filename)}"`;
		}
		header += "\r\n";
		if (f.contentType) header += `Content-Type: ${f.contentType}\r\n`;
		header += "\r\n";
		parts.push(enc.encode(header));
		if (typeof f.value === "string") {
			parts.push(enc.encode(f.value));
		} else {
			parts.push(f.value);
		}
		parts.push(enc.encode("\r\n"));
	}
	parts.push(enc.encode(`--${boundary}--\r\n`));

	const size = parts.reduce((n, p) => n + p.byteLength, 0);
	const out = new Uint8Array(size);
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.byteLength;
	}
	return {
		contentType: `multipart/form-data; boundary=${boundary}`,
		body: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength),
	};
}

function encodeFilename(name: string): string {
	// RFC 5987-ish fallback: escape quotes and CR/LF only; let UTF-8 bytes through.
	return name.replace(/["\r\n]/g, "_");
}
