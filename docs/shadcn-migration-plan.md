# shadcn/ui Migration Plan

Branch: `ui-shadcn-upgrade`

## Goal
Replace the hand-rolled inline-style UI with shadcn/ui components for consistency and easier iteration, **without losing** the app's signature look: the frameless macOS glass window, the concentric quota rings, and the activity heatmap.

---

## Status (live)

| Phase | State |
|---|---|
| Phase 0 — Tooling | ✅ **Done** |
| Phase 1 — Primitives | ✅ **Done** — `Card`, `Separator`, `Tabs`, `Button`, `Skeleton` wired; `Badge` consciously deferred |
| Refactor — modular split | ✅ **Done** (App.tsx 1122 → ~130 lines; see structure below) |
| Phase 2 — Forms & overlays | ⬜ Not started |
| Phase 3 — Charts | ⬜ Not started |

**Installed shadcn components** (`components/ui/`): `card`, `button`, `tabs`, `badge`, `skeleton`, `separator`.
**Used**: `card` (via `Block`), `separator` (value card divider, hero hairline), `tabs` (full-width header switcher, **underline active style** — see Phase 1 note), `button` (Save token, SyncReview actions), `skeleton` (Claude/Toggl loading states).
**Deferred — `badge`**: the only badge-like element is the Toggl running-timer pill, which is really a status *banner* — a better fit for Phase 2's `Alert`/`Sonner` than `Badge`. Left as-is rather than forcing it.

---

## Constraints / non-negotiables (unchanged)
- **Preserve the glass chrome** — `rgba(10,12,16,0.90)` + `backdrop-filter: blur(28px) saturate(180%)`. shadcn theming must **not** put an opaque background on `<body>`. (Handled in Phase 0: `globals.css` only sets `color` on body, never `bg-background`.)
- **Preserve `WebkitAppRegion` drag handling** — root is `drag`; interactive areas are `no-drag` (via the `...({ WebkitAppRegion } as any)` spread).
- **Keep custom visuals** — `ConcentricRings`/`Ring`, `ActivityHeatmap`, `ValueCard` gauge, `BurnUp` SVG stay hand-drawn. Only surrounding chrome migrates.
- **Always-dark** — CSS variables defined at `:root` + `.dark` on `<html>`.

---

## Current file structure (post-refactor)

The monolithic `App.tsx` was split. Migration work now targets these files, **not** line numbers in `App.tsx`. The rules for keeping this layout intact live in `CLAUDE.md` → "Renderer structure rule" (keep `App.tsx` thin, group by domain, no logic in `.tsx`, `@/` imports, shadcn primitives in `components/ui/`).

```
App.tsx                       root only (tabs header, window chrome, state)
styles/globals.css            Tailwind v4 entry + theme variables
components.json               shadcn config (flat layout, @/ aliases)
lib/
  utils.ts                    cn()
  types.ts                    ClaudeStats, TogglStats, window.claudeAPI
  format.ts                   formatters / derivations
  constants.ts                ACCENT, PRO_PRICE
  limits.ts                   ClaudeLimits, load/save
components/
  primitives.tsx              Block (→ Card), SectionLabel, StatRow
  ui/                         shadcn components (card, button, tabs, badge, skeleton, separator)
  claude/
    ClaudePanel.tsx           hero card + sections
    ConcentricRings.tsx       (custom SVG — keep)
    ActivityHeatmap.tsx       (custom — keep) + StreakCard
    HourBar.tsx               (custom — candidate for Chart)
    ValueCard.tsx             ROI gauge (custom) — uses Separator
    BurnUp.tsx                cumulative SVG (candidate for Chart)
  toggl/
    TogglPanel.tsx
    TogglTokenInput.tsx
    SyncReview.tsx
```

---

## Phase 0 — Tooling ✅ Done
- Installed Tailwind v4 + `@tailwindcss/vite`; runtime deps `class-variance-authority clsx tailwind-merge lucide-react tw-animate-css`.
- `electron.vite.config.ts`: added `tailwindcss()` to renderer plugins + `@` alias.
- `tsconfig.json`: `paths: { "@/*": ["./*"] }`.
- `styles/globals.css`: Tailwind entry + theme variables mapped from the inline palette; `body` kept transparent.
- `components.json`, `lib/utils.ts`, `class="dark"` on `<html>`.
- Verified: build emits CSS, glass intact.

