import {
  app,
  BrowserWindow,
  Tray,
  ipcMain,
  nativeImage,
  screen,
  safeStorage,
} from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFileSync } from 'child_process';
import https from 'https';
import { getClaudeStats } from './parser';
import { getTogglStats } from './toggl';

let tray: Tray | null = null;
let win: BrowserWindow | null = null;
let refreshInterval: NodeJS.Timeout | null = null;
let cachedUsageLimits: UsageLimits | null = null;

const CLAUDE_DIR = path.join(os.homedir(), '.claude', 'projects');

function tokenPath(): string {
  return path.join(app.getPath('userData'), 'toggl-token.enc');
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 360,
    height: 540,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    w.loadURL('http://localhost:5173');
  } else {
    w.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  w.on('blur', () => {
    if (!w?.webContents.isDevToolsOpened()) w?.hide();
  });

  return w;
}

function positionWindowBelowTray() {
  if (!win || !tray) return;
  const tb = tray.getBounds();
  const [ww, wh] = win.getSize();
  const display = screen.getDisplayNearestPoint({ x: tb.x, y: tb.y });
  let x = Math.round(tb.x + tb.width / 2 - ww / 2);
  let y = Math.round(tb.y + tb.height + 4);
  x = Math.max(display.workArea.x, Math.min(x, display.workArea.x + display.workArea.width - ww));
  win.setPosition(x, y, false);
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function calcStreak(activityByDay: Record<string, number>): number {
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    if ((activityByDay[iso] ?? 0) > 0) streak++;
    else break;
  }
  return streak;
}

async function refreshClaudeStats() {
  try {
    const stats = await getClaudeStats();
    const streak = calcStreak(stats.activityByDay);
    tray?.setTitle(streak > 0 ? ` ${streak}` : '');
    const tokens = stats.today.tokens;
    tray?.setToolTip(`Claude Code · ${fmtTokens(tokens)} tokens today · ${streak}d streak`);
    if (win && !win.isDestroyed()) {
      win.webContents.send('stats-update', stats);
    }
    return stats;
  } catch (err) {
    console.error('Claude parse error:', err);
    tray?.setTitle('err');
  }
}

function setupFileWatcher() {
  try {
    fs.watch(CLAUDE_DIR, { recursive: true }, (_e, f) => {
      if (f?.endsWith('.jsonl')) refreshClaudeStats();
    });
  } catch {
    refreshInterval = setInterval(refreshClaudeStats, 30_000);
  }
}

export interface UsageLimits {
  fiveHour:       { utilization: number; resetsAt: string } | null;
  sevenDay:       { utilization: number; resetsAt: string } | null;
  sevenDaySonnet: { utilization: number; resetsAt: string } | null;
}

function readClaudeOAuthToken(): string | null {
  try {
    const raw = execFileSync('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { timeout: 3000 }).toString().trim();
    const parsed = JSON.parse(raw);
    return parsed?.claudeAiOauth?.accessToken ?? null;
  } catch {
    return null;
  }
}

function httpsGet(url: string, headers: Record<string, string>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchUsageLimits(): Promise<UsageLimits> {
  const token = readClaudeOAuthToken();
  if (!token) return { fiveHour: null, sevenDay: null, sevenDaySonnet: null };

  const data = await httpsGet('https://api.anthropic.com/api/oauth/usage', {
    Authorization: `Bearer ${token}`,
    'anthropic-beta': 'interstitial-1',
  }) as Record<string, { utilization: number | null; resets_at?: string }>;

  function parse(field: typeof data[string]) {
    if (!field || field.utilization === null) return null;
    return { utilization: field.utilization, resetsAt: field.resets_at ?? '' };
  }

  return {
    fiveHour:       parse(data.five_hour),
    sevenDay:       parse(data.seven_day),
    sevenDaySonnet: parse(data.seven_day_sonnet),
  };
}

app.whenReady().then(async () => {
  app.dock?.hide();

  const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/icon.png'));
  const icon2x = nativeImage.createFromPath(path.join(__dirname, '../assets/icon@2x.png'));
  if (!icon2x.isEmpty()) {
    icon.addRepresentation({ scaleFactor: 2, buffer: icon2x.toBitmap(), width: 47, height: 38 });
  }
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setTitle('···');

  win = createWindow();

  tray.on('click', async () => {
    if (!win) return;
    if (win.isVisible()) {
      win.hide();
    } else {
      const stats = await refreshClaudeStats();
      positionWindowBelowTray();
      win.show();
      win.focus();
      if (stats) win.webContents.send('stats-update', stats);
    }
  });

  // Claude IPC
  ipcMain.handle('get-stats', () => getClaudeStats());
  ipcMain.handle('get-usage-limits', async () => {
    cachedUsageLimits = await fetchUsageLimits();
    return cachedUsageLimits;
  });

  // Toggl IPC
  ipcMain.handle('get-toggl-stats', (_event, token: string) =>
    getTogglStats(token)
  );

  ipcMain.handle('get-toggl-token', () => {
    try {
      const p = tokenPath();
      if (!fs.existsSync(p)) return null;
      const encrypted = fs.readFileSync(p);
      return safeStorage.decryptString(encrypted);
    } catch { return null; }
  });

  ipcMain.handle('save-toggl-token', (_event, token: string) => {
    const encrypted = safeStorage.encryptString(token);
    fs.writeFileSync(tokenPath(), encrypted);
  });

  // Seed limits cache before first stats refresh so window anchors are available immediately
  cachedUsageLimits = await fetchUsageLimits().catch(() => null);
  setInterval(async () => {
    cachedUsageLimits = await fetchUsageLimits().catch(() => cachedUsageLimits);
  }, 5 * 60 * 1000);

  await refreshClaudeStats();
  setupFileWatcher();
});

app.on('window-all-closed', () => { /* keep running */ });
app.on('before-quit', () => {
  if (refreshInterval) clearInterval(refreshInterval);
  win?.removeAllListeners('blur');
});
