import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		environment: "node",
	},
	resolve: {
		alias: {
			obsidian: new URL("./tests/stubs/obsidian.ts", import.meta.url).pathname,
		},
	},
});
