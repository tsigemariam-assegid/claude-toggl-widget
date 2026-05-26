import { useEffect, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProjectStats {
  project: string;
  tokens: number;
  cost: number;
  sessions: number;
  messages: number;
}

interface ClaudeStats {
  today: { tokens: number; cost: number; sessions: number; messages: number };
  week:  { tokens: number; cost: number; sessions: number; messages: number };
  total: { tokens: number; cost: number; sessions: number; messages: number };
  currentSession: { tokens: number; cost: number; startedAt: string };
  session5h: { tokens: number; cost: number; messages: number; windowStart: string };
  sonnetWeek: { tokens: number; cost: number };
  byProject: ProjectStats[];
  byModel: { model: string; tokens: number; cost: number }[];
  activityByHour: number[];
  activityByDay: Record<string, number>;
  lastUpdated: string;
}

interface TogglProjectStats {
  project: string;
  color: string;
  seconds: number;
  entries: number;
}

interface TogglStats {
  today: { seconds: number; entries: number; isTracking: boolean; currentEntry: string | null };
  week:  { seconds: number; entries: number };
  byProject: TogglProjectStats[];
  lastUpdated: string;
}

interface UsageLimitEntry { utilization: number; resetsAt: string }
interface UsageLimitsAPI {
  fiveHour:       UsageLimitEntry | null;
  sevenDay:       UsageLimitEntry | null;
  sevenDaySonnet: UsageLimitEntry | null;
}

declare global {
  interface Window {
    claudeAPI?: {
      getStats:        () => Promise<ClaudeStats>;
      getUsageLimits:  () => Promise<UsageLimitsAPI>;
      getTogglStats:   (token: string) => Promise<TogglStats>;
      onStatsUpdate:   (cb: (s: ClaudeStats) => void) => () => void;
      getTogglToken:   () => Promise<string | null>;
      saveTogglToken:  (token: string) => Promise<void>;
    };
  }
}

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(n: number): string {
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

function fmtSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ── Usage Limits ──────────────────────────────────────────────────────────────

interface ClaudeLimits {
  session5h: number;   // tokens per 5-hour window
  weekly: number;      // tokens per 7 days
  weeklyDonnet: number; // sonnet tokens per 7 days
}

// Defaults tuned for Claude Max 5x plan (~5× Pro baseline)
const DEFAULT_LIMITS: ClaudeLimits = {
  session5h:    2_500_000,
  weekly:      15_000_000,
  weeklyDonnet: 10_000_000,
};

const LIMITS_KEY = 'claude-widget-limits';

function loadLimits(): ClaudeLimits {
  try {
    const raw = localStorage.getItem(LIMITS_KEY);
    if (raw) return { ...DEFAULT_LIMITS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_LIMITS };
}

function saveLimits(l: ClaudeLimits) {
  localStorage.setItem(LIMITS_KEY, JSON.stringify(l));
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9,
      color: 'rgba(255,255,255,0.3)',
      fontFamily: 'monospace',
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#f1f5f9', fontFamily: 'monospace', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function Block({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      borderRadius: 9,
      padding: '9px 11px',
      border: '1px solid rgba(255,255,255,0.06)',
      ...style,
    }}>
      {children}
    </div>
  );
}

