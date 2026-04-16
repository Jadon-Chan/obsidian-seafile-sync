// SHA-1 over binary content, hex-encoded. Used to detect "mtime touched but
// content unchanged" cases so we don't re-upload identical files.

export async function sha1Hex(data: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-1", data);
	const bytes = new Uint8Array(digest);
	let out = "";
	for (let i = 0; i < bytes.length; i++) {
		out += (bytes[i] as number).toString(16).padStart(2, "0");
	}
	return out;
}