## Theme mapping (done in globals.css)
`#0a0c10` glass (app root only) · `--card` `rgba(255,255,255,0.04)` · `--border` `rgba(255,255,255,0.08)` · `--input` `0.12` · `--foreground` `#f1f5f9` · `--muted-foreground` `0.45` · `--primary`/`--ring` `#C15F3C` · `--accent-bright` `#E08A63` (active-tab text) · `--destructive` `#f87171`. Viz colors (`#D4956A`, `#B1ADA1`, `#f59e0b`, `#34d399`, `#6ee7b7`, `#fbbf24`) stay literals in the custom components.

**Accent single-sourcing**: the terracotta lives in exactly two declarations, one per consumption model — `--primary` (CSS/`className`, e.g. `after:bg-primary`, `text-accent-bright`) and the `ACCENT` JS const in `lib/constants.ts` (inline-style/SVG `fill`, where `var()` can't resolve). Don't reintroduce raw `#C15F3C`/`#E08A63` literals in components. (Still pending sweep: `ConcentricRings` `SESSION_COLOR`, and the `rgba(193,95,60,…)` alpha tints in `TogglTokenInput`/`SyncReview` → `bg-primary/NN`.)

## Phase 1 — Primitives ✅ Done

- **`Block` → `Card`** (`components/primitives.tsx`) — compact overrides `gap-0 rounded-[9px] px-[11px] py-[9px] shadow-none`. Covers every panel; call sites unchanged.
- **`Separator`** — `ValueCard` (vs-Pro row) and the hero card's internal hairline (`ClaudePanel`). (The limits editor that also used one was since removed.)
- **`Tabs`** — header switcher in `App.tsx` is now controlled `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`; `TabsList` carries the `no-drag` region. **Style: full-width underline tabs** — `TabsList` is `flex-1` with the two triggers each `flex-1` (split the width); active = brighter `text-accent-bright` + a full-width 3px terracotta underline via `after:` pseudo (`after:bg-primary`); shadcn's default focus ring/border/pill-fill are all neutralized (`focus-visible:ring-0`, no `data-[state=active]:bg`). No text-label emojis. `TabsContent` handles show/hide (no more `tab === …` conditionals in the body).
- **`Button`** — Save token (`TogglTokenInput`, `size="sm"`) and the SyncReview action buttons (`size="xs"`), styled to preserve the translucent terracotta look.
- **`Skeleton`** — Claude and Toggl loading states (replaces the `loading…` text; Toggl keeps the red error-text path).
- **`Badge`** — deferred (see status note above).

## Phase 2 — Forms & overlays ⬜ Not started
`npx shadcn@latest add input label checkbox dialog drawer sonner tooltip`
- ~~**LimitsEditor → `Dialog`**~~ — **obsolete**: `LimitsEditor.tsx` was removed; limits are now read-only via `loadLimits()` (no in-app editor). Drop `dialog` from the install list unless another use appears.
- **TogglTokenInput → `Input` + `Button`** — currently a raw `<input>`; the `Button` is already wired, the field is not.
- **SyncReview list → `Checkbox` + `Input` + `ScrollArea`** in a **`Drawer`**.
- **Sonner toasts** — replace inline sync result / rate-limit / error strings.
- **Tooltip** — ring %s and value numbers.

**Electron gotchas**: Radix overlays portal to `document.body` (outside the `drag` root — fine); the window hides on blur but opening a Dialog doesn't blur it; move `@keyframes pulse` (currently inline in `App.tsx`) to `globals.css`.

## Phase 3 — Charts ⬜ Optional, last
`npx shadcn@latest add chart` — migrate `HourBar` and `BurnUp` to recharts only if the look matches. **Rings and heatmap are not migrated.**

---

## What stays custom
`ConcentricRings` + `Ring`, `ActivityHeatmap`, `StreakCard`, `ValueCard` gauge, `BurnUp`, and the glass window chrome.

## Design decisions made during migration
- The Claude tab's heatmap + streak + rings were consolidated into **one hero `Card`** with an internal `Separator`, rather than three separate cards (titled list/stat sections remain individual cards).
- `set limits` is a borderless `SectionLabel`-styled text button at the hero card's bottom-right.
- Dividers: cards/whitespace separate sections; a `Separator` is used only to split two labeled sub-groups within one card (per the "lightest divider" principle).

## Verification (per change)
```bash
npm run build && npx tsc --noEmit && launchctl kickstart -k gui/$(id -u)/com.local.claude-widget
```
Confirm: glass blur intact, window drags, rings/heatmap render, no errors in `/tmp/claude-widget.log`. (`tsc --noEmit` matters — Vite strips types without checking them.)

## Rollback
All work is on `ui-shadcn-upgrade`; `main` retains the inline-style UI.
