# Obsidian Seafile Sync

Two-way sync your Obsidian vault with a Seafile library. Built for students
with Seafile accounts on `cloud.tsinghua.edu.cn` but works with any Seafile
server that exposes Web API V2.1.

Works on Obsidian desktop and mobile. No Electron-only APIs.

## Features

- **Bidirectional sync** between your vault and a Seafile library, with
  incremental transfers — only files that changed since the last sync are
  transferred.
- **Change detection** via mtime, size, Seafile file ID, and SHA-1 hash.
  Editor "touches" that don't change content are ignored.
- **Conflict resolution** when both local and remote copies changed:
  keep local, keep remote, keep both (saves remote as
  `filename.conflict-<timestamp>.ext`), or skip. An "apply to all remaining"
  checkbox makes the choice sticky for the current sync run.
- **Smart merge** (enabled by default): for text files, attempts a three-way
  line-based merge using the base snapshot from the last sync. Falls back to
  the conflict modal only if the merge produces conflicting hunks.
- **Auto-sync** on a configurable interval (minutes).
- **Real-time sync** with debounce: listens for vault file changes and triggers
  a sync after a configurable idle period (seconds).
- **Local trash**: before overwriting or deleting a local file, stashes a
  timestamped copy. Old stashes are pruned after a configurable retention
  period (default 14 days).
- **Vault configuration sync**: optionally sync parts of your vault's
  configuration folder (appearance, hotkeys, themes and snippets, main
  settings, community plugin list, community plugin contents) with
  per-category toggles. Off by default. Device-specific files
  (`workspace.json`, `workspace-mobile.json`, `graph.json`) and this plugin's
  own folder are always excluded.
- **Exclude patterns**: `.trash/`, `.git/` are always excluded. Without vault
  configuration sync, the whole configuration folder is excluded as well.
  Additional patterns can be configured per line — supports prefix paths
  (`drafts/`) and globs (`**/*.png`, `*.tmp`).
- **Status bar** indicator showing sync state (`idle`, `syncing N/M`, `error`)
  and last sync time.
- **Rate limiting and retry**: API requests are capped at 4 concurrent, with
  exponential backoff on transient errors (429, 5xx, network failures).

## Setup

1. **Get a Seafile API token.**
   Sign in at your Seafile server in a browser. For Tsinghua Cloud this is
   `https://cloud.tsinghua.edu.cn` (Tsinghua SSO). Open your profile page,
   find the **API Token** section, and create/copy the token.

2. **Install the plugin** in your vault
   (`.obsidian/plugins/obsidian-seafile-sync/`) and enable it under
   **Settings > Community plugins**.

3. Open **Settings > Obsidian Seafile Sync** and:
   - Paste the token in **API token**.
   - Click **Test connection** — your account email and the library dropdown
     should appear.
   - Pick the library to sync with.
   - Optionally set a **Sync root** (path inside the library; `/` syncs the
     whole library).

4. Run the command **Sync now**, or enable auto-sync / real-time sync.

On first sync the plugin seeds sync records for files that already exist on
both sides with matching size, so connecting an existing vault to an existing
library does not produce spurious conflicts.

## How sync works

Each file is compared across three states: **local** (vault), **remote**
(Seafile), and **last-sync record** (persisted in `data.json`).

| Record | Local | Remote | Action |
|--------|-------|--------|--------|
| Yes | Yes | Yes | Upload if local changed, download if remote changed, conflict if both changed |
| Yes | Yes | No | Delete local (remote was deleted) |
| Yes | No | Yes | Delete remote (local was deleted) |
| Yes | No | No | Drop the stale record |
| No | Yes | Yes | Seed record if same size, otherwise conflict |
| No | Yes | No | Upload to remote |
| No | No | Yes | Download to local |

A file is considered "changed" when its mtime differs from the recorded value
by more than 2 seconds, its size differs, or its Seafile file ID differs.

## Vault configuration sync