function HourBar({ counts }: { counts: number[] }) {
  const max = Math.max(...counts, 1);
  const LABELS: Record<number, string> = { 0: '12a', 6: '6a', 12: '12p', 18: '6p' };
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 28 }}>
        {counts.map((c, i) => (
          <div
            key={i}
            title={`${i}:00 — ${c}`}
            style={{
              flex: 1,
              height: `${Math.max(2, (c / max) * 26)}px`,
              background: c > 0
                ? `rgba(96,165,250,${0.25 + (c / max) * 0.75})`
                : 'rgba(255,255,255,0.06)',
              borderRadius: 2,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 1.5, marginTop: 3 }}>
        {counts.map((_, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 7, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>
            {LABELS[i] ?? ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function TogglTokenInput({ onSave }: { onSave: (t: string) => void }) {
  const [val, setVal] = useState('');
  return (
    <div style={{ padding: '12px 0' }}>
      <SectionLabel>Toggl API Token</SectionLabel>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, lineHeight: 1.5 }}>
        Get it at toggl.com/profile → scroll to "API Token"
      </p>
      <input
        type="password"
        placeholder="paste token here"
        value={val}
        onChange={e => setVal(e.target.value)}
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 7,
          padding: '6px 10px',
          color: '#f1f5f9',
          fontSize: 12,
          fontFamily: 'monospace',
          outline: 'none',
          marginBottom: 8,
        }}
      />
      <button
        onClick={() => val.trim() && onSave(val.trim())}
        style={{
          width: '100%',
          padding: '6px 0',
          background: 'rgba(96,165,250,0.2)',
          border: '1px solid rgba(96,165,250,0.3)',
          borderRadius: 7,
          color: '#93c5fd',
          fontSize: 11,
          fontFamily: 'monospace',
          cursor: 'pointer',
        }}
      >
        Save token
      </button>
    </div>
  );
}

// ── Concentric Rings ───────────────────────────────────────────────────────────

function Ring({ r, stroke, pct, color }: { r: number; stroke: number; pct: number; color: string }) {
  const circumference = 2 * Math.PI * r;
  const arc = Math.min(pct, 1) * circumference;
  return (
    <g>
      <circle cx={90} cy={90} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle
        cx={90} cy={90} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${arc} ${circumference}`}
        strokeLinecap="round"
        transform="rotate(-90 90 90)"
      />
    </g>
  );
}

function fmtResetsAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs <= 0) return 'resetting…';
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffM = Math.floor((diffMs % 3_600_000) / 60_000);
  const diffD = Math.floor(diffMs / 86_400_000);
  if (diffD >= 2) return `resets in ${diffD}d`;
  if (diffH >= 1) return `resets in ${diffH}h ${diffM}m`;
  return `resets in ${diffM}m`;
}

function ConcentricRings({ stats, limits, usageLimits, onEditLimits }: {
  stats: ClaudeStats; limits: ClaudeLimits; usageLimits: UsageLimitsAPI | null; onEditLimits: () => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const sessionPct = usageLimits?.fiveHour       ? usageLimits.fiveHour.utilization / 100       : stats.session5h.tokens / limits.session5h;
  const weekPct    = usageLimits?.sevenDay        ? usageLimits.sevenDay.utilization / 100        : stats.week.tokens / limits.weekly;
  const sonnetPct  = usageLimits?.sevenDaySonnet  ? usageLimits.sevenDaySonnet.utilization / 100  : stats.sonnetWeek.tokens / limits.weeklyDonnet;

  const sessionResets = usageLimits?.fiveHour?.resetsAt ? fmtResetsAt(usageLimits.fiveHour.resetsAt) : 'resets in …';
  const weekResets    = usageLimits?.sevenDay?.resetsAt ? fmtResetsAt(usageLimits.sevenDay.resetsAt) : 'resets in …';
  const sonnetResets  = usageLimits?.sevenDaySonnet?.resetsAt ? fmtResetsAt(usageLimits.sevenDaySonnet.resetsAt) : weekResets;

  function pctLabel(p: number) { return `${Math.round(p * 100)}%`; }

  const rows = [
    { label: 'Session (5hr)',  pct: sessionPct, tokens: stats.session5h.tokens,  sub: sessionResets, color: '#a78bfa', centerLabel: 'session' },
    { label: 'Weekly (7 day)', pct: weekPct,    tokens: stats.week.tokens,        sub: weekResets,    color: '#60a5fa', centerLabel: '7-day'   },
    { label: 'Weekly Sonnet',  pct: sonnetPct,  tokens: stats.sonnetWeek.tokens,  sub: sonnetResets,  color: '#34d399', centerLabel: 'sonnet'  },
  ];

  const active = hovered !== null ? rows[hovered] : rows[0];

  return (
    <Block>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <svg width={180} height={180} style={{ flexShrink: 0 }}>
          <Ring r={72} stroke={10} pct={weekPct}    color="#60a5fa" />
          <Ring r={54} stroke={10} pct={sessionPct} color="#a78bfa" />
          <Ring r={36} stroke={10} pct={sonnetPct}  color="#34d399" />
          {/* Invisible hit areas for each ring */}
          <circle cx={90} cy={90} r={72} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: 'default' }} onMouseEnter={() => setHovered(1)} onMouseLeave={() => setHovered(null)} />
          <circle cx={90} cy={90} r={54} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: 'default' }} onMouseEnter={() => setHovered(0)} onMouseLeave={() => setHovered(null)} />
          <circle cx={90} cy={90} r={36} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: 'default' }} onMouseEnter={() => setHovered(2)} onMouseLeave={() => setHovered(null)} />
          <text x={90} y={84} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={9} fontFamily="monospace">{active.centerLabel}</text>
          <text x={90} y={99} textAnchor="middle" fill={active.color} fontSize={13} fontFamily="monospace" fontWeight="600">
            {fmtTokens(active.tokens)}
          </text>
          <text x={90} y={111} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize={8} fontFamily="monospace">{pctLabel(active.pct)}</text>
        </svg>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((row, i) => (
            <div key={row.label} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
              style={{ opacity: hovered === null || hovered === i ? 1 : 0.45, transition: 'opacity 0.15s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>{row.label}</span>
                <span style={{ fontSize: 11, color: row.color, fontFamily: 'monospace', fontWeight: 600 }}>{pctLabel(row.pct)}</span>
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, marginBottom: 3 }}>
                <div style={{ height: '100%', width: `${Math.min(row.pct, 1) * 100}%`, background: row.color, borderRadius: 2, opacity: 0.8 }} />
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>{row.sub}</div>
            </div>
          ))}
          <button
            onClick={onEditLimits}
            style={{
              marginTop: 2, padding: '3px 8px', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 5, background: 'transparent', color: 'rgba(255,255,255,0.3)',
              fontSize: 9, fontFamily: 'monospace', cursor: 'pointer', textAlign: 'left',
            }}
          >
            set limits…
          </button>
        </div>
      </div>
    </Block>
  );
}

// ── Limits Editor ─────────────────────────────────────────────────────────────

function LimitsEditor({ limits, onSave, onCancel }: { limits: ClaudeLimits; onSave: (l: ClaudeLimits) => void; onCancel: () => void }) {
  const [vals, setVals] = useState({ ...limits });

  function field(key: keyof ClaudeLimits, label: string) {
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', marginBottom: 3 }}>{label}</div>
        <input
          type="number"
          value={vals[key]}
          onChange={e => setVals(v => ({ ...v, [key]: Number(e.target.value) }))}
          style={{
            width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6, padding: '4px 8px', color: '#f1f5f9', fontSize: 11, fontFamily: 'monospace', outline: 'none',
          }}
        />
      </div>
    );
  }

  return (
    <Block>
      <SectionLabel>quota limits (tokens)</SectionLabel>
      {field('session5h', 'Session (5hr limit)')}
      {field('weekly', 'Weekly limit')}
      {field('weeklyDonnet', 'Weekly Sonnet limit')}
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button
          onClick={() => onSave(vals)}
          style={{
            flex: 1, padding: '5px 0', background: 'rgba(96,165,250,0.2)', border: '1px solid rgba(96,165,250,0.3)',
            borderRadius: 6, color: '#93c5fd', fontSize: 10, fontFamily: 'monospace', cursor: 'pointer',
          }}
        >save</button>
        <button
          onClick={onCancel}
          style={{
            flex: 1, padding: '5px 0', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'monospace', cursor: 'pointer',
          }}
        >cancel</button>
      </div>
    </Block>
  );
}

// ── Activity Heatmap ───────────────────────────────────────────────────────────

function StreakCard({ activityByDay }: { activityByDay: Record<string, number> }) {
  const today = new Date();

  // Calculate current streak (consecutive days with activity ending today)
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    if ((activityByDay[iso] ?? 0) > 0) streak++;
    else break;
  }

  return (
    <Block>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', height: '100%' }}>
        <div style={{ fontSize: 24 }}>🔥</div>
        <div style={{ fontSize: 28, fontWeight: 'bold', color: '#f59e0b' }}>{streak}</div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', textAlign: 'center' }}>days<br />streak</div>
      </div>
    </Block>
  );
}

function ActivityHeatmap({ activityByDay }: { activityByDay: Record<string, number> }) {
  const WEEKS = 12;
  const today = new Date();
  const dayOfWeek = (today.getDay() + 6) % 7; // 0=Mon … 6=Sun
  const start = new Date(today);
  start.setDate(today.getDate() - dayOfWeek - (WEEKS - 1) * 7);
  start.setHours(0, 0, 0, 0);

  // Build a flat array of WEEKS*7 dates
  const days: { date: string; count: number; isToday: boolean }[] = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    days.push({ date: iso, count: activityByDay[iso] ?? 0, isToday: iso === today.toISOString().slice(0, 10) });
  }

  const maxCount = Math.max(...days.map(d => d.count), 1);

  // Group into columns (weeks)
  const weeks: typeof days[] = [];
  for (let w = 0; w < WEEKS; w++) {
    weeks.push(days.slice(w * 7, w * 7 + 7));
  }

  const CELL = 11;
  const GAP = 2;
  const LABEL_W = 14;

  // Month labels: show month name at the first column of a new month
  const monthLabels: { col: number; label: string }[] = [];
  for (let w = 0; w < WEEKS; w++) {
    const firstDay = new Date(start);
    firstDay.setDate(start.getDate() + w * 7);
    if (w === 0 || firstDay.getDate() <= 7) {
      monthLabels.push({ col: w, label: firstDay.toLocaleDateString('en', { month: 'short' }) });
    }
  }

  return (
    <Block>
      <SectionLabel>activity</SectionLabel>
      <div>
        {/* Month labels */}
        <div style={{ display: 'flex', marginLeft: LABEL_W, marginBottom: 3 }}>
          {weeks.map((_, w) => {
            const ml = monthLabels.find(m => m.col === w);
            return (
              <div key={w} style={{ width: CELL + GAP, flexShrink: 0, fontSize: 7, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                {ml ? ml.label : ''}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          {/* Day labels */}
          <div style={{ width: LABEL_W, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: GAP }}>
            {['M', '', 'W', '', 'F', '', ''].map((d, i) => (
              <div key={i} style={{ height: CELL, fontSize: 7, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', lineHeight: `${CELL}px` }}>{d}</div>
            ))}
          </div>
          {/* Grid */}
          <div style={{ display: 'flex', gap: GAP }}>
            {weeks.map((week, w) => (
              <div key={w} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
                {week.map((day, d) => {
                  const opacity = day.count === 0 ? 0 : 0.15 + (day.count / maxCount) * 0.85;
                  return (
                    <div
                      key={d}
                      title={`${day.date}: ${day.count} message${day.count !== 1 ? 's' : ''}`}
                      style={{
                        width: CELL,
                        height: CELL,
                        borderRadius: 2,
                        background: day.count === 0
                          ? 'rgba(255,255,255,0.06)'
                          : `rgba(96,165,250,${opacity})`,
                        outline: day.isToday ? '1px solid rgba(96,165,250,0.6)' : 'none',
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Block>
  );
}

// ── Claude Panel ───────────────────────────────────────────────────────────────

function ClaudePanel({ stats }: { stats: ClaudeStats | null }) {
  const [limits, setLimits] = useState<ClaudeLimits>(loadLimits);
  const [editingLimits, setEditingLimits] = useState(false);
  const [usageLimits, setUsageLimits] = useState<UsageLimitsAPI | null>(null);

  useEffect(() => {
    window.claudeAPI?.getUsageLimits().then(setUsageLimits).catch(() => {});
    const id = setInterval(() => {
      window.claudeAPI?.getUsageLimits().then(setUsageLimits).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (!stats) return (
    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace' }}>loading…</div>
  );

  function handleSaveLimits(l: ClaudeLimits) {
    saveLimits(l);
    setLimits(l);
    setEditingLimits(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ActivityHeatmap activityByDay={stats.activityByDay} />
        </div>
        <div style={{ width: 110, flexShrink: 0 }}>
          <StreakCard activityByDay={stats.activityByDay} />
        </div>
      </div>

      {editingLimits
        ? <LimitsEditor limits={limits} onSave={handleSaveLimits} onCancel={() => setEditingLimits(false)} />
        : <ConcentricRings stats={stats} limits={limits} usageLimits={usageLimits} onEditLimits={() => setEditingLimits(true)} />
      }

      <Block>
        <SectionLabel>activity by hour</SectionLabel>
        <HourBar counts={stats.activityByHour} />
      </Block>

      {stats.byProject.length > 0 && (
        <Block>
          <SectionLabel>by project</SectionLabel>
          {stats.byProject.slice(0, 4).map(p => {
            const pct = stats.total.tokens > 0 ? p.tokens / stats.total.tokens : 0;
            return (
              <div key={p.project} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                    {p.project}
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
                    {fmtTokens(p.tokens)}
                  </span>
                </div>
                <div style={{ height: 2, background: 'rgba(255,255,255,0.07)', borderRadius: 1 }}>
                  <div style={{ height: '100%', width: `${pct * 100}%`, background: '#60a5fa', borderRadius: 1, opacity: 0.65 }} />
                </div>
              </div>
            );
          })}
        </Block>
      )}
    </div>
  );
}

// ── Toggl Panel ────────────────────────────────────────────────────────────────

function TogglPanel({
  stats, hasToken, onSetToken,
}: {
  stats: TogglStats | null;
  hasToken: boolean;
  onSetToken: (t: string) => void;
}) {
  if (!hasToken) return <TogglTokenInput onSave={onSetToken} />;

  if (!stats) return (
    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace' }}>loading…</div>
  );

  const maxSec = Math.max(...stats.byProject.map(p => p.seconds), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {stats.today.isTracking && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(52,211,153,0.1)',
          border: '1px solid rgba(52,211,153,0.2)',
          borderRadius: 8, padding: '6px 10px',
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#34d399', flexShrink: 0,
            boxShadow: '0 0 6px #34d399',
            animation: 'pulse 1.5s infinite',
          }} />
          <span style={{ fontSize: 10, color: '#6ee7b7', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stats.today.currentEntry || 'tracking…'}
          </span>
        </div>
      )}

      <Block>
        <StatRow label="today"         value={fmtSeconds(stats.today.seconds)} />
        <StatRow label="today entries" value={String(stats.today.entries)} />
        <StatRow label="this week"     value={fmtSeconds(stats.week.seconds)} />
        <StatRow label="week entries"  value={String(stats.week.entries)} />
      </Block>

      {stats.byProject.length > 0 && (
        <Block>
          <SectionLabel>by project (week)</SectionLabel>
          {stats.byProject.slice(0, 5).map(p => {
            const pct = p.seconds / maxSec;
            return (
              <div key={p.project} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                    {p.project}
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
                    {fmtSeconds(p.seconds)}
                  </span>
                </div>
                <div style={{ height: 2, background: 'rgba(255,255,255,0.07)', borderRadius: 1 }}>
                  <div style={{ height: '100%', width: `${pct * 100}%`, background: p.color, borderRadius: 1, opacity: 0.7 }} />
                </div>
              </div>
            );
          })}
        </Block>
      )}
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────

type Tab = 'claude' | 'toggl';

export default function App() {
  const [tab, setTab]                 = useState<Tab>('claude');
  const [claudeStats, setClaudeStats] = useState<ClaudeStats | null>(null);
  const [togglStats, setTogglStats]   = useState<TogglStats | null>(null);
  const [togglToken, setTogglToken]   = useState<string | null>(null);
  const [tokenLoaded, setTokenLoaded] = useState(false);

  useEffect(() => {
    if (!window.claudeAPI) return;
    window.claudeAPI.getStats().then(setClaudeStats);
    const unsub = window.claudeAPI.onStatsUpdate(setClaudeStats);
    return unsub;
  }, []);

  useEffect(() => {
    if (!window.claudeAPI) { setTokenLoaded(true); return; }
    window.claudeAPI.getTogglToken().then(t => {
      setTogglToken(t);
      setTokenLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!togglToken || !window.claudeAPI) return;
    window.claudeAPI.getTogglStats(togglToken).then(setTogglStats);
    const id = setInterval(() => {
      window.claudeAPI!.getTogglStats(togglToken).then(setTogglStats);
    }, 60_000);
    return () => clearInterval(id);
  }, [togglToken]);

  async function handleSetToken(token: string) {
    await window.claudeAPI.saveTogglToken(token);
    setTogglToken(token);
  }

  if (!window.claudeAPI) return (
    <div style={{
      width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0c10', color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace',
    }}>
      run inside Electron — use npm run dev
    </div>
  );

  return (
    <div style={{
      width: '100%', height: '100vh',
      background: 'rgba(10,12,16,0.90)',
      backdropFilter: 'blur(28px) saturate(180%)',
      WebkitBackdropFilter: 'blur(28px) saturate(180%)',
      borderRadius: 14,
      border: '1px solid rgba(255,255,255,0.09)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
      color: '#f1f5f9',
      userSelect: 'none',
      ...({ WebkitAppRegion: 'drag' } as any),
    }}>

      {/* Header */}
      <div style={{
        padding: '12px 14px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 2, WebkitAppRegion: 'no-drag' as any }}>
          {([
            { id: 'claude', label: '⚡ Claude' },
            { id: 'toggl',  label: '⏱ Toggl' },
          ] as { id: Tab; label: string }[]).map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id as Tab)} style={{
              padding: '4px 12px',
              border: 'none', borderRadius: 7, cursor: 'pointer',
              background: tab === id ? 'rgba(96,165,250,0.18)' : 'transparent',
              color: tab === id ? '#93c5fd' : 'rgba(255,255,255,0.35)',
              fontSize: 11, fontWeight: tab === id ? 600 : 400,
            }}>
              {label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>
          {tab === 'claude' && claudeStats ? relTime(claudeStats.lastUpdated) : ''}
          {tab === 'toggl'  && togglStats  ? relTime(togglStats.lastUpdated)  : ''}
        </span>
      </div>

      {/* Body */}
      <div style={{
        flex: 1, overflow: 'auto',
        padding: '12px 14px 16px',
        ...({ WebkitAppRegion: 'no-drag' } as any),
      }}>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>

        {tab === 'claude' && <ClaudePanel stats={claudeStats} />}
        {tab === 'toggl' && tokenLoaded && (
          <TogglPanel
            stats={togglStats}
            hasToken={!!togglToken}
            onSetToken={handleSetToken}
          />
        )}
      </div>
    </div>
  );
}
