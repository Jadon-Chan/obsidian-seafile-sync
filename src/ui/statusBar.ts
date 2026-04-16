export type StatusState =
	| { kind: "idle"; lastSyncAt: number }
	| { kind: "syncing"; done: number; total: number }
	| { kind: "error"; message: string };

export class StatusBarController {
	constructor(private readonly el: HTMLElement) {}

	set(state: StatusState): void {
		switch (state.kind) {
			case "idle": {
				const ts = state.lastSyncAt
					? new Date(state.lastSyncAt).toLocaleTimeString()
					: "never";
				this.el.setText(`Seafile: idle (last: ${ts})`);
				return;
			}
			case "syncing":
				this.el.setText(
					`Seafile: syncing ${state.done}/${state.total}`,
				);
				return;
			case "error":
				this.el.setText(`Seafile: error — ${state.message}`);
				return;
		}
	}
}
