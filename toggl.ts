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
    throw new Error(`Toggl API error: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function getTogglStats(apiToken: string): Promise<TogglStats> {
  const todayStart = startOfDay(new Date());
  const weekStart  = daysAgo(7);

  // Fetch time entries for the last 7 days
  const entries = await fetchToggl<TogglEntry[]>(
    apiToken,
    `/me/time_entries?start_date=${encodeURIComponent(weekStart)}&end_date=${encodeURIComponent(new Date().toISOString())}`
  );

  // Fetch projects for name lookup
  let projects: TogglProject[] = [];
  try {
    projects = await fetchToggl<TogglProject[]>(apiToken, '/me/projects');
  } catch {
    // non-fatal — show project IDs as fallback
  }

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

export { formatSeconds };
