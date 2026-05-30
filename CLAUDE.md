# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # start Electron + Vite dev server (hot reload)
npm run build        # production build → out/
npm start            # run already-built app (requires prior build)
bash install.sh      # build + install as persistent launchd agent (run once)
```

### After code changes (app running as launchd agent)
```bash
npm run build && launchctl kickstart -k gui/$(id -u)/com.local.claude-widget
```

### Managing the launchd agent
```bash
launchctl list | grep claude-widget        # check if running (shows PID)
tail -f /tmp/claude-widget.log             # view logs
launchctl unload ~/Library/LaunchAgents/com.local.claude-widget.plist   # stop permanently
launchctl load   ~/Library/LaunchAgents/com.local.claude-widget.plist   # re-enable
```

No test runner is configured. There is no lint script; TypeScript strict mode (`"strict": true`) is the primary type-safety gate.

## Architecture

This is a macOS menu bar app built with Electron 30 + React 18 + TypeScript, bundled by `electron-vite`.

**Two-process model:**
- **Main process** (`main.ts`, `parser.ts`, `toggl.ts`) — runs in Node.js. Owns the Tray, BrowserWindow, IPC handlers, file watcher, and encrypted credential storage.
- **Renderer process** (`App.tsx`, `main.tsx`) — React UI rendered inside a frameless, transparent, always-on-top BrowserWindow (360×540px with macOS vibrancy).
- **Preload** (`preload.ts`) — context bridge exposing `window.claudeAPI` to the renderer. This is the only IPC surface the renderer can use.

**Data flow:**
1. `parser.ts` walks `~/.claude/projects/**/*.jsonl`, reads `assistant`-type JSONL entries, computes token counts and cost from `message.usage`, and returns a `ClaudeStats` object. Cost is calculated using model-specific pricing in the `PRICING` map — verify rates against anthropic.com/pricing.
2. `main.ts` sets up an `fs.watch` on `~/.claude/projects/` and calls `getClaudeStats()` on every `.jsonl` change (falls back to 30s polling if watch fails). Stats are pushed to the renderer via `stats-update` IPC push, and the tray title is updated with the current streak count.
3. `toggl.ts` is a thin Toggl Track API v9 client. It fetches time entries and project metadata for the last 7 days, and exposes write functions (`getOrCreateProject`, `getOrCreateTag`, `createTimeEntry`) used by the Claude→Toggl sync feature. Called on demand and polled every 3 minutes from the renderer (rate-limited to stay under Toggl's free-tier cap of 30 req/hr).
4. The Toggl API token is stored encrypted on disk using `safeStorage` (macOS Keychain) at `app.getPath('userData')/toggl-token.enc`. IPC handlers `get-toggl-token` / `save-toggl-token` handle read/write. The token is entered once via the in-app UI and persists across restarts. The last successful Toggl API response is cached to `app.getPath('userData')/toggl-cache.json` so the UI stays populated during rate-limit windows (Toggl returns 402 when the hourly cap is exceeded).
5. `main.ts` reads the Claude Code OAuth token from the macOS Keychain (`"Claude Code-credentials"`) and calls `https://api.anthropic.com/api/oauth/usage` to fetch real quota utilization (`utilization`) and reset timestamps (`resetsAt`). These drive the ring percentages and "resets in …" countdowns in the renderer. The result is held in `cachedUsageLimits` **and persisted to `usage-limits-cache.json`** in `userData`. On startup the cache is seeded synchronously from disk via `loadUsageCache()` (before the renderer can issue its first IPC call), then refreshed from the network; it is re-polled every 5 minutes. `refreshUsageLimits()` only overwrites the cache when a fetch returns real data — a token-less or all-null response is ignored, so the UI never regresses. This disk persistence matters because the OAuth endpoint frequently times out on a cold start (e.g. right after a code-change restart); without it the renderer would receive `null` and fall back to **parser-derived token ratios and `now-N` reset times**, which look plausible but are wrong (e.g. weekly showing 33%/19h instead of the API's 3%/6d).

**Rolling window logic (`parser.ts`):**
- `session5h` — 5-hour rolling window. When `WindowAnchors.fiveHourResetsAt` is provided, the window start is `resetsAt - 5h` (matching Anthropic's boundary exactly); otherwise falls back to `now - 5h`.
- `week` / `sonnetWeek` — 7-day rolling window, same anchor pattern with `sevenDayResetsAt`.
- `session5hResetsAt` / `weekResetsAt` — returned in `ClaudeStats`. Prefer the API's `resetsAt` value; fall back to deriving from the oldest record in the window (`oldestTimestamp + windowDuration`). The UI uses these for the reset countdown without needing the Anthropic API to be available.
- `activeSessions` — list of distinct `sessionId`s with any record in the 5h window, with per-session token/cost/message counts. Enables tracking multiple concurrent Claude Code terminals.
- `lastSessionAt` — timestamp of the most recent message across all time, used to show an idle state ("idle · last Xm ago") when the 5h window is empty.

**IPC channels** (all invocable via `window.claudeAPI`):
| Channel | Direction | Handler file |
|---|---|---|
| `get-stats` | renderer → main | `parser.ts` |
| `stats-update` | main → renderer (push) | `main.ts` |
| `get-usage-limits` | renderer → main | `main.ts` |
| `get-toggl-stats` | renderer → main | `toggl.ts` (falls back to disk cache on 402) |
| `get-toggl-token` | renderer → main | `main.ts` |
| `save-toggl-token` | renderer → main | `main.ts` |
| `sync-claude-to-toggl` | renderer → main | `toggl.ts` + `parser.ts` |

**Claude→Toggl sync (`sync-claude-to-toggl`):**
- Segments Claude sessions into *work blocks* by idle gaps >25 min (`IDLE_GAP_MS` in `parser.ts`). Each block → one Toggl entry. This avoids inflating hours when a session spans a lunch break.
- Target project: `"Side Project"`, tag: `"coding"`, description: Claude project folder name (`path.basename(cwd)`). Project and tag are created in Toggl if absent.
- Dedup state (synced block keys → Toggl entry IDs) persists at `app.getPath('userData')/claude-toggl-sync.json`. Partial syncs survive errors.
- Workspace/project/tag IDs are cached in the same file to avoid redundant API lookups.

**File layout** (flat — no src/ or electron/ subdirectory):
- `main.ts` — Electron main process
- `parser.ts` — Claude JSONL parser
- `toggl.ts` — Toggl API client + types
- `preload.ts` — context bridge
- `App.tsx` — two-tab UI (Claude stats + Toggl)
- `main.tsx` — React entry point
- `index.html` — renderer HTML shell
- `electron.vite.config.ts` — build config
- `install.sh` — one-shot script to build + install as launchd Login Item
- `assets/` — tray icon PNGs (Claude Code pixel mascot, generated by `scripts/gen-icon.mjs`)
- `scripts/gen-icon.mjs` — generates `assets/icon.png` + `assets/icon@2x.png` from `clawd.svg`

**Deployment:**
The app runs as a macOS Launch Agent (`~/Library/LaunchAgents/com.local.claude-widget.plist`) using the Electron binary inside `node_modules/`. It starts automatically on login and logs to `/tmp/claude-widget.log`. Run `bash install.sh` once to set this up; after code changes use the `kickstart` command above.
