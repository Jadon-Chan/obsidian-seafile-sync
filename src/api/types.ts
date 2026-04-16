export interface SeafileRepo {
	id: string;
	name: string;
	size: number;
	mtime: number;
	permission?: string;
	encrypted?: boolean;
}

export interface SeafileDirEntry {
	type: "file" | "dir";
	name: string;
	id: string;
	size?: number;
	mtime: number;
}

export interface SeafileFileDetail {
	id: string;
	name: string;
	size: number;
	mtime: number;
}

export interface SeafileAccountInfo {
	email: string;
	name?: string;
	total?: number;
	usage?: number;
}

export class TokenInvalidError extends Error {
	constructor(message = "Seafile API token is invalid or expired") {
		super(message);
		this.name = "TokenInvalidError";
	}
}

export class SeafileApiError extends Error {
	readonly status: number;
	readonly bodyText: string;
	constructor(status: number, bodyText: string, message?: string) {
		super(message ?? `Seafile API error ${status}: ${bodyText.slice(0, 200)}`);
		this.name = "SeafileApiError";
		this.status = status;
		this.bodyText = bodyText;
	}
}
