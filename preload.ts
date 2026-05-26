import { contextBridge, ipcRenderer } from 'electron';
import type { ClaudeStats } from './parser';
import type { TogglStats } from './toggl';
import type { UsageLimits } from './main';

contextBridge.exposeInMainWorld('claudeAPI', {
  // Claude Code
  getStats: (): Promise<ClaudeStats> =>
    ipcRenderer.invoke('get-stats'),
  getUsageLimits: (): Promise<UsageLimits> =>
    ipcRenderer.invoke('get-usage-limits'),
  onStatsUpdate: (cb: (stats: ClaudeStats) => void) => {
    ipcRenderer.on('stats-update', (_event, stats) => cb(stats));
    return () => ipcRenderer.removeAllListeners('stats-update');
  },

  // Toggl
  getTogglStats: (token: string): Promise<TogglStats> =>
    ipcRenderer.invoke('get-toggl-stats', token),
  getTogglToken: (): Promise<string | null> =>
    ipcRenderer.invoke('get-toggl-token'),
  saveTogglToken: (token: string): Promise<void> =>
    ipcRenderer.invoke('save-toggl-token', token),
});
