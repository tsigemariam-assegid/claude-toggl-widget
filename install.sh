#!/bin/bash
set -e

PROJ="$(cd "$(dirname "$0")" && pwd)"
ELECTRON="$PROJ/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
PLIST="$HOME/Library/LaunchAgents/com.local.claude-widget.plist"
LABEL="com.local.claude-widget"

echo "→ Building…"
cd "$PROJ"
npm run build

echo "→ Writing LaunchAgent plist…"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$ELECTRON</string>
    <string>$PROJ</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardErrorPath</key>
  <string>/tmp/claude-widget.log</string>
  <key>StandardOutPath</key>
  <string>/tmp/claude-widget.log</string>
</dict>
</plist>
EOF

echo "→ Loading LaunchAgent…"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
launchctl start "$LABEL"

echo "✓ Done. The widget will now start automatically on login."
echo "  Logs: tail -f /tmp/claude-widget.log"
echo "  Stop: launchctl unload ~/Library/LaunchAgents/com.local.claude-widget.plist"
