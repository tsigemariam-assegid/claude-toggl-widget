import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

const CLAUDE_DIR = path.join(os.homedir(), '.claude', 'projects');

// Prices per million tokens — verify at anthropic.com/pricing
const PRICING: Record<string, { input: number; output: number; cacheCreate: number; cacheRead: number }> = {
  'claude-opus-4-7':    { input: 15.00, output: 75.00, cacheCreate: 18.75, cacheRead: 1.50 },
  'claude-sonnet-4-6':  { input: 3.00,  output: 15.00, cacheCreate: 3.75,  cacheRead: 0.30 },
  'claude-haiku-4-5':   { input: 0.80,  output: 4.00,  cacheCreate: 1.00,  cacheRead: 0.08 },
  'default':            { input: 3.00,  output: 15.00, cacheCreate: 3.75,  cacheRead: 0.30 },
};

export interface UsageRecord {
  timestamp: string;       // ISO string
  uuid: string;            // unique per assistant message; stable across session resumes/forks
  sessionId: string;
  project: string;         // derived from cwd basename
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  cost: number;            // USD
}

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
  session5h: { tokens: number; cost: number; messages: number; windowStart: string; oldestTimestamp: string | null };
  session5hResetsAt: string | null;
  sonnetWeek: { tokens: number; cost: number; oldestTimestamp: string | null };
  weekOldestTimestamp: string | null;
  weekResetsAt: string | null;
  activeSessions: ActiveSession[];
  lastSessionAt: string | null;
  byProject: ProjectStats[];
  byModel: { model: string; tokens: number; cost: number }[];
  activityByHour: number[];   // index = hour 0-23, value = message count (today only)
  activityByDay: Record<string, number>;  // "YYYY-MM-DD" → message count
  dailyValue: Record<string, { cost: number; tokens: number; cacheSavings: number }>;  // "YYYY-MM-DD" → all-time value series
  cacheSavingsTotal: number;  // all-time $ saved by cache reads
  lastUpdated: string;
}

function calcCost(model: string, usage: Record<string, number>): number {
  const p = PRICING[model] ?? PRICING['default'];
  return (
    ((usage.input_tokens ?? 0) / 1_000_000) * p.input +
    ((usage.output_tokens ?? 0) / 1_000_000) * p.output +
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * p.cacheCreate +
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * p.cacheRead
  );
}

// $ saved by cache reads vs paying full input price, per model
function calcCacheSavings(model: string, cacheReadTokens: number): number {
  const p = PRICING[model] ?? PRICING['default'];
  return (cacheReadTokens / 1_000_000) * (p.input - p.cacheRead);
}

async function parseFile(filePath: string): Promise<UsageRecord[]> {
  const records: UsageRecord[] = [];
  try {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type !== 'assistant' || !entry.message?.usage) continue;

        const usage = entry.message.usage;
        const model = entry.message.model ?? 'default';
        const project = entry.cwd ? path.basename(entry.cwd) : 'unknown';

        records.push({
          timestamp: entry.timestamp ?? new Date().toISOString(),
          uuid: entry.uuid ?? '',
          sessionId: entry.sessionId ?? '',
          project,
          model,
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          cacheCreateTokens: usage.cache_creation_input_tokens ?? 0,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
          cost: calcCost(model, usage),
        });
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // skip unreadable files
  }
  return records;
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...walkDir(fullPath));
      else if (entry.name.endsWith('.jsonl')) results.push(fullPath);
    }
  } catch {
    // skip unreadable dirs
  }
  return results;
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    (acc[k] ??= []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function sumRecords(records: UsageRecord[]) {
  return {
    tokens: records.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0),
    cost:   records.reduce((s, r) => s + r.cost, 0),
    sessions: new Set(records.map(r => r.sessionId)).size,
    messages: records.length,
  };
}

const IDLE_GAP_MS = 25 * 60 * 1000; // gap that splits a session into separate work blocks

