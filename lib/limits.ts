// User-configurable quota limits + billing cycle, persisted to localStorage.

export interface ClaudeLimits {
  session5h: number;     // tokens per 5-hour window
  weekly: number;        // tokens per 7 days
  weeklyDonnet: number;  // sonnet tokens per 7 days
  planPrice: number;     // $/month — ROI denominator
  cycleStartDay: number; // billing-cycle renewal day of month (1–28)
}

// Defaults tuned for Claude Max 5x plan (~5× Pro baseline)
export const DEFAULT_LIMITS: ClaudeLimits = {
  session5h:    2_500_000,
  weekly:      15_000_000,
  weeklyDonnet: 10_000_000,
  planPrice:    100,
  cycleStartDay: 1,
};

const LIMITS_KEY = 'claude-widget-limits';

export function loadLimits(): ClaudeLimits {
  try {
    const raw = localStorage.getItem(LIMITS_KEY);
    if (raw) return { ...DEFAULT_LIMITS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_LIMITS };
}

export function saveLimits(l: ClaudeLimits) {
  localStorage.setItem(LIMITS_KEY, JSON.stringify(l));
}
