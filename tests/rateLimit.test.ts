import { describe, expect, it, vi } from "vitest";
import { RateLimiter, retryOnTransient } from "../src/api/rateLimit";

class HttpError extends Error {
	constructor(public status: number) {
		super(`HTTP ${status}`);
		this.name = "HttpError";
	}
}

class AuthError extends Error {
	constructor() {
		super("token");
		this.name = "TokenInvalidError";
	}
}

describe("retryOnTransient", () => {
	it("returns the value without retrying on success", async () => {
		const fn = vi.fn().mockResolvedValue(42);
		expect(await retryOnTransient(fn, 3)).toBe(42);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("retries on 429 and eventually succeeds", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new HttpError(429))
			.mockResolvedValue("ok");
		expect(await retryOnTransient(fn, 3)).toBe("ok");
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("retries on 5xx", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new HttpError(503))
			.mockResolvedValue("ok");
		expect(await retryOnTransient(fn, 3)).toBe("ok");
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("retries on network errors (no status)", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("ECONNRESET"))
			.mockResolvedValue("ok");
		expect(await retryOnTransient(fn, 3)).toBe("ok");
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("does NOT retry on TokenInvalidError", async () => {
		const fn = vi.fn().mockRejectedValue(new AuthError());
		await expect(retryOnTransient(fn, 3)).rejects.toBeInstanceOf(AuthError);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("does NOT retry on 4xx client errors", async () => {
		const fn = vi.fn().mockRejectedValue(new HttpError(404));
		await expect(retryOnTransient(fn, 3)).rejects.toMatchObject({ status: 404 });
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("gives up after the configured attempts", async () => {
		const fn = vi.fn().mockRejectedValue(new HttpError(500));
		await expect(retryOnTransient(fn, 2)).rejects.toMatchObject({ status: 500 });
		expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
	});
});

describe("RateLimiter", () => {
	it("caps concurrent in-flight calls", async () => {
		const limiter = new RateLimiter(2);
		let active = 0;
		let peak = 0;
		const task = async () => {
			active++;
			peak = Math.max(peak, active);
			await new Promise((r) => setTimeout(r, 10));
			active--;
		};
		await Promise.all(Array.from({ length: 8 }, () => limiter.run(task)));
		expect(peak).toBeLessThanOrEqual(2);
	});

	it("releases the slot even if the task throws", async () => {
		const limiter = new RateLimiter(1);
		await expect(
			limiter.run(async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		// If the slot wasn't released, this second call would hang.
		const out = await limiter.run(async () => "ok");
		expect(out).toBe("ok");
	});
});
