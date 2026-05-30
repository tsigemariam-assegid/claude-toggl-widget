import { useEffect, useState } from 'react';
import type { ClaudeStats, UsageLimitsAPI } from '@/lib/types';
import { type ClaudeLimits, loadLimits } from '@/lib/limits';
import { ACCENT } from '@/lib/constants';
import { cycleSeries, cycleStart, fmtTokens, fmtUSD } from '@/lib/format';
import { Block, SectionLabel, StatRow } from '@/components/primitives';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ActivityHeatmap, StreakCard } from './ActivityHeatmap';
import { ConcentricRings } from './ConcentricRings';
import { HourBar } from './HourBar';
import { ValueCard } from './ValueCard';
import { BurnUp } from './BurnUp';

export function ClaudePanel({ stats }: { stats: ClaudeStats | null }) {
  const [limits] = useState<ClaudeLimits>(loadLimits);
  const [usageLimits, setUsageLimits] = useState<UsageLimitsAPI | null>(null);

  useEffect(() => {
    window.claudeAPI?.getUsageLimits().then(setUsageLimits).catch(() => {});
    const id = setInterval(() => {
      window.claudeAPI?.getUsageLimits().then(setUsageLimits).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (!stats) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Skeleton className="h-[210px] w-full rounded-[9px]" />
      <Skeleton className="h-[64px] w-full rounded-[9px]" />
      <Skeleton className="h-[80px] w-full rounded-[9px]" />
    </div>
  );

  const { points, cost: cycleValue, savings: cycleSavings } = cycleSeries(stats.dailyValue, cycleStart(limits.cycleStartDay));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* One card encompassing the formerly card-less hero sections (heatmap +
          streak + rings), with an internal hairline separating the two groups. */}
      <Block>
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ActivityHeatmap activityByDay={stats.activityByDay} />
          </div>
          <div style={{ width: 84, flexShrink: 0 }}>
            <StreakCard activityByDay={stats.activityByDay} />
          </div>
        </div>

        <Separator className="mt-6 mb-4 bg-white/[0.06]" />

        <ConcentricRings stats={stats} limits={limits} usageLimits={usageLimits} />
      </Block>

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
                  <div style={{ height: '100%', width: `${pct * 100}%`, background: ACCENT, borderRadius: 1, opacity: 0.65 }} />
                </div>
              </div>
            );
          })}
        </Block>
      )}

      <ValueCard
        cycleValue={cycleValue}
        allTimeValue={stats.total.cost}
        price={limits.planPrice}
        cycleStartDay={limits.cycleStartDay}
      />

      <BurnUp points={points} price={limits.planPrice} />

      <Block>
        <StatRow label="💸 saved by caching · cycle" value={fmtUSD(cycleSavings)} />
        <StatRow label="saved by caching · all-time" value={fmtUSD(stats.cacheSavingsTotal)} />
      </Block>
    </div>
  );
}
