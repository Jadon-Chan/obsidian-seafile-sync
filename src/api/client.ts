import { requestUrl, RequestUrlParam, RequestUrlResponse } from "obsidian";
import { buildMultipart } from "../utils/multipart";
import { normalizeSeafilePath, parentDir, basename } from "../utils/paths";
import { RateLimiter, retryOnTransient } from "./rateLimit";
import {
	SeafileAccountInfo,
	SeafileApiError,
	SeafileDirEntry,
	SeafileFileDetail,
	SeafileRepo,
	TokenInvalidError,
} from "./types";

export interface SeafileClientOptions {
	serverUrl: string;
	token: string;
	concurrency?: number;
}

export class SeafileClient {
	private readonly server: string;
	private token: string;
	private readonly limiter: RateLimiter;

	constructor(opts: SeafileClientOptions) {
		this.server = opts.serverUrl.replace(/\/+$/, "");
		this.token = opts.token;
		this.limiter = new RateLimiter(opts.concurrency ?? 4);
	}

	// ---- Account ---------------------------------------------------------
	async accountInfo(): Promise<SeafileAccountInfo> {
		return this.getJson<SeafileAccountInfo>(`/api2/account/info/`);
	}

	// ---- Repos -----------------------------------------------------------
	async listRepos(): Promise<SeafileRepo[]> {
		return this.getJson<SeafileRepo[]>(`/api2/repos/`);
	}

	// ---- Directories -----------------------------------------------------
	async listDir(repoId: string, dirPath: string): Promise<SeafileDirEntry[]> {
		const p = normalizeSeafilePath(dirPath);
		return this.getJson<SeafileDirEntry[]>(
			`/api2/repos/${repoId}/dir/?p=${encodeURIComponent(p)}`,
		);
	}

	async mkdir(repoId: string, dirPath: string): Promise<void> {
		const p = normalizeSeafilePath(dirPath);
		const form = `operation=mkdir`;
		await this.request({
			method: "POST",
			url: `${this.server}/api2/repos/${repoId}/dir/?p=${encodeURIComponent(p)}`,
			headers: {
				Authorization: `Token ${this.token}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: form,
		});
	}

	async ensureDir(repoId: string, dirPath: string): Promise<void> {
		const p = normalizeSeafilePath(dirPath);
		if (p === "/") return;
		try {
			await this.listDir(repoId, p);
			return;
		} catch (e) {
			if ((e as SeafileApiError).status !== 404) throw e;
		}
		await this.ensureDir(repoId, parentDir(p));
		try {
			await this.mkdir(repoId, p);
		} catch (e) {
			// Tolerate races where another mkdir already created it.
			if ((e as SeafileApiError).status !== 400) throw e;
		}
	}

	// ---- File read -------------------------------------------------------
	async fileDetail(repoId: string, filePath: string): Promise<SeafileFileDetail> {
		const p = normalizeSeafilePath(filePath);
		return this.getJson<SeafileFileDetail>(
			`/api2/repos/${repoId}/file/detail/?p=${encodeURIComponent(p)}`,
		);
	}

	async downloadFile(repoId: string, filePath: string): Promise<ArrayBuffer> {
		const p = normalizeSeafilePath(filePath);
		const link = await this.getJson<string>(
			`/api2/repos/${repoId}/file/?p=${encodeURIComponent(p)}`,
		);
		const res = await this.request({ method: "GET", url: link });
		return res.arrayBuffer;
	}

	// ---- File write ------------------------------------------------------
	async uploadFile(
		repoId: string,
		filePath: string,
		bytes: ArrayBuffer,
	): Promise<void> {
		const p = normalizeSeafilePath(filePath);
		const parent = parentDir(p);
		const name = basename(p);
		const link = await this.getJson<string>(
			`/api2/repos/${repoId}/upload-link/?p=${encodeURIComponent(parent)}`,
		);
		const multipart = buildMultipart([
			{
				name: "file",
				filename: name,
				value: new Uint8Array(bytes),
				contentType: "application/octet-stream",
			},
			{ name: "parent_dir", value: parent },
			{ name: "replace", value: "1" },
		]);
		await this.request({
			method: "POST",
			url: `${link}?ret-json=1`,
			headers: {
				Authorization: `Token ${this.token}`,
				"Content-Type": multipart.contentType,
			},
			body: multipart.body,
		});
	}

	async deleteFile(repoId: string, filePath: string): Promise<void> {
		const p = normalizeSeafilePath(filePath);
		await this.request({
			method: "DELETE",
			url: `${this.server}/api2/repos/${repoId}/file/?p=${encodeURIComponent(p)}`,
			headers: { Authorization: `Token ${this.token}` },
		});
	}

	// ---- Internals -------------------------------------------------------
	private async getJson<T>(path: string): Promise<T> {
		const url = path.startsWith("http") ? path : this.server + path;
		const res = await this.request({
			method: "GET",
			url,
			headers: { Authorization: `Token ${this.token}` },
		});
		try {
			return JSON.parse(res.text) as T;
		} catch {
			return res.text as unknown as T;
		}
	}

	private request(params: RequestUrlParam): Promise<RequestUrlResponse> {
		return this.limiter.run(() =>
			retryOnTransient(async () => {
				const res = await requestUrl({ ...params, throw: false });
				if (res.status === 401 || res.status === 403) {
					throw new TokenInvalidError();
				}
				if (res.status >= 400) {
					throw new SeafileApiError(res.status, res.text ?? "");
				}
				return res;
			}),
		);
	}
}
