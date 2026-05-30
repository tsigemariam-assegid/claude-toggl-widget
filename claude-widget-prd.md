# Claude Code + Toggl — macOS Menu Bar Widget
**Product Requirements Document** · v0.1 · May 2026 · Status: Draft

| | |
|---|---|
| Author | Mar |
| Stack | Electron + React + TypeScript |
| Repo | `claude-widget/` |

---

## 1. Overview

A lightweight macOS menu bar app that surfaces Claude Code usage stats and Toggl time tracking data in a single floating panel. The two data sources are displayed independently — no correlation or joined logic.

The target user is a developer or freelancer who uses Claude Code daily and tracks time in Toggl, and wants a fast glance at both without opening a browser or separate app.

---

## 2. Problem

- Claude Code usage (tokens, cost, sessions) is only visible inside the Claude Code app — no ambient awareness while working.
- Toggl data requires opening the web app or mobile app to check.
- No single surface combines both for a developer's daily overview.

---

## 3. Goals

- Surface today's Claude Code token usage and cost at a glance from the menu bar.
- Show Toggl time tracked today and this week, with project breakdown.
- Auto-refresh without manual action — reactive to Claude Code file changes.
- Store credentials securely using macOS Keychain via Electron `safeStorage`.
- Stay out of the way: no dock icon, no notifications, dismiss on click-outside.

**Non-goals**
- Correlation or joined analysis between Claude and Toggl data.
- Historical charts or trend analysis beyond the current week.
- Cloud sync or multi-device support.
- Toggl start/stop timer control.

---

## 4. Data Sources

### 4.1 Claude Code

Claude Code writes one JSONL file per session to `~/.claude/projects/<project>/`. Each file contains typed records; `assistant` records carry the usage payload.

| Field | Source | Used for |
|---|---|---|
| `input_tokens` / `output_tokens` | `message.usage` | Token count, cost calculation |
| `cache_read` / `cache_creation` tokens | `message.usage` | Cache efficiency |
| `message.model` | `message.model` | Per-model cost breakdown |
| `timestamp` | `entry.timestamp` | Today/week filtering, peak hour |
| `sessionId` | `entry.sessionId` | Session count |
| `cwd` | `entry.cwd` | Project name (basename) |
| `isSidechain` | `entry.isSidechain` | Subagent detection |

