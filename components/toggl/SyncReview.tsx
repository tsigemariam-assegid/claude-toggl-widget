import { useState } from 'react';
import { SectionLabel } from '@/components/primitives';
import { Button } from '@/components/ui/button';
import { isoToLocalInput, errMsg } from '@/lib/format';

type ReviewPhase = 'idle' | 'loading' | 'review' | 'pushing' | 'done' | 'error';

interface ReviewRow {
  blockKey: string;
  description: string;   // editable title
  startLocal: string;    // 'YYYY-MM-DDTHH:mm' (local) for datetime-local input
  durationMin: number;   // editable, minutes
  include: boolean;
}

export function SyncReview({ token }: { token: string }) {
  const [phase, setPhase]   = useState<ReviewPhase>('idle');
  const [rows, setRows]     = useState<ReviewRow[]>([]);
  const [result, setResult] = useState<{ synced: number; failed: number; firstError: string | null } | null>(null);
  const [error, setError]   = useState<string | null>(null);

  async function loadPreview() {
    setPhase('loading'); setError(null);
    try {
      const blocks = await window.claudeAPI!.getTogglSyncPreview();
      blocks.sort((a, b) => a.start.localeCompare(b.start));
      setRows(blocks.map(b => ({
        blockKey: b.blockKey,
        description: b.project,
        startLocal: isoToLocalInput(b.start),
        durationMin: Math.max(1, Math.round(b.durationSeconds / 60)),
        include: true,
      })));
      setPhase('review');
    } catch (e) { setError(errMsg(e)); setPhase('error'); }
  }

  function update(i: number, patch: Partial<ReviewRow>) {
    setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));
  }

  async function push() {
    const entries = rows.filter(r => r.include).map(r => {
      const start = new Date(r.startLocal);                    // parsed as local time
      const stop  = new Date(start.getTime() + Math.max(1, r.durationMin) * 60_000);
      return { blockKey: r.blockKey, description: r.description.trim() || 'Claude', start: start.toISOString(), stop: stop.toISOString() };
    });
    if (entries.length === 0) return;
    setPhase('pushing'); setError(null);
    try {
      const res = await window.claudeAPI!.syncClaudeToToggl(token, entries);
      setResult({ synced: res.synced, failed: res.failed, firstError: res.firstError });
      if (res.synced === 0 && res.failed > 0 && res.firstError) { setError(res.firstError); setPhase('error'); }
      else setPhase('done');
    } catch (e) { setError(errMsg(e)); setPhase('error'); }
  }

  const btn = (label: string, onClick: () => void, primary = false) => (
    <Button
      onClick={onClick}
      size="xs"
      className={primary
        ? 'rounded-md border-0 bg-[rgba(193,95,60,0.18)] px-3 font-mono text-[10px] text-[#C15F3C] shadow-none hover:bg-[rgba(193,95,60,0.28)]'
        : 'rounded-md border-0 bg-white/[0.07] px-3 font-mono text-[10px] text-white/55 shadow-none hover:bg-white/[0.12]'
      }
    >{label}</Button>
  );

  if (phase === 'idle')    return <div style={{ marginTop: 4 }}>{btn('review claude sessions →', loadPreview, true)}</div>;
  if (phase === 'loading') return <div style={{ marginTop: 4, fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>scanning sessions…</div>;
  if (phase === 'pushing') return <div style={{ marginTop: 4, fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>pushing to toggl…</div>;

  if (phase === 'done' && result) return (
    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: result.failed > 0 ? '#fbbf24' : '#6ee7b7', fontFamily: 'monospace' }}>
          ✓ pushed {result.synced}{result.failed > 0 ? ` · ${result.failed} failed (retry later)` : ''}
        </span>
        {btn('review more', () => { setResult(null); loadPreview(); })}
      </div>
      {result.failed > 0 && result.firstError && (
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', wordBreak: 'break-word' }}>
          {result.firstError}
        </span>
      )}
    </div>
  );

  if (phase === 'error') return (
    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 10, color: '#f87171', fontFamily: 'monospace', wordBreak: 'break-word' }}>{error}</span>
      <div style={{ display: 'flex', gap: 6 }}>{btn('back', () => setPhase(rows.length ? 'review' : 'idle'))}</div>
    </div>
  );

  // phase === 'review'
  const selected = rows.filter(r => r.include);
  const totalMin = selected.reduce((s, r) => s + Math.max(1, r.durationMin), 0);

  return (
    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionLabel>review · approve to push</SectionLabel>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
          {selected.length}/{rows.length} · {Math.floor(totalMin / 60)}h {totalMin % 60}m
        </span>
      </div>

      {rows.length === 0 && (
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>nothing new to sync</span>
      )}

      {rows.map((r, i) => (
        <div key={r.blockKey} style={{
          background: 'rgba(255,255,255,0.04)', borderRadius: 7, padding: '6px 8px',
          opacity: r.include ? 1 : 0.45, display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={r.include} onChange={e => update(i, { include: e.target.checked })}
                   style={{ accentColor: '#C15F3C', cursor: 'pointer', flexShrink: 0 }} />
            <input value={r.description} onChange={e => update(i, { description: e.target.value })}
                   style={{
                     flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                     borderRadius: 5, padding: '3px 6px', color: '#f1f5f9', fontSize: 11, fontFamily: 'monospace', outline: 'none',
                   }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 22 }}>
            <input type="datetime-local" value={r.startLocal} onChange={e => update(i, { startLocal: e.target.value })}
                   style={{
                     background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5,
                     padding: '2px 5px', color: 'rgba(255,255,255,0.75)', fontSize: 10, fontFamily: 'monospace',
                     outline: 'none', colorScheme: 'dark',
                   }} />
            <input type="number" min={1} value={r.durationMin}
                   onChange={e => update(i, { durationMin: Math.max(1, parseInt(e.target.value) || 1) })}
                   style={{
                     width: 46, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5,
                     padding: '2px 5px', color: 'rgba(255,255,255,0.75)', fontSize: 10, fontFamily: 'monospace', outline: 'none',
                   }} />
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>min</span>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        {btn(`approve & push (${selected.length})`, push, true)}
        {btn('cancel', () => setPhase('idle'))}
      </div>
    </div>
  );
}
