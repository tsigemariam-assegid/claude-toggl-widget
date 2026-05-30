import { useEffect, useState } from 'react';
import type { ClaudeStats, TogglStats } from '@/lib/types';
import { relTime } from '@/lib/format';
import { ClaudePanel } from '@/components/claude/ClaudePanel';
import { TogglPanel } from '@/components/toggl/TogglPanel';

type Tab = 'claude' | 'toggl';

export default function App() {
  const [tab, setTab]                 = useState<Tab>('claude');
  const [claudeStats, setClaudeStats] = useState<ClaudeStats | null>(null);
  const [togglStats, setTogglStats]           = useState<TogglStats | null>(null);
  const [togglToken, setTogglToken]           = useState<string | null>(null);
  const [tokenLoaded, setTokenLoaded]         = useState(false);
  const [togglFetchError, setTogglFetchError] = useState<string | null>(null);

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
    const fetchStats = () =>
      window.claudeAPI!.getTogglStats(togglToken)
        .then(s => { setTogglStats(s); setTogglFetchError(null); })
        .catch(err => setTogglFetchError(err instanceof Error ? err.message : 'Toggl error'));

    // Poll only while the widget is actually visible. The window hides on blur,
    // so an always-on interval would burn Toggl's hourly call budget for stats
    // nobody is looking at. Fetch on show, stop when hidden.
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (id) return; fetchStats(); id = setInterval(fetchStats, 3 * 60_000); };
    const stop  = () => { if (id) { clearInterval(id); id = null; } };
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());

    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [togglToken]);

  async function handleSetToken(token: string) {
    if (!window.claudeAPI) return;
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
        <div style={{ display: 'flex', gap: 2, ...({ WebkitAppRegion: 'no-drag' } as any) }}>
          {([
            { id: 'claude', label: '⚡ Claude' },
            { id: 'toggl',  label: '⏱ Toggl' },
          ] as { id: Tab; label: string }[]).map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id as Tab)} style={{
              padding: '4px 12px',
              border: 'none', borderRadius: 7, cursor: 'pointer',
              background: tab === id ? 'rgba(193,95,60,0.18)' : 'transparent',
              color: tab === id ? '#C15F3C' : 'rgba(255,255,255,0.35)',
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
            token={togglToken}
            onSetToken={handleSetToken}
            fetchError={togglFetchError}
          />
        )}
      </div>
    </div>
  );
}
