export function HourBar({ counts }: { counts: number[] }) {
  const max = Math.max(...counts, 1);
  const LABELS: Record<number, string> = { 0: '12a', 6: '6a', 12: '12p', 18: '6p' };
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 40 }}>
        {counts.map((c, i) => (
          <div
            key={i}
            title={`${i}:00 — ${c}`}
            style={{
              flex: 1,
              height: `${Math.max(3, (c / max) * 38)}px`,
              background: c > 0
                ? `rgba(193,95,60,${0.15 + Math.pow(c / max, 1.8) * 0.85})`
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
