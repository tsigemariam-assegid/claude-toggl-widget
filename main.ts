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
import { getClaudeStats, getClaudeWorkBlocks } from './parser';
import { getTogglStats, fetchTogglProjects, getWorkspaceId, getOrCreateProject, getOrCreateTag, createTimeEntry } from './toggl';
import type { TogglStats, TogglProject } from './toggl';

let tray: Tray | null = null;
let win: BrowserWindow | null = null;
let refreshInterval: NodeJS.Timeout | null = null;
let cachedUsageLimits: UsageLimits | null = null;

const CLAUDE_DIR = path.join(os.homedir(), '.claude', 'projects');

function tokenPath(): string {
  return path.join(app.getPath('userData'), 'toggl-token.enc');
}

function togglCachePath(): string {
  return path.join(app.getPath('userData'), 'toggl-cache.json');
}
function loadTogglCache(): TogglStats | null {
  try {
    const p = togglCachePath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return null; }
}
function saveTogglCache(stats: TogglStats): void {
  try { fs.writeFileSync(togglCachePath(), JSON.stringify(stats)); } catch {}
}

// Toggl project metadata changes rarely but counts against the hourly rate cap,
// so it's fetched infrequently and cached on disk. Caching it also keeps real
// project names showing during a rate-limited window instead of "Project <id>".
let cachedProjects: TogglProject[] = [];
let projectsFetchedAt = 0;
const PROJECTS_TTL_MS = 30 * 60 * 1000;
function projectsCachePath(): string {
  return path.join(app.getPath('userData'), 'toggl-projects-cache.json');
}
function loadProjectsCache(): TogglProject[] {
  try {
    const p = projectsCachePath();
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return []; }
}
function saveProjectsCache(projects: TogglProject[]): void {
  try { fs.writeFileSync(projectsCachePath(), JSON.stringify(projects)); } catch {}
}

// ── Toggl rate-limit gate ───────────────────────────────────────────────────────
// Toggl's free tier allows 30 requests/hour. When we exceed it the API returns
// 402/429 and tells us when the quota resets. We honor that: no Toggl request is
// made while blocked, so we stop wasting calls and recover cleanly. Persisted so
// a restart (e.g. a code change) doesn't immediately hammer a still-limited API.
let togglBlockedUntil = 0; // epoch ms
function rateLimitPath(): string {
  return path.join(app.getPath('userData'), 'toggl-ratelimit.json');
}
function loadRateLimit(): void {
  try { togglBlockedUntil = JSON.parse(fs.readFileSync(rateLimitPath(), 'utf8')).blockedUntil ?? 0; }
  catch { togglBlockedUntil = 0; }
}
function saveRateLimit(): void {
  try { fs.writeFileSync(rateLimitPath(), JSON.stringify({ blockedUntil: togglBlockedUntil })); } catch {}
}
function togglBlockedMs(): number {
  return Math.max(0, togglBlockedUntil - Date.now());
}
// If err is a Toggl rate-limit error, set the backoff window from its reset hint.
function noteTogglError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (!/\b402\b|\b429\b|hourly limit|Too Many Requests/i.test(msg)) return;
  const m = msg.match(/reset in (\d+) seconds/i);
  const secs = m ? parseInt(m[1], 10) : 15 * 60; // default 15 min if no hint
  togglBlockedUntil = Date.now() + secs * 1000;
  saveRateLimit();
  console.log(`[toggl] rate-limited — pausing Toggl calls for ${Math.ceil(secs / 60)}m`);
}

interface ApprovedEntry {
  blockKey: string;     // original block key, for dedup (unchanged even if start was edited)
  description: string;
  start: string;        // ISO
  stop: string;         // ISO
}

interface SyncState {
  syncedBlocks: Record<string, { togglEntryId: number; syncedAt: string }>;
  cachedWorkspaceId: number | null;
  cachedProjectId: number | null;
  cachedTagId: number | null;
  lastSyncAt: string | null;
}

