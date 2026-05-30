import { useState } from 'react';
import type { ClaudeStats, UsageLimitsAPI } from '@/lib/types';
import type { ClaudeLimits } from '@/lib/limits';
import { fmtTokens, fmtResetsAt, relTime } from '@/lib/format';

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

export function ConcentricRings({ stats, limits, usageLimits }: {
  stats: ClaudeStats; limits: ClaudeLimits; usageLimits: UsageLimitsAPI | null;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const sessionPct = usageLimits?.fiveHour       ? usageLimits.fiveHour.utilization / 100       : stats.session5h.tokens / limits.session5h;
  const weekPct    = usageLimits?.sevenDay        ? usageLimits.sevenDay.utilization / 100        : stats.week.tokens / limits.weekly;
  const sonnetPct  = usageLimits?.sevenDaySonnet  ? usageLimits.sevenDaySonnet.utilization / 100  : stats.sonnetWeek.tokens / limits.weeklyDonnet;

  const sessionResetsRaw = usageLimits?.fiveHour?.resetsAt ?? stats.session5hResetsAt;
  const weekResetsRaw    = usageLimits?.sevenDay?.resetsAt ?? stats.weekResetsAt;

  const isIdle = stats.session5h.messages === 0;
  const sessionResets = isIdle && stats.lastSessionAt
    ? `idle · last ${relTime(stats.lastSessionAt)}`
    : sessionResetsRaw ? fmtResetsAt(sessionResetsRaw) : 'no recent activity';
  const weekResets   = weekResetsRaw ? fmtResetsAt(weekResetsRaw) : 'resets in …';
  const sonnetResets = usageLimits?.sevenDaySonnet?.resetsAt ? fmtResetsAt(usageLimits.sevenDaySonnet.resetsAt) : weekResets;

  function pctLabel(p: number) { return `${Math.round(p * 100)}%`; }

  const sessionCount = stats.activeSessions.length;
  const sessionLabel = sessionCount > 1 ? `Session (5hr) ×${sessionCount}` : 'Session (5hr)';

  const SESSION_COLOR = '#C15F3C';
  const SONNET_COLOR  = '#D4956A';
  const WEEK_COLOR    = '#B1ADA1';

  // List order: inner → middle → outer
  const rows = [
    { label: sessionLabel,     pct: sessionPct, tokens: stats.session5h.tokens,   sub: sessionResets, color: SESSION_COLOR, centerLabel: isIdle ? 'idle' : 'session' },
    { label: 'Weekly Sonnet',  pct: sonnetPct,  tokens: stats.sonnetWeek.tokens,  sub: sonnetResets,  color: SONNET_COLOR,  centerLabel: 'sonnet'                   },
    { label: 'Weekly (7 day)', pct: weekPct,    tokens: stats.week.tokens,        sub: weekResets,    color: WEEK_COLOR,    centerLabel: '7-day'                    },
  ];

  const active = hovered !== null ? rows[hovered] : rows[0];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg width={180} height={180} style={{ flexShrink: 0 }}>
          <Ring r={72} stroke={10} pct={weekPct}    color={WEEK_COLOR}    />
          <Ring r={54} stroke={10} pct={sonnetPct}  color={SONNET_COLOR}  />
          <Ring r={36} stroke={10} pct={sessionPct} color={SESSION_COLOR} />
          {/* Invisible hit areas for each ring */}
          <circle cx={90} cy={90} r={72} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: 'default' }} onMouseEnter={() => setHovered(2)} onMouseLeave={() => setHovered(null)} />
          <circle cx={90} cy={90} r={54} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: 'default' }} onMouseEnter={() => setHovered(1)} onMouseLeave={() => setHovered(null)} />
          <circle cx={90} cy={90} r={36} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: 'default' }} onMouseEnter={() => setHovered(0)} onMouseLeave={() => setHovered(null)} />
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2, gap: 6 }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
                <span style={{ fontSize: 11, color: row.color, fontFamily: 'monospace', fontWeight: 600, flexShrink: 0 }}>{pctLabel(row.pct)}</span>
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, marginBottom: 3 }}>
                <div style={{ height: '100%', width: `${Math.min(row.pct, 1) * 100}%`, background: row.color, borderRadius: 2, opacity: 0.8 }} />
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>{row.sub}</div>
            </div>
          ))}
        </div>
    </div>
  );
}
