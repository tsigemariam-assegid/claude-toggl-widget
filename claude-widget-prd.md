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
- Toggl write operations (starting/stopping timers).

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

Toggl Track API v9. Authenticated with a personal API token (HTTP Basic, stored encrypted). Polled every 60 seconds.

| Field | Endpoint | Used for |
|---|---|---|
| `start` / `stop` / `duration` | `GET /me/time_entries` | Hours calculation |
| `project_id` | `GET /me/time_entries` | Project grouping |
| `duration < 0` | `GET /me/time_entries` | Running timer detection |
| `description` | `GET /me/time_entries` | Current entry label |
| `name` / `color` | `GET /me/projects` | Project display |

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
- Hourly activity bar chart (today view only).
- Project breakdown with proportional bars (top 4).
- Model breakdown with token count and cost per model.

**Toggl tab**
- Live running timer indicator (pulsing green dot + description).
- Today: total hours, entry count.
- This week: total hours, entry count.
- Project breakdown with Toggl project colors (top 5, week view).
- API token input + secure save flow on first launch.

---

## 6. Technical Architecture

| Layer | Technology | Responsibility |
|---|---|---|
| Shell | Electron 30 | Tray, BrowserWindow, IPC, file watcher |
| Main process | Node.js + TypeScript | JSONL parsing, Toggl fetching, token storage |
| Renderer | React 18 + TypeScript | UI, state management |
| Bundler | electron-vite + Vite | Dev server, production build |
| Security | Electron safeStorage | Toggl token encrypted via macOS Keychain |

**IPC Handlers**

| Channel | Direction | Description |
|---|---|---|
| `get-stats` | renderer → main | Fetch parsed Claude Code stats |
| `stats-update` | main → renderer | Push stats on file change |
| `get-toggl-stats` | renderer → main | Fetch Toggl data for a given token |
| `get-toggl-token` | renderer → main | Read encrypted token from disk |
| `save-toggl-token` | renderer → main | Encrypt and persist token |

---

## 7. File Structure

```
claude-widget/
  electron/
    main.ts        — Tray, window, IPC, file watcher
    parser.ts      — JSONL parser for ~/.claude/projects/
    toggl.ts       — Toggl API v9 client
    preload.ts     — Context bridge (IPC surface for renderer)
  src/
    App.tsx        — Two-tab UI (Claude + Toggl panels)
    main.tsx       — React entry point
  assets/
    icon.png       — 22×22px monochrome menu bar icon
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
| Secure token storage | ✓ | |
| Historical charts (30d, all time) | | ✓ |
| Cache efficiency metric | | ✓ |
| Toggl start/stop timer | | ✓ |
| Streak tracking | | ✓ |
| Packaged .app / auto-update | | ✓ |

---

## 9. Open Questions

- **Pricing accuracy** — model prices in `parser.ts` are estimates. Verify against anthropic.com/pricing before relying on cost figures.
- **CORS in production** — Toggl fetch runs in the renderer. If blocked in the packaged app, move the call to the main process.
- **Icon asset** — a 22×22px monochrome PNG is needed for the tray. Without it the tray shows blank (title label still works).
- **Week definition** — currently "last 7 rolling days". Should it be Mon–Sun calendar week?
- **Toggl workspace** — current implementation fetches from the default workspace. Multi-workspace users may need a selector.
