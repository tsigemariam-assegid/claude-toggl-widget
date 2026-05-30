// Pure formatting/derivation helpers shared across components.
import type { ClaudeStats } from './types';

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function fmtUSD(n: number): string {
  if (n >= 10_000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 100)    return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}

export function fmtSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function fmtResetsAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs <= 0) return 'resetting…';
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffM = Math.floor((diffMs % 3_600_000) / 60_000);
  const diffD = Math.floor(diffMs / 86_400_000);
  if (diffD >= 2) return `resets in ${diffD}d`;
  if (diffH >= 1) return `resets in ${diffH}h ${diffM}m`;
  return `resets in ${diffM}m`;
}

// ISO "YYYY-MM-DD" of the current billing cycle's start, given the renewal day-of-month.
// If today is before the renewal day, the cycle started last month.
export function cycleStart(day: number, now = new Date()): string {
  const d = Math.min(Math.max(Math.floor(day) || 1, 1), 28);
  const start = new Date(now.getFullYear(), now.getMonth(), d);
  if (now.getDate() < d) start.setMonth(start.getMonth() - 1);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const dd = String(start.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Next renewal date label, e.g. "Jun 1"
export function fmtCycleReset(day: number): string {
  const now = new Date();
  const d = Math.min(Math.max(Math.floor(day) || 1, 1), 28);
  const next = new Date(now.getFullYear(), now.getMonth(), d);
  if (now.getDate() >= d) next.setMonth(next.getMonth() + 1);
  return next.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

// Cumulative value points + totals for the current cycle (days >= startISO)
export function cycleSeries(dailyValue: ClaudeStats['dailyValue'], startISO: string) {
  const days = Object.keys(dailyValue).filter(d => d >= startISO).sort();
  let cum = 0, cost = 0, savings = 0;
  const points = days.map(d => {
    const dv = dailyValue[d];
    cost += dv.cost; savings += dv.cacheSavings; cum += dv.cost;
    return { date: d, cum };
  });
  return { points, cost, savings };
}

// ISO (UTC) → 'YYYY-MM-DDTHH:mm' in the user's local time (datetime-local format)
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'failed';
}
