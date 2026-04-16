export interface VaultConfigSyncSettings {
	enabled: boolean;
	appearance: boolean;
	hotkeys: boolean;
	themesAndSnippets: boolean;
	mainSettings: boolean;
	communityPluginList: boolean;
	communityPluginContent: boolean;
}

export const DEFAULT_VAULT_CONFIG_SYNC: VaultConfigSyncSettings = {
	enabled: false,
	appearance: true,
	hotkeys: true,
	themesAndSnippets: true,
	mainSettings: true,
	communityPluginList: false,
	communityPluginContent: false,
};

export interface SeafileSettings {
	serverUrl: string;
	apiToken: string;
	repoId: string;
	repoName: string;
	syncRoot: string;
	extraExcludes: string[];
	lastSyncAt: number;
	accountEmail: string;
	autoSyncMinutes: number;
	realtimeSyncSeconds: number;
	trashEnabled: boolean;
	trashRetentionDays: number;
	smartMerge: boolean;
	vaultConfigSync: VaultConfigSyncSettings;
}

export const DEFAULT_SETTINGS: SeafileSettings = {
	serverUrl: "https://cloud.tsinghua.edu.cn",
	apiToken: "",
	repoId: "",
	repoName: "",
	syncRoot: "/",
	extraExcludes: [],
	lastSyncAt: 0,
	accountEmail: "",
	autoSyncMinutes: 0,
	realtimeSyncSeconds: 0,
	trashEnabled: true,
	trashRetentionDays: 14,
	smartMerge: true,
	vaultConfigSync: DEFAULT_VAULT_CONFIG_SYNC,
};

export interface PersistedData {
	settings: SeafileSettings;
	records: Record<string, import("./sync/syncRecord").SyncRecord>;
}
