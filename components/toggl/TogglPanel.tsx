import type { TogglStats } from '@/lib/types';
import { fmtSeconds } from '@/lib/format';
import { Block, SectionLabel, StatRow } from '@/components/primitives';
import { TogglTokenInput } from './TogglTokenInput';
import { SyncReview } from './SyncReview';

export function TogglPanel({
  stats, token, onSetToken, fetchError,
}: {
  stats: TogglStats | null;
  token: string | null;
  onSetToken: (t: string) => void;
  fetchError: string | null;
}) {
  if (!token) return <TogglTokenInput onSave={onSetToken} />;

  if (!stats) return (
    <div style={{ color: fetchError ? '#f87171' : 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace' }}>
      {fetchError ?? 'loading…'}
    </div>
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

      <SyncReview token={token} />
    </div>
  );
}
