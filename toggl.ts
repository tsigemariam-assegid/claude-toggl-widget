// Toggl Track API v9
// Docs: https://developers.track.toggl.com/docs/api/time_entries

const BASE_URL = 'https://api.track.toggl.com/api/v9';

export interface TogglEntry {
  id: number;
  description: string;
  start: string;         // ISO
  stop: string | null;   // null if currently running
  duration: number;      // seconds; negative if running
  project_id: number | null;
  workspace_id: number;
  tags: string[];
  billable: boolean;
}

export interface TogglProject {
  id: number;
  name: string;
  color: string;
}

export interface TogglProjectStats {
  project: string;
  color: string;
  seconds: number;
  entries: number;
}

export interface TogglStats {
  today: {
    seconds: number;
    entries: number;
    isTracking: boolean;       // a timer is running right now
    currentEntry: string | null; // description of running entry
  };
  week: {
    seconds: number;
    entries: number;
  };
  byProject: TogglProjectStats[];
  lastUpdated: string;
}

function authHeader(apiToken: string): string {
  return 'Basic ' + btoa(`${apiToken}:api_token`);
}

function startOfDay(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

async function fetchToggl<T>(apiToken: string, path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: authHeader(apiToken),
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 403) throw new Error('Invalid Toggl API token');
    throw new Error(`Toggl API error: ${res.status}${await errBody(res)}`);
  }

  return res.json() as Promise<T>;
}

// Toggl returns a plain-text or JSON reason in the body on 4xx; surface it so
// failures are diagnosable instead of an opaque status code.
async function errBody(res: Response): Promise<string> {
  try {
    const text = (await res.text()).trim();
    return text ? ` — ${text.slice(0, 300)}` : '';
  } catch { return ''; }
}

// Project metadata (id → name/color). Fetched separately and cached by the
// caller, because it rarely changes and counts against Toggl's hourly rate cap.
export async function fetchTogglProjects(apiToken: string): Promise<TogglProject[]> {
  return (await fetchToggl<TogglProject[] | null>(apiToken, '/me/projects')) ?? [];
}

// `projects` is supplied by the caller (from its persistent cache) so name
// resolution survives a rate-limited /me/projects fetch.
export async function getTogglStats(apiToken: string, projects: TogglProject[] = []): Promise<TogglStats> {
  const todayStart = startOfDay(new Date());
  const weekStart  = daysAgo(7);

  // Fetch time entries for the last 7 days
  const entries = await fetchToggl<TogglEntry[]>(
    apiToken,
    `/me/time_entries?start_date=${encodeURIComponent(weekStart)}&end_date=${encodeURIComponent(new Date().toISOString())}`
  );

  const projectMap = new Map(projects.map(p => [p.id, p]));

  // Separate today vs week
  const todayEntries = entries.filter(e => e.start >= todayStart);
  const weekEntries  = entries; // already filtered to last 7 days

  // Running entry
  const running = entries.find(e => e.duration < 0);
  const isTracking = !!running;
  const currentEntry = running?.description ?? null;

  // Duration of an entry — if running, use elapsed since start
  function entrySeconds(e: TogglEntry): number {
    if (e.duration >= 0) return e.duration;
    return Math.floor((Date.now() - new Date(e.start).getTime()) / 1000);
  }

  const todaySeconds = todayEntries.reduce((s, e) => s + entrySeconds(e), 0);
  const weekSeconds  = weekEntries.reduce((s, e) => s + entrySeconds(e), 0);

  // By project (using all week entries)
  const projectGroups = new Map<number | null, TogglEntry[]>();
  for (const e of weekEntries) {
    const key = e.project_id;
    const group = projectGroups.get(key) ?? [];
    group.push(e);
    projectGroups.set(key, group);
  }

  const byProject: TogglProjectStats[] = Array.from(projectGroups.entries())
    .map(([projectId, group]) => {
      const proj = projectId ? projectMap.get(projectId) : null;
      return {
        project: proj?.name ?? (projectId ? `Project ${projectId}` : 'No project'),
        color: proj?.color ?? '#6b7280',
        seconds: group.reduce((s, e) => s + entrySeconds(e), 0),
        entries: group.length,
      };
    })
    .sort((a, b) => b.seconds - a.seconds);

  return {
    today: {
      seconds: todaySeconds,
      entries: todayEntries.length,
      isTracking,
      currentEntry,
    },
    week: {
      seconds: weekSeconds,
      entries: weekEntries.length,
    },
    byProject,
    lastUpdated: new Date().toISOString(),
  };
}

interface TogglTag {
  id: number;
  name: string;
  workspace_id: number;
}

async function fetchTogglPost<T>(apiToken: string, urlPath: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(apiToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 403) throw new Error('Invalid Toggl API token');
    throw new Error(`Toggl API error: ${res.status}${await errBody(res)}`);
  }
  return res.json() as Promise<T>;
}

export async function getWorkspaceId(apiToken: string): Promise<number> {
  const me = await fetchToggl<{ default_workspace_id: number }>(apiToken, '/me');
  return me.default_workspace_id;
}

export async function getOrCreateProject(apiToken: string, workspaceId: number, name: string): Promise<number> {
  const projects = (await fetchToggl<TogglProject[] | null>(apiToken, `/workspaces/${workspaceId}/projects`)) ?? [];
  const existing = projects.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const created = await fetchTogglPost<TogglProject>(apiToken, `/workspaces/${workspaceId}/projects`, {
    name,
    active: true,
    is_private: true,
  });
  return created.id;
}

export async function getOrCreateTag(apiToken: string, workspaceId: number, name: string): Promise<number> {
  const tags = (await fetchToggl<TogglTag[] | null>(apiToken, `/workspaces/${workspaceId}/tags`)) ?? [];
  const existing = tags.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const created = await fetchTogglPost<TogglTag>(apiToken, `/workspaces/${workspaceId}/tags`, { name });
  return created.id;
}

export async function createTimeEntry(
  apiToken: string,
  workspaceId: number,
  projectId: number,
  tagId: number,
  description: string,
  start: string,
  stop: string,
): Promise<number> {
  // Send start + a positive duration and let Toggl derive stop. Sending all
  // three (start, stop, duration) triggers Toggl's "Stop and duration mismatch"
  // 400, because Toggl truncates the timestamps to whole seconds and recomputes
  // the duration, which can differ from ours by ±1s of millisecond rounding.
  const duration = Math.max(1, Math.round((new Date(stop).getTime() - new Date(start).getTime()) / 1000));
  const entry = await fetchTogglPost<TogglEntry>(apiToken, `/workspaces/${workspaceId}/time_entries`, {
    created_with: 'claude-widget',
    description,
    duration,
    project_id: projectId,
    start,
    tag_ids: [tagId],
    workspace_id: workspaceId,
  });
  return entry.id;
}

export { formatSeconds };
