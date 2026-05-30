// Shared renderer types + the window.claudeAPI IPC surface.

export interface ProjectStats {
  project: string;
  tokens: number;
  cost: number;
  sessions: number;
  messages: number;
}

export interface ActiveSession {
  sessionId: string;
  project: string;
  tokens: number;
  cost: number;
  messages: number;
  startedAt: string;
  lastActivityAt: string;
}

export interface ClaudeStats {
  today: { tokens: number; cost: number; sessions: number; messages: number };
  week:  { tokens: number; cost: number; sessions: number; messages: number };
  total: { tokens: number; cost: number; sessions: number; messages: number };
  currentSession: { tokens: number; cost: number; startedAt: string };
  session5h: { tokens: number; cost: number; messages: number; windowStart: string };
  session5hResetsAt: string | null;
  sonnetWeek: { tokens: number; cost: number };
  weekResetsAt: string | null;
  activeSessions: ActiveSession[];
  lastSessionAt: string | null;
  byProject: ProjectStats[];
  byModel: { model: string; tokens: number; cost: number }[];
  activityByHour: number[];
  activityByDay: Record<string, number>;
  dailyValue: Record<string, { cost: number; tokens: number; cacheSavings: number }>;
  cacheSavingsTotal: number;
  lastUpdated: string;
}

export interface TogglProjectStats {
  project: string;
  color: string;
  seconds: number;
  entries: number;
}

export interface TogglStats {
  today: { seconds: number; entries: number; isTracking: boolean; currentEntry: string | null };
  week:  { seconds: number; entries: number };
  byProject: TogglProjectStats[];
  lastUpdated: string;
}

export interface UsageLimitEntry { utilization: number; resetsAt: string }
export interface UsageLimitsAPI {
  fiveHour:       UsageLimitEntry | null;
  sevenDay:       UsageLimitEntry | null;
  sevenDaySonnet: UsageLimitEntry | null;
}

declare global {
  interface Window {
    claudeAPI?: {
      getStats:          () => Promise<ClaudeStats>;
      getUsageLimits:    () => Promise<UsageLimitsAPI>;
      getTogglStats:     (token: string) => Promise<TogglStats>;
      onStatsUpdate:     (cb: (s: ClaudeStats) => void) => () => void;
      getTogglToken:     () => Promise<string | null>;
      saveTogglToken:    (token: string) => Promise<void>;
      getTogglSyncPreview: () => Promise<{ blockKey: string; project: string; start: string; stop: string; durationSeconds: number }[]>;
      syncClaudeToToggl: (
        token: string,
        entries: { blockKey: string; description: string; start: string; stop: string }[],
      ) => Promise<{ synced: number; failed: number; firstError: string | null; lastSyncAt: string }>;
    };
  }
}
