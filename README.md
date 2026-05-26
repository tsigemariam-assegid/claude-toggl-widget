# Claude Toggl Widget

A macOS menu bar app that surfaces Claude Code usage stats and Toggl time tracking in a single floating panel.

![screenshot placeholder]

## Features

**Claude Code tab**
- Concentric rings showing real quota usage (session 5hr, weekly, weekly Sonnet) — sourced from the Anthropic API, same as `/usage` in Claude Code
- Hover any ring or legend row to see that category's token count and reset time in the center
- Activity heatmap (12 weeks) + streak counter
- Activity by hour chart
- Token usage by project

**Toggl tab**
- Today's tracked time and weekly total
- Breakdown by project with color indicators
- Live tracking indicator for the active entry

**General**
- Runs as a macOS Login Item — starts automatically, no terminal needed
- Tray icon shows current streak count
- Auto-refreshes on every Claude Code session change (file watcher)

## Requirements

- macOS (tested on macOS 14+)
- Node.js 20+
- Claude Code installed and signed in (for quota data)
- Toggl account (optional)

## Install

```bash
git clone https://github.com/tsigemariam-assegid/claude-toggl-widget.git
cd claude-toggl-widget
npm install
bash install.sh
```

`install.sh` builds the app, installs it as a launchd Launch Agent, and starts it. The widget will appear in your menu bar and auto-start on every login.

## Development

```bash
npm run dev    # hot-reload dev server
```

After making changes while the agent is running:
```bash
npm run build && launchctl kickstart -k gui/$(id -u)/com.local.claude-widget
```

## Managing the background agent

```bash
launchctl list | grep claude-widget                                              # check status
tail -f /tmp/claude-widget.log                                                   # logs
launchctl unload ~/Library/LaunchAgents/com.local.claude-widget.plist            # stop
launchctl load   ~/Library/LaunchAgents/com.local.claude-widget.plist            # restart
```

## How it works

- **Claude stats** are parsed from `~/.claude/projects/**/*.jsonl` (local, no API key needed for token counts)
- **Quota + reset times** are fetched from `api.anthropic.com/api/oauth/usage` using the OAuth token Claude Code stores in your macOS Keychain — no extra auth required
- **Toggl stats** are fetched from the Toggl Track API v9 using a personal API token you enter in the app
- All credentials stay on-device (macOS Keychain / Electron safeStorage)

## Stack

Electron 30 · React 18 · TypeScript · electron-vite
