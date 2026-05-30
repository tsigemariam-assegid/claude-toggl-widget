import { useState } from 'react';
import { SectionLabel } from '@/components/primitives';
import { Separator } from '@/components/ui/separator';
import type { ClaudeLimits } from '@/lib/limits';

export function LimitsEditor({ limits, onSave, onCancel }: { limits: ClaudeLimits; onSave: (l: ClaudeLimits) => void; onCancel: () => void }) {
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
    <>
      <SectionLabel>quota limits (tokens)</SectionLabel>
      {field('session5h', 'Session (5hr limit)')}
      {field('weekly', 'Weekly limit')}
      {field('weeklyDonnet', 'Weekly Sonnet limit')}
      <Separator className="my-2" />
      <SectionLabel>billing cycle</SectionLabel>
      {field('planPrice', 'Plan price ($/mo)')}
      {field('cycleStartDay', 'Cycle start day (1–28)')}
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button
          onClick={() => onSave(vals)}
          style={{
            flex: 1, padding: '5px 0', background: 'rgba(193,95,60,0.2)', border: '1px solid rgba(193,95,60,0.3)',
            borderRadius: 6, color: '#C15F3C', fontSize: 10, fontFamily: 'monospace', cursor: 'pointer',
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
    </>
  );
}
