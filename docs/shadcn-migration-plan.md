# shadcn/ui Migration Plan

Branch: `ui-shadcn-upgrade`

## Goal
Replace the hand-rolled inline-style UI with shadcn/ui components for consistency and easier iteration, **without losing** the app's signature look: the frameless macOS glass window, the concentric quota rings, and the activity heatmap.

---

## Status (live)

| Phase | State |
|---|---|
| Phase 0 — Tooling | ✅ **Done** |
| Phase 1 — Primitives | 🟡 **Partial** — `Card` + `Separator` wired; `Button`/`Tabs`/`Badge`/`Skeleton` installed but not yet used |
| Refactor — modular split | ✅ **Done** (App.tsx 1122 → 131 lines; see structure below) |
| Phase 2 — Forms & overlays | ⬜ Not started |
| Phase 3 — Charts | ⬜ Not started |

**Installed shadcn components** (`components/ui/`): `card`, `button`, `tabs`, `badge`, `skeleton`, `separator`.
**Actually used so far**: `card` (via `Block`), `separator` (limits editor group split, value card, hero hairline).

---

## Constraints / non-negotiables (unchanged)
- **Preserve the glass chrome** — `rgba(10,12,16,0.90)` + `backdrop-filter: blur(28px) saturate(180%)`. shadcn theming must **not** put an opaque background on `<body>`. (Handled in Phase 0: `globals.css` only sets `color` on body, never `bg-background`.)
- **Preserve `WebkitAppRegion` drag handling** — root is `drag`; interactive areas are `no-drag` (via the `...({ WebkitAppRegion } as any)` spread).
- **Keep custom visuals** — `ConcentricRings`/`Ring`, `ActivityHeatmap`, `ValueCard` gauge, `BurnUp` SVG stay hand-drawn. Only surrounding chrome migrates.
- **Always-dark** — CSS variables defined at `:root` + `.dark` on `<html>`.

---

## Current file structure (post-refactor)

The monolithic `App.tsx` was split. Migration work now targets these files, **not** line numbers in `App.tsx`.

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
    LimitsEditor.tsx          form — uses Separator
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
`#0a0c10` glass (app root only) · `--card` `rgba(255,255,255,0.04)` · `--border` `rgba(255,255,255,0.08)` · `--input` `0.12` · `--foreground` `#f1f5f9` · `--muted-foreground` `0.45` · `--primary`/`--ring` `#C15F3C` · `--destructive` `#f87171`. Viz colors (`#D4956A`, `#B1ADA1`, `#f59e0b`, `#34d399`, `#6ee7b7`, `#fbbf24`) stay literals in the custom components.

## Phase 1 — Primitives 🟡 Partial

Done:
- **`Block` → `Card`** (`components/primitives.tsx`) — compact overrides `gap-0 rounded-[9px] px-[11px] py-[9px] shadow-none`. Covers every panel; call sites unchanged.
- **`Separator`** — replaced hand-rolled `1px` dividers in `LimitsEditor` (quota/billing split) and `ValueCard` (vs-Pro row); added the hero card's internal hairline (`ClaudePanel`).

Remaining (installed, not yet wired):
- **Tabs** — header switcher in `App.tsx` still custom buttons → `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` (keep `no-drag` on the trigger row).
- **Button** — `set limits`, Save token (`TogglTokenInput`), sync buttons (`SyncReview` `btn` helper) → `Button` variants.
- **Badge** — running-timer pill (`TogglPanel`), `+N entries`, streak.
- **Skeleton** — the `loading…` states in `ClaudePanel` / `TogglPanel`.

## Phase 2 — Forms & overlays ⬜ Not started
`npx shadcn@latest add input label checkbox dialog drawer sonner tooltip`
- **LimitsEditor → `Dialog`** — move the 6 number fields into a Dialog triggered by `set limits` (currently an inline swap inside the hero card).
- **TogglTokenInput → `Input` + `Button`**.
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
