import { Block, SectionLabel } from '@/components/primitives';
import { Separator } from '@/components/ui/separator';
import { fmtUSD, fmtCycleReset } from '@/lib/format';
import { ACCENT, PRO_PRICE } from '@/lib/constants';

export function ValueCard({ cycleValue, allTimeValue, price, cycleStartDay }: {
  cycleValue: number; allTimeValue: number; price: number; cycleStartDay: number;
}) {
  const mult = price > 0 ? cycleValue / price : 0;
  // Auto-scale the gauge with headroom so a healthy multiplier visibly overshoots
  // the 1× break-even tick (a fixed 0–10× scale would make a real ~1.6× look empty).
  const BAR_MAX = Math.max(2, Math.ceil(mult * 1.2));
  const fillPct = Math.min(mult / BAR_MAX, 1) * 100;
  const tickPct = (1 / BAR_MAX) * 100;      // break-even (1×) marker
  const over = mult >= 1;

  return (
    <Block>
      <SectionLabel>value extracted · this cycle</SectionLabel>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 700, color: ACCENT, fontFamily: 'monospace', lineHeight: 1 }}>
          {mult >= 100 ? Math.round(mult) : mult.toFixed(1)}×
        </span>
        <span style={{ fontSize: 13, color: '#f1f5f9', fontFamily: 'monospace', fontWeight: 600 }}>
          {fmtUSD(cycleValue)}
        </span>
      </div>
      {/* Unbounded gauge: fill overshoots the 1× break-even tick — higher is better */}
      <div style={{ position: 'relative', height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, marginTop: 8, marginBottom: 6, overflow: 'visible' }}>
        <div style={{ height: '100%', width: `${fillPct}%`, background: ACCENT, borderRadius: 3, opacity: over ? 0.9 : 0.55 }} />
        <div title="break-even (1×)" style={{ position: 'absolute', top: -2, bottom: -2, left: `${tickPct}%`, width: 1, background: 'rgba(255,255,255,0.5)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
        <span>{fmtUSD(price)} plan · resets {fmtCycleReset(cycleStartDay)}</span>
        <span>{fmtUSD(allTimeValue)} all-time</span>
      </div>
      {/* How much more value than a $20 Pro plan would give this cycle */}
      <Separator className="my-2" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
          vs Pro plan ({fmtUSD(PRO_PRICE)}/mo)
        </span>
        <span style={{ fontSize: 11, color: ACCENT, fontFamily: 'monospace', fontWeight: 600 }}>
          {(cycleValue / PRO_PRICE).toFixed(1)}× · {fmtUSD(cycleValue - PRO_PRICE)} more
        </span>
      </div>
    </Block>
  );
}