export interface WorkBlock {
  blockKey: string;        // "sessionId::blockStart" — dedup key for sync
  sessionId: string;
  project: string;         // path.basename(cwd) of the last record in the block
  start: string;           // ISO — first record
  stop: string;            // ISO — last record
  durationSeconds: number;
}

export async function getClaudeWorkBlocks(days: number): Promise<WorkBlock[]> {
  if (!fs.existsSync(CLAUDE_DIR)) return [];

  const files = walkDir(CLAUDE_DIR);
  const allRecords: UsageRecord[] = [];
  for (const file of files) {
    allRecords.push(...await parseFile(file));
  }
  allRecords.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // A resumed/forked Claude session re-writes the prior messages into a new
  // session file with a new sessionId but the SAME message `uuid`. Without
  // this dedup the same work is segmented under each sessionId, producing
  // duplicate and overlapping Toggl entries. Keep the first occurrence of
  // each uuid (stable, since records are already timestamp-sorted). Records
  // with no uuid (shouldn't happen for assistant messages) are kept as-is.
  const seenUuids = new Set<string>();
  const deduped = allRecords.filter(r => {
    if (!r.uuid) return true;
    if (seenUuids.has(r.uuid)) return false;
    seenUuids.add(r.uuid);
    return true;
  });

  const cutoff          = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const completedBefore = new Date(Date.now() - IDLE_GAP_MS).toISOString();
  const recent = deduped.filter(r => r.timestamp >= cutoff);

  const bySession = groupBy(recent, r => r.sessionId);
  const blocks: WorkBlock[] = [];

  for (const [sessionId, recs] of Object.entries(bySession)) {
    let blockStart = recs[0];
    let blockPrev  = recs[0];

    const closeBlock = (blockEnd: UsageRecord) => {
      const durationSeconds = Math.round(
        (new Date(blockEnd.timestamp).getTime() - new Date(blockStart.timestamp).getTime()) / 1000
      );
      if (durationSeconds >= 60 && blockEnd.timestamp < completedBefore) {
        blocks.push({
          blockKey: `${sessionId}::${blockStart.timestamp}`,
          sessionId,
          project: blockEnd.project,
          start: blockStart.timestamp,
          stop: blockEnd.timestamp,
          durationSeconds,
        });
      }
    };

    for (let i = 1; i < recs.length; i++) {
      const gap = new Date(recs[i].timestamp).getTime() - new Date(blockPrev.timestamp).getTime();
      if (gap > IDLE_GAP_MS) {
        closeBlock(blockPrev);
        blockStart = recs[i];
      }
      blockPrev = recs[i];
    }
    closeBlock(blockPrev);
  }

  return blocks;
}

