export type ConflictStrategy = "keep-local" | "keep-remote" | "keep-both";

export interface ConflictResolution {
	choice: ConflictStrategy | "cancel";
	applyToAll: boolean;
}

export type ConflictResolver = (vaultPath: string) => Promise<ConflictResolution>;