Cost is computed per message using model-specific pricing ($/M tokens for input, output, cache creation, cache read). Prices are configurable and should be verified against [anthropic.com/pricing](https://anthropic.com/pricing).

The parser watches `~/.claude/projects/` with `fs.watch` for reactive updates. Falls back to 30-second polling if the watcher fails.

### 4.2 Toggl

Toggl Track API v9. Authenticated with a personal API token stored encrypted via `safeStorage` (macOS Keychain). Entered once via the in-app UI and persists across restarts. Polled every 3 minutes to stay within Toggl's free-tier rate limit (30 req/hr; exceeding it returns 402). The last successful response is cached to disk so the UI stays populated during rate-limit windows.

**Read endpoints:**

| Field | Endpoint | Used for |
|---|---|---|
| `start` / `stop` / `duration` | `GET /me/time_entries` | Hours calculation |
| `project_id` | `GET /me/time_entries` | Project grouping |
| `duration < 0` | `GET /me/time_entries` | Running timer detection |
| `description` | `GET /me/time_entries` | Current entry label |
| `name` / `color` | `GET /me/projects` | Project display |

**Write endpoints (Claude→Toggl sync):**

| Endpoint | Used for |
|---|---|
| `GET /me` | Resolve default workspace ID |
| `GET /workspaces/{wid}/projects` | Find existing "Side Project" |
| `POST /workspaces/{wid}/projects` | Create "Side Project" if absent |
| `GET /workspaces/{wid}/tags` | Find existing "coding" tag |
| `POST /workspaces/{wid}/tags` | Create "coding" tag if absent |
| `POST /workspaces/{wid}/time_entries` | Create one entry per work block |

---

## 5. Features

### 5.1 Menu Bar

- Icon + text label showing today's Claude Code token count (e.g. `42k`, `1.2M`).
- Tooltip shows tokens + cost on hover.
- Single click toggles the floating panel.

### 5.2 Floating Panel

380×540px frameless window with macOS vibrancy (frosted glass). Dismisses on focus loss. Always on top. No dock icon.

**Claude tab**
- Toggle: Today / Week / Total.
- Stat grid: tokens, cost, sessions, messages.
- Concentric rings showing quota utilization (outermost → innermost): Weekly (7-day), Weekly Sonnet, Session (5hr).
- Session ring shows idle state ("idle · last Xm ago") when no activity in the last 5 hours.
- Session ring label shows `×N` when N concurrent Claude Code sessions are active in the window.
- Ring reset countdowns derived from file data when the Anthropic API is unavailable.
- Hourly activity bar chart (today view only).
- Project breakdown with proportional bars (top 4).
- Model breakdown with token count and cost per model.

**Toggl tab**
- Live running timer indicator (pulsing green dot + description).
- Today: total hours, entry count.
- This week: total hours, entry count.
- Project breakdown with Toggl project colors (top 5, week view).
- "sync claude → toggl" button — pushes completed Claude work blocks as Toggl entries (project: "Side Project", tag: "coding", description: Claude project folder name). Synced entries are deduplicated across runs.

---

## 6. Technical Architecture

| Layer | Technology | Responsibility |
|---|---|---|
| Shell | Electron 30 | Tray, BrowserWindow, IPC, file watcher |
| Main process | Node.js + TypeScript | JSONL parsing, Toggl fetching, sync logic |
| Renderer | React 18 + TypeScript | UI, state management |
| Bundler | electron-vite + Vite | Dev server, production build |
| Security | Electron `safeStorage` | Toggl token encrypted via macOS Keychain |

**IPC Handlers**

| Channel | Direction | Description |
|---|---|---|
| `get-stats` | renderer → main | Fetch parsed Claude Code stats |
| `stats-update` | main → renderer | Push stats on file change |
| `get-usage-limits` | renderer → main | Fetch Anthropic quota utilization |
| `get-toggl-stats` | renderer → main | Fetch Toggl data (falls back to disk cache on 402) |
| `get-toggl-token` | renderer → main | Read encrypted token from disk |
| `save-toggl-token` | renderer → main | Encrypt and persist token |
| `sync-claude-to-toggl` | renderer → main | Push completed Claude work blocks to Toggl |

---

## 7. File Structure

```
claude-widget/       (flat layout — no src/ or electron/ subdirectory)
  main.ts            — Tray, window, IPC, file watcher, sync logic
  parser.ts          — JSONL parser + work-block segmentation
  toggl.ts           — Toggl API v9 client (read + write)
  preload.ts         — Context bridge (IPC surface for renderer)
  App.tsx            — Two-tab UI (Claude + Toggl panels)
  main.tsx           — React entry point
  assets/            — Tray icon PNGs
  index.html
  electron.vite.config.ts
  package.json
  tsconfig.json
```

---

## 8. MVP Scope

| Feature | MVP | Post-MVP |
|---|---|---|
| Menu bar token label | ✓ | |
| Claude today / week / total stats | ✓ | |
| Claude project breakdown | ✓ | |
| Claude model breakdown | ✓ | |
| Hourly activity bar | ✓ | |
| Toggl today + week hours | ✓ | |
| Toggl project breakdown | ✓ | |
| Running timer indicator | ✓ | |
| Secure token storage (macOS Keychain) | ✓ | |
| Claude→Toggl session sync | ✓ | |
| Historical charts (30d, all time) | | ✓ |
| Cache efficiency metric | | ✓ |
| Toggl start/stop timer | | ✓ |
| Streak tracking | ✓ | |
| Multi-session tracking (concurrent terminals) | ✓ | |
| Idle state for session ring | ✓ | |
| API-anchored rolling windows | ✓ | |
| Packaged .app / auto-update | | ✓ |

---

## 9. Open Questions

- **Pricing accuracy** — model prices in `parser.ts` are estimates. Verify against anthropic.com/pricing before relying on cost figures.
- **Toggl rate limits** — free tier allows 30 req/hr per user. The 3-minute poll uses ~20/hr; a single sync adds ~4 + N requests. Heavy sync usage on the free tier may still hit the cap. Toggl returns 402 (not 429) when the limit is exceeded; the cache prevents UI disruption but data will be stale until the window resets.
- **Work block idle gap** — currently 25 minutes (`IDLE_GAP_MS` in `parser.ts`). Gaps shorter than this within a session are treated as continuous work. Adjust if your workflow has different break patterns.
- **Week definition** — rolling 7 days anchored to `sevenDay.resetsAt` from the Anthropic API when available; otherwise `now - 7d`. Calendar-week alignment is not planned.
- **Toggl workspace** — sync targets the default workspace (`GET /me → default_workspace_id`). Multi-workspace users may need a selector.