function syncStatePath(): string {
  return path.join(app.getPath('userData'), 'claude-toggl-sync.json');
}

function loadSyncState(): SyncState {
  try {
    const p = syncStatePath();
    if (!fs.existsSync(p)) return { syncedBlocks: {}, cachedWorkspaceId: null, cachedProjectId: null, cachedTagId: null, lastSyncAt: null };
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { syncedBlocks: {}, cachedWorkspaceId: null, cachedProjectId: null, cachedTagId: null, lastSyncAt: null };
  }
}

function saveSyncState(state: SyncState): void {
  fs.writeFileSync(syncStatePath(), JSON.stringify(state, null, 2));
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

function usageCachePath(): string {
  return path.join(app.getPath('userData'), 'usage-limits-cache.json');
}
function loadUsageCache(): UsageLimits | null {
  try {
    const p = usageCachePath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return null; }
}
function saveUsageCache(limits: UsageLimits): void {
  try { fs.writeFileSync(usageCachePath(), JSON.stringify(limits)); } catch {}
}

// Fetch fresh limits and, only if they carry real data, update the in-memory
// cache and persist to disk. A token-less or failed fetch leaves the last
// known-good value untouched so the UI never regresses to parser fallbacks.
async function refreshUsageLimits(): Promise<UsageLimits | null> {
  try {
    const fresh = await fetchUsageLimits();
    if (fresh.fiveHour || fresh.sevenDay || fresh.sevenDaySonnet) {
      cachedUsageLimits = fresh;
      saveUsageCache(fresh);
    }
  } catch {
    // keep existing cachedUsageLimits
  }
  return cachedUsageLimits;
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
    // If we already have a value (seeded from disk at startup), return it
    // immediately and refresh in the background so the UI never flashes wrong
    // parser-fallback numbers. Only block on the network when we have nothing.
    if (cachedUsageLimits) {
      refreshUsageLimits();
      return cachedUsageLimits;
    }
    return refreshUsageLimits();
  });

  // Toggl IPC
  loadRateLimit();
  cachedProjects = loadProjectsCache(); // seed names from disk so they show immediately
  ipcMain.handle('get-toggl-stats', async (_event, token: string) => {
    // While rate-limited, spend no calls — serve the last cached stats.
    if (togglBlockedMs() > 0) {
      const cached = loadTogglCache();
      if (cached) return cached;
      throw new Error(`Toggl rate-limited — retry in ${Math.ceil(togglBlockedMs() / 60000)}m`);
    }
    // Refresh project metadata only occasionally (it rarely changes) to keep the
    // per-poll request count — and thus the hourly rate usage — low.
    if (cachedProjects.length === 0 || Date.now() - projectsFetchedAt > PROJECTS_TTL_MS) {
      try {
        const fresh = await fetchTogglProjects(token);
        if (fresh.length > 0) {
          cachedProjects = fresh; projectsFetchedAt = Date.now(); saveProjectsCache(fresh);
        }
      } catch (e) {
        noteTogglError(e); // a rate-limit here blocks the time-entries call below too
      }
    }
    if (togglBlockedMs() > 0) {
      const cached = loadTogglCache();
      if (cached) return cached;
      throw new Error(`Toggl rate-limited — retry in ${Math.ceil(togglBlockedMs() / 60000)}m`);
    }
    try {
      const stats = await getTogglStats(token, cachedProjects);
      saveTogglCache(stats);
      return stats;
    } catch (err) {
      noteTogglError(err);
      const cached = loadTogglCache();
      if (cached) return cached;
      throw err;
    }
  });

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

  // Return the de-duped, not-yet-synced work blocks so the renderer can show a
  // review list. Nothing is pushed to Toggl here.
  ipcMain.handle('get-toggl-sync-preview', async () => {
    const blocks = await getClaudeWorkBlocks(7);
    const state  = loadSyncState();
    return blocks.filter(b => !state.syncedBlocks[b.blockKey]);
  });

  // Push only the entries the user approved (with any edits to title/start/stop).
  // Each entry carries its original blockKey so dedup still works even if the
  // displayed start was edited.
  ipcMain.handle('sync-claude-to-toggl', async (_event, token: string, entries: ApprovedEntry[]) => {
    const state = loadSyncState();
    const pending = entries.filter(e => !state.syncedBlocks[e.blockKey]);

    const rateLimitedResult = () => {
      state.lastSyncAt = new Date().toISOString();
      saveSyncState(state);
      return { synced: 0, failed: pending.length, firstError: `Toggl rate-limited — retry in ${Math.ceil(togglBlockedMs() / 60000)}m`, lastSyncAt: state.lastSyncAt };
    };

    if (pending.length === 0) {
      state.lastSyncAt = new Date().toISOString();
      saveSyncState(state);
      return { synced: 0, failed: 0, firstError: null, lastSyncAt: state.lastSyncAt };
    }
    if (togglBlockedMs() > 0) return rateLimitedResult();

    // One-time setup calls — IDs are persisted in sync state, so this is paid once.
    try {
      if (!state.cachedWorkspaceId) state.cachedWorkspaceId = await getWorkspaceId(token);
      if (!state.cachedProjectId)   state.cachedProjectId   = await getOrCreateProject(token, state.cachedWorkspaceId, 'Side Project');
      if (!state.cachedTagId)       state.cachedTagId       = await getOrCreateTag(token, state.cachedWorkspaceId, 'coding');
      saveSyncState(state);
    } catch (err) {
      noteTogglError(err);
      if (togglBlockedMs() > 0) return rateLimitedResult();
      throw err;
    }
    const wid = state.cachedWorkspaceId!;
    const projectId = state.cachedProjectId!;
    const tagId = state.cachedTagId!;

    let synced = 0;
    let failed = 0;
    let firstError: string | null = null;
    let stoppedForRateLimit = false;
    for (const entry of pending) {
      try {
        const entryId = await createTimeEntry(token, wid, projectId, tagId, entry.description, entry.start, entry.stop);
        state.syncedBlocks[entry.blockKey] = { togglEntryId: entryId, syncedAt: new Date().toISOString() };
        synced++;
        saveSyncState(state); // persist after each entry so partial progress survives a later failure
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        noteTogglError(err);
        if (togglBlockedMs() > 0) {
          // Hit the rate limit — stop hammering. Remaining entries stay unsynced
          // and retry on the next push once the quota resets.
          stoppedForRateLimit = true;
          if (!firstError) firstError = msg;
          break;
        }
        // Otherwise skip this one entry and keep going — one malformed entry
        // must not abort the batch. Not recorded, so it retries next time.
        failed++;
        if (!firstError) firstError = msg;
        console.error(`[sync] block ${entry.blockKey} failed:`, msg);
      }
    }

    if (stoppedForRateLimit) {
      const untried = pending.length - synced - failed;
      firstError = `Toggl rate-limited after ${synced} — ${untried} left, retry in ${Math.ceil(togglBlockedMs() / 60000)}m`;
      failed += untried;
    }

    state.lastSyncAt = new Date().toISOString();
    saveSyncState(state);
    return { synced, failed, firstError, lastSyncAt: state.lastSyncAt };
  });

  // Seed from disk instantly so a fresh restart never shows null limits (which
  // would make the renderer fall back to wrong parser-derived values), then
  // refresh from the network in the background.
  cachedUsageLimits = loadUsageCache();
  refreshUsageLimits();
  setInterval(refreshUsageLimits, 5 * 60 * 1000);

  await refreshClaudeStats();
  setupFileWatcher();
});

app.on('window-all-closed', () => { /* keep running */ });
app.on('before-quit', () => {
  if (refreshInterval) clearInterval(refreshInterval);
  win?.removeAllListeners('blur');
});