export async function getClaudeStats(): Promise<ClaudeStats> {
  if (!fs.existsSync(CLAUDE_DIR)) {
    throw new Error(`Claude projects dir not found: ${CLAUDE_DIR}`);
  }

  const files = walkDir(CLAUDE_DIR);
  const allRecords: UsageRecord[] = [];

  for (const file of files) {
    const recs = await parseFile(file);
    allRecords.push(...recs);
  }

  allRecords.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
  const weekAgo      = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const todayRecords = allRecords.filter(r => r.timestamp.startsWith(todayStr));
  const weekRecords  = allRecords.filter(r => r.timestamp >= weekAgo);

  // By project
  const projectGroups = groupBy(allRecords, r => r.project);
  const byProject: ProjectStats[] = Object.entries(projectGroups)
    .map(([project, recs]) => ({ project, ...sumRecords(recs) }))
    .sort((a, b) => b.tokens - a.tokens);

  // By model
  const modelGroups = groupBy(allRecords, r => r.model);
  const byModel = Object.entries(modelGroups)
    .map(([model, recs]) => ({
      model,
      tokens: recs.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0),
      cost:   recs.reduce((s, r) => s + r.cost, 0),
    }))
    .sort((a, b) => b.tokens - a.tokens);

  // Activity by hour (today only)
  const activityByHour = new Array(24).fill(0);
  for (const r of todayRecords) {
    const hour = new Date(r.timestamp).getHours();
    activityByHour[hour]++;
  }

  // Activity by day (all-time, for heatmap) + per-day value series
  const activityByDay: Record<string, number> = {};
  const dailyValue: Record<string, { cost: number; tokens: number; cacheSavings: number }> = {};
  let cacheSavingsTotal = 0;
  for (const r of allRecords) {
    const day = r.timestamp.slice(0, 10);
    activityByDay[day] = (activityByDay[day] ?? 0) + 1;

    const savings = calcCacheSavings(r.model, r.cacheReadTokens);
    cacheSavingsTotal += savings;
    const dv = (dailyValue[day] ??= { cost: 0, tokens: 0, cacheSavings: 0 });
    dv.cost += r.cost;
    dv.tokens += r.inputTokens + r.outputTokens;
    dv.cacheSavings += savings;
  }

  // Current session: most recent sessionId
  const sessionGroups = groupBy(allRecords, r => r.sessionId);
  let currentSessionId = '';
  let latestTs = '';
  for (const [sid, recs] of Object.entries(sessionGroups)) {
    const maxTs = recs[recs.length - 1].timestamp;
    if (maxTs > latestTs) { latestTs = maxTs; currentSessionId = sid; }
  }
  const sessionRecs = sessionGroups[currentSessionId] ?? [];
  const sessionSum = sumRecords(sessionRecs);
  const currentSession = {
    tokens: sessionSum.tokens,
    cost: sessionSum.cost,
    startedAt: sessionRecs[0]?.timestamp ?? new Date().toISOString(),
  };

  // 5-hour session window (matches Anthropic's rolling session quota window)
  const session5hRecs = allRecords.filter(r => r.timestamp >= fiveHoursAgo);
  const session5hSum = sumRecords(session5hRecs);
  const session5h = {
    tokens: session5hSum.tokens,
    cost: session5hSum.cost,
    messages: session5hSum.messages,
    windowStart: fiveHoursAgo,
    oldestTimestamp: session5hRecs[0]?.timestamp ?? null,
  };

  // Derived reset time: when the oldest record in each window ages out
  const session5hResetsAt = session5hRecs.length > 0
    ? new Date(new Date(session5hRecs[0].timestamp).getTime() + 5 * 60 * 60 * 1000).toISOString()
    : null;

  const weekResetsAt = weekRecords.length > 0
    ? new Date(new Date(weekRecords[0].timestamp).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  // Active sessions: distinct sessionIds with any record in last 5h
  const active5hGroups = groupBy(session5hRecs, r => r.sessionId);
  const activeSessions: ActiveSession[] = Object.entries(active5hGroups).map(([sid, recs]) => ({
    sessionId: sid,
    project: recs[recs.length - 1].project,
    tokens: recs.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0),
    cost:   recs.reduce((s, r) => s + r.cost, 0),
    messages: recs.length,
    startedAt: recs[0].timestamp,
    lastActivityAt: recs[recs.length - 1].timestamp,
  })).sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));

  // Timestamp of the most recent message across all time (for idle display)
  const lastSessionAt = allRecords.length > 0 ? allRecords[allRecords.length - 1].timestamp : null;

  // Sonnet-only weekly usage
  const sonnetWeekRecs = weekRecords.filter(r => r.model.includes('sonnet'));
  const sonnetWeekSum = sumRecords(sonnetWeekRecs);
  const sonnetWeek = {
    tokens: sonnetWeekSum.tokens,
    cost: sonnetWeekSum.cost,
    oldestTimestamp: sonnetWeekRecs[0]?.timestamp ?? null,
  };

  return {
    today: sumRecords(todayRecords),
    week:  sumRecords(weekRecords),
    total: sumRecords(allRecords),
    currentSession,
    session5h,
    session5hResetsAt,
    sonnetWeek,
    weekOldestTimestamp: weekRecords[0]?.timestamp ?? null,
    weekResetsAt,
    activeSessions,
    lastSessionAt,
    byProject,
    byModel,
    activityByHour,
    activityByDay,
    dailyValue,
    cacheSavingsTotal,
    lastUpdated: new Date().toISOString(),
  };
}
