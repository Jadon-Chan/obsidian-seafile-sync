// Minimal stub so the unit-test modules that happen to transitively touch
// "obsidian" types don't blow up. The pure modules we test don't use these
// at runtime; the stub only needs to satisfy the type imports.
export class Plugin {}
export class Modal {}
export class PluginSettingTab {}
export class Setting {}
export class Notice {}
export class TFile {}
export class TFolder {}
export const normalizePath = (p: string) => p;
export function requestUrl(): Promise<unknown> {
	throw new Error("requestUrl not available in tests");
}
export type RequestUrlParam = unknown;
export type RequestUrlResponse = unknown;
export type App = unknown;
export type Editor = unknown;
export type MarkdownView = unknown;
