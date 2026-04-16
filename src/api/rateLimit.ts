// Simple in-flight cap for outbound API requests. Keeps things polite toward
// cloud.tsinghua.edu.cn and avoids overwhelming mobile networks.

export class RateLimiter {
	private active = 0;
	private readonly queue: Array<() => void> = [];

	constructor(private readonly max: number = 4) {}

	async run<T>(fn: () => Promise<T>): Promise<T> {
		await this.acquire();
		try {
			return await fn();
		} finally {
			this.release();
		}
	}

	private acquire(): Promise<void> {
		if (this.active < this.max) {
			this.active++;
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => {
			this.queue.push(() => {
				this.active++;
				resolve();
			});
		});
	}

	private release(): void {
		this.active--;
		const next = this.queue.shift();
		if (next) next();
	}
}

// Retry on transient failures: rate-limit (429), server errors (5xx), and
// network/DNS errors (which surface as thrown exceptions without a status).
// Token/auth errors (401/403) and client errors (4xx) are not retried.
export async function retryOnTransient<T>(
	fn: () => Promise<T>,
	attempts = 3,
): Promise<T> {
	let lastErr: unknown;
	for (let i = 0; i <= attempts; i++) {
		try {
			return await fn();
		} catch (e) {
			lastErr = e;
			if (!isTransient(e) || i === attempts) throw e;
			const base = 400 * Math.pow(2, i);
			const jitter = Math.floor(Math.random() * 300);
			await new Promise((r) => setTimeout(r, base + jitter));
		}
	}
	throw lastErr;
}

function isTransient(e: unknown): boolean {
	const err = e as { status?: number; name?: string };
	if (err?.name === "TokenInvalidError") return false;
	const s = err?.status;
	if (s === 429) return true;
	if (typeof s === "number" && s >= 500 && s < 600) return true;
	// No HTTP status → network-layer failure (ENETUNREACH, TLS, aborted, etc).
	if (s === undefined) return true;
	return false;
}
