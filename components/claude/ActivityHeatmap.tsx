import { SectionLabel } from '@/components/primitives';

export function StreakCard({ activityByDay }: { activityByDay: Record<string, number> }) {
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', height: '100%' }}>
      <div style={{ fontSize: 24 }}>🔥</div>
      <div style={{ fontSize: 28, fontWeight: 'bold', color: '#f59e0b' }}>{streak}</div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', textAlign: 'center' }}>days<br />streak</div>
    </div>
  );
}

export function ActivityHeatmap({ activityByDay }: { activityByDay: Record<string, number> }) {
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

  const CELL = 14;
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
    <>
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
                          : `rgba(193,95,60,${opacity})`,
                        outline: day.isToday ? '1px solid rgba(193,95,60,0.6)' : 'none',
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