By default the plugin only syncs notes and attachments — your vault's
configuration folder (`.obsidian/` or whatever you set via **Override config
folder**) is skipped. Enable **Vault configuration sync** in settings to also
sync items inside it, with per-category toggles modelled on Obsidian Sync.

### Toggles

| Toggle | Default | What it covers |
|--------|---------|----------------|
| Appearance | on | `appearance.json` (theme name, font size, base font, …) |
| Hotkeys | on | `hotkeys.json` |
| Themes and snippets | on | `themes/` and `snippets/` folders |
| Main settings | on | `app.json`, `core-plugins.json`, and other top-level settings files (daily notes, bookmarks, templates, …) |
| Community plugin list | off | `community-plugins.json` (which community plugins are enabled) |
| Community plugin contents | off | Each community plugin's folder under `plugins/` (code and its `data.json`) |

All toggles are off until you turn on the master **Enable** switch.

### Always excluded

These files never sync, even with every toggle on:

- `workspace.json`, `workspace-mobile.json`, `graph.json` — per-device UI
  state; syncing them causes constant conflicts and breaks layouts on other
  devices.
- `plugins/obsidian-seafile-sync/**` — this plugin's own folder. Your Seafile
  API token lives in its `data.json` and should stay per-device. Excluding
  the whole folder also avoids the plugin overwriting itself mid-sync.
- `.git/`, `.trash/` — always excluded regardless of configuration sync.

### Caveats

- **Community plugin contents is risky.** A plugin's `data.json` may contain
  device-specific secrets (API keys, paths). Bundled `main.js` files can also
  differ between desktop and mobile or between plugin versions. Only turn
  this on when you want identical plugin sets across devices. Use **Extra
  excludes** to opt individual plugin folders out (e.g.
  `.obsidian/plugins/some-plugin/data.json`).
- **Edits to config files don't trigger real-time sync.** Obsidian's file
  watcher doesn't emit events for hidden files, so changes to settings,
  themes, and plugin data only propagate on the next manual or auto sync.
- **First-sync conflicts.** If you enable configuration sync after both
  devices have been used independently, expect conflicts on files like
  `appearance.json`. Pick one device as the source of truth before enabling
  it, or be ready to resolve via the conflict modal.
- **Hot-reload isn't wired up.** Downloaded config changes take effect the
  next time Obsidian reloads the relevant setting (some reload in place,
  some require a full app restart).
- **Profiles.** If you use **Settings → Files and links → Override config
  folder** to run a per-device profile (e.g. `.obsidian-mobile`), the plugin
  follows whatever `app.vault.configDir` reports, so profiles work out of
  the box.

## Settings reference

| Setting | Default | Description |
|---------|---------|-------------|
| Server URL | `https://cloud.tsinghua.edu.cn` | Seafile server address |
| API token | — | Token for authentication |
| Library | — | Seafile library to sync with |
| Sync root | `/` | Path inside the library |
| Auto-sync interval | 0 (disabled) | Minutes between automatic syncs |
| Real-time sync delay | 0 (disabled) | Seconds of idle after a vault change before syncing |
| Smart merge | enabled | Three-way merge for text file conflicts |
| Local trash | enabled | Stash files before overwrite/delete |
| Trash retention | 14 days | How long to keep stashed files (0 = forever) |
| Vault configuration sync | disabled | Master switch; unlocks per-category toggles for syncing parts of `.obsidian/`. See [Vault configuration sync](#vault-configuration-sync) |
| Extra excludes | — | Additional exclude patterns, one per line |

## Commands

| Command | Description |
|---------|-------------|
| **Sync now** | Run a full bidirectional sync |
| **Clear token** | Remove the stored API token and account email |

## Privacy

The plugin only communicates with the Seafile server you configure. Your API
token is stored in `.obsidian/plugins/obsidian-seafile-sync/data.json` on your
device. The plugin's own folder is always excluded from sync (even with
vault configuration sync fully enabled) so the token stays local — generate
a separate token for each device.

## Development

```bash
npm install
npm run dev       # watch build -> main.js
npm test          # vitest unit tests
npm run build     # type-check + production bundle
```

## License

0-BSD
