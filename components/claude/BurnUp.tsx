import { Block, SectionLabel } from '@/components/primitives';
import { ACCENT } from '@/lib/constants';

export function BurnUp({ points, price }: { points: { date: string; cum: number }[]; price: number }) {
  if (points.length === 0) {
    return (
      <Block>
        <SectionLabel>value burn-up · this cycle</SectionLabel>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', padding: '6px 0' }}>no usage this cycle yet</div>
      </Block>
    );
  }
  const W = 320, H = 64, PAD = 5;
  const maxCum = Math.max(points[points.length - 1].cum, price, 1);
  const n = points.length;
  const x = (i: number) => n === 1 ? W / 2 : PAD + (i / (n - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - (v / maxCum) * (H - 2 * PAD);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.cum).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(n - 1).toFixed(1)} ${(H - PAD).toFixed(1)} L ${x(0).toFixed(1)} ${(H - PAD).toFixed(1)} Z`;
  const breakY = y(price);
  const showBreak = price <= maxCum;

  return (
    <Block>
      <SectionLabel>value burn-up · this cycle</SectionLabel>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        {showBreak && (
          <>
            <line x1={0} y1={breakY} x2={W} y2={breakY} stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="3 3" />
            <text x={2} y={breakY - 3} fill="rgba(255,255,255,0.35)" fontSize={8} fontFamily="monospace">break-even</text>
          </>
        )}
        <path d={area} fill={ACCENT} fillOpacity={0.15} />
        <path d={line} fill="none" stroke={ACCENT} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(n - 1)} cy={y(points[n - 1].cum)} r={2.5} fill={ACCENT} />
      </svg>
    </Block>
  );
}
