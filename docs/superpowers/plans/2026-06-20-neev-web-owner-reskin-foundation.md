# Neev Owner Re-Skin — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reversible, role-driven "Neev / Calm Cockpit" skin to the contractor web app so that an **owner** sees warm sand canvas + sage palette + Eczar serif headlines in both light and dark, while every other role keeps the Blueprint skin unchanged.

**Architecture:** Follow the existing three-tier token model (`src/ui/theme.css`). Add `[data-theme='neev']` + `[data-theme='neev-dark']` token blocks (re-skins all bound components automatically). Repoint Tailwind's `fontFamily` to the existing `--font-*` CSS vars so headlines pick up Eczar on neev. A pure `resolveDataTheme(skin, resolved)` maps a `skin` (`blueprint`|`neev`) × mode to the `data-theme` value; `ThemeModeProvider` holds the skin; an `OwnerSkinSync` component sets it from the user's role behind a `VITE_NEEV_OWNER` flag.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind 3 (CSS-var tokens), @fontsource, Vitest + Testing Library (jsdom), @tanstack/react-query.

## Global Constraints

- **ZERO changes under `constructo/backend/`** — presentation layer only; same API contract.
- **Other roles' Blueprint skin must be byte-for-byte unchanged** — only owner + flag-on switches.
- **Reversible:** `VITE_NEEV_OWNER=0` (or unset) → owners stay on Blueprint.
- **Keep green at every task:** `npx tsc -b --noEmit`, `npx vitest run` (currently 406 passing), `npm run build`, `npm run budget` (entry ≤ 250 KB gz).
- **All work on branch `feat/web-neev-owner`.** All paths below are relative to `constructo/web/`.
- **English-first** policy is unaffected (no copy changes in this phase).
- **File-content tests read files via Vite `?raw` imports (NOT `node:fs`)** so they stay type-checked by `tsc -b` and pull no Node globals into the browser app. Do **NOT** add a test `exclude` to `tsconfig.app.json` — its `include: ["src"]` must keep type-checking all tests.

---

### Task 1: Load Eczar + IBM Plex Mono fonts

**Files:**
- Modify: `package.json` (add two @fontsource deps)
- Modify: `src/ui/fonts.css` (append Eczar + IBM Plex Mono imports)
- Test: `src/ui/fontsNeev.test.ts` (create)

**Interfaces:**
- Produces: the font faces `Eczar` and `IBM Plex Mono`, available to `--font-display` / `--font-mono` overrides in Task 3.

- [ ] **Step 1: Write the failing test**

Create `src/ui/fontsNeev.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
// Vite ?raw import → the file's text as a string (typed via vite/client), so
// this test stays type-checked by tsc and needs no Node globals.
import fontsCss from './fonts.css?raw'

describe('Neev fonts are loaded', () => {
  it('imports Eczar (serif display) weights', () => {
    expect(fontsCss).toContain('@fontsource/eczar')
  })
  it('imports IBM Plex Mono (numerals) weights', () => {
    expect(fontsCss).toContain('@fontsource/ibm-plex-mono')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/fontsNeev.test.ts`
Expected: FAIL — `css` does not contain `@fontsource/eczar`.

- [ ] **Step 3: Install the font packages**

Run: `npm install @fontsource/eczar @fontsource/ibm-plex-mono`
Expected: both added to `package.json` dependencies + `package-lock.json` updated.

- [ ] **Step 4: Append the imports to `src/ui/fonts.css`**

Add at the end of the file:
```css

/* Display — Eczar (serif, Latin) — Neev owner skin headlines */
@import '@fontsource/eczar/400.css';
@import '@fontsource/eczar/500.css';
@import '@fontsource/eczar/600.css';
@import '@fontsource/eczar/700.css';

/* Numerals — IBM Plex Mono — Neev owner skin money/timestamps */
@import '@fontsource/ibm-plex-mono/400.css';
@import '@fontsource/ibm-plex-mono/500.css';
@import '@fontsource/ibm-plex-mono/600.css';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/ui/fontsNeev.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Verify the build still resolves the new imports**

Run: `npm run build`
Expected: build succeeds (Vite resolves the @fontsource css).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/ui/fonts.css src/ui/fontsNeev.test.ts
git commit -m "feat(web/neev): load Eczar + IBM Plex Mono for the owner skin"
```

---

### Task 2: Repoint Tailwind `fontFamily` to CSS vars

This is the key serif-enablement step. Today `fontFamily.display` is the literal `['Anek Latin', …]`, so redefining `--font-display` would have no effect on `.font-display`. Binding the utilities to the vars keeps Blueprint identical (`:root` already sets the vars to Anek/Hind/Spline) and lets the neev block override to Eczar.

**Files:**
- Modify: `tailwind.config.js` (fontFamily block, ~lines 78-82)
- Test: `src/ui/tailwindFonts.test.ts` (create)

**Interfaces:**
- Produces: `.font-display` → `var(--font-display)`, `.font-body` → `var(--font-body)`, `.font-mono` → `var(--font-mono)`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/tailwindFonts.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
// tailwind.config.js is at the web root (two levels up from src/ui).
import config from '../../tailwind.config.js'

describe('Tailwind fontFamily binds to CSS vars (mode/skin-aware)', () => {
  const ff = (config as unknown as { theme: { extend: { fontFamily: Record<string, string[]> } } })
    .theme.extend.fontFamily
  it('display → --font-display', () => expect(ff.display).toEqual(['var(--font-display)']))
  it('body → --font-body', () => expect(ff.body).toEqual(['var(--font-body)']))
  it('mono → --font-mono', () => expect(ff.mono).toEqual(['var(--font-mono)']))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/tailwindFonts.test.ts`
Expected: FAIL — `ff.display` equals `['Anek Latin', 'Anek Devanagari', 'system-ui', 'sans-serif']`.

- [ ] **Step 3: Repoint the fontFamily in `tailwind.config.js`**

Replace the `fontFamily` block:
```js
      fontFamily: {
        display: ['Anek Latin', 'Anek Devanagari', 'system-ui', 'sans-serif'],
        body: ['Hind', 'Anek Devanagari', 'system-ui', 'sans-serif'],
        mono: ['Spline Sans Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
```
with:
```js
      fontFamily: {
        // Bind to the CSS vars so the active theme/skin controls the face:
        // Blueprint (:root) = Anek/Hind/Spline; neev = Eczar/Hind/IBM Plex Mono.
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/tailwindFonts.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Guard against a Blueprint regression — full suite + build**

Run: `npx vitest run && npm run build`
Expected: all tests pass (still 406+), build succeeds. Blueprint headlines remain Anek because `:root` sets `--font-display: 'Anek Latin', …`.

- [ ] **Step 6: Commit**

```bash
git add tailwind.config.js src/ui/tailwindFonts.test.ts
git commit -m "refactor(web): bind Tailwind fontFamily to --font-* vars (skin-aware faces)"
```

---

### Task 3: Add `neev` + `neev-dark` token blocks

**Files:**
- Modify: `src/ui/theme.css` (append two `[data-theme=…]` blocks after the `daylight` block)
- Test: `src/ui/themeNeevTokens.test.ts` (create)

**Interfaces:**
- Produces: `[data-theme='neev']` (light) and `[data-theme='neev-dark']` redefining the role tokens to Calm Cockpit; introduces `--celebrate` / `--celebrate-subtle`; overrides `--font-display` (Eczar) and `--font-mono` (IBM Plex Mono); pebble radii.

- [ ] **Step 1: Write the failing test**

Create `src/ui/themeNeevTokens.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
// Vite ?raw import → the file's text as a string (typed via vite/client).
import css from './theme.css?raw'

describe('Neev token blocks exist', () => {
  it('defines a light neev block with sand canvas + sage brand', () => {
    expect(css).toMatch(/\[data-theme='neev'\]/)
    expect(css).toContain('#FCFAF3') // sand-50 canvas
    expect(css).toContain('#3E7D58') // sage brand
  })
  it('defines a warm neev-dark block', () => {
    expect(css).toMatch(/\[data-theme='neev-dark'\]/)
  })
  it('overrides the display font to Eczar on neev', () => {
    expect(css).toContain("--font-display: 'Eczar'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/themeNeevTokens.test.ts`
Expected: FAIL — no `[data-theme='neev']` in `theme.css`.

- [ ] **Step 3: Append the two blocks to `src/ui/theme.css`**

Insert immediately after the closing `}` of the `[data-theme='daylight']` block (around line 212):
```css

/* ============================================================================
 * Neev "Calm Cockpit" — owner skin. LIGHT. Warm sand canvas, sage primary,
 * terracotta celebration, amber = "needs you", red = delay only. Eczar serif
 * headlines / IBM Plex Mono numerals. Applied when role=owner + VITE_NEEV_OWNER.
 * ========================================================================== */
[data-theme='neev'] {
  --surface: #fcfaf3;          /* sand-50 — app canvas */
  --surface-card: #ffffff;     /* white cards on sand (crisp elevation) */
  --surface-elevated: #ffffff;
  --surface-overlay: #ffffff;
  --surface-sunken: #f3efe6;   /* sand-200 — wells, grid header */
  --surface-hover: #e9e3d5;    /* sand-300 */
  --surface-selected: #e5ede3; /* green-tint */

  --text-primary: #2a2519;     /* warm ink */
  --text-secondary: #6a6047;   /* ink-600 (5.4:1) */
  --text-muted: #9a9176;       /* ink-400 */
  --text-on-brand: #ffffff;

  --border: rgba(42, 37, 25, 0.14);
  --border-strong: rgba(42, 37, 25, 0.22);
  --divider: rgba(42, 37, 25, 0.09);

  --brand: #3e7d58;            /* sage-600 — the one primary action */
  --brand-hover: #4e8a68;
  --brand-pressed: #2c6243;
  --brand-subtle: #e5ede3;
  --brand-text: #2c6243;
  --ring: #2c6243;
  --ring-offset: var(--surface);
  --scrim: rgba(42, 37, 25, 0.4);

  --celebrate: #be6a41;        /* terracotta clay — milestones / eyebrows */
  --celebrate-subtle: #f6e7db;

  --ok-solid: #3e7d58;  --ok-bg: #e5ede3;  --ok-fg: #2c6243;   /* sage = on-track */
  --warn-solid: #b98318; --warn-bg: #faf1d9; --warn-fg: #946410; /* amber = needs you */
  --risk-solid: #bc4836; --risk-bg: #f6e2dc; --risk-fg: #99372a; /* red = delay ONLY */
  --info-solid: #3f6e96; --info-bg: #e2e8ee; --info-fg: #3f6e96;

  --done-solid: #837a5f; --done-bg: #f3efe6; --done-fg: #433d2c;

  --chart-1: #3f6e96; --chart-2: #b98318; --chart-3: #3e7d58; --chart-4: #7a5af8; --chart-5: #be6a41;

  --radius-card: 22px;
  --radius-sheet: 28px;
  --radius-control: 14px;

  --shadow-card: 0 1px 2px rgba(42, 37, 25, 0.04), 0 8px 20px -12px rgba(42, 37, 25, 0.18);
  --shadow-sheet: 0 -8px 24px rgba(42, 37, 25, 0.16);
  --shadow-pop: 0 4px 10px rgba(42, 37, 25, 0.06), 0 18px 40px -16px rgba(42, 37, 25, 0.26);

  --font-display: 'Eczar', Georgia, serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
}

/* ============================================================================
 * Neev — owner skin. DARK (warm-toned, designed fresh — NOT the cold Blueprint
 * dark). Sibling [data-theme] blocks do NOT inherit, so radii + fonts repeat.
 * Contrast pairs validated to AA in Task 7 (the dark/a11y polish phase).
 * ========================================================================== */
[data-theme='neev-dark'] {
  --surface: #1c1a14;          /* warm near-black */
  --surface-card: #26231b;
  --surface-elevated: #2e2a20;
  --surface-overlay: #2e2a20;
  --surface-sunken: #161410;
  --surface-hover: #322e23;
  --surface-selected: rgba(78, 138, 104, 0.22);

  --text-primary: #f2ecdd;     /* warm sand text */
  --text-secondary: #c4bba3;
  --text-muted: #9a9176;
  --text-on-brand: #1c1a14;

  --border: rgba(242, 236, 221, 0.12);
  --border-strong: rgba(242, 236, 221, 0.2);
  --divider: rgba(242, 236, 221, 0.08);

  --brand: #6ba585;            /* sage lifts in dark */
  --brand-hover: #7db596;
  --brand-pressed: #4e8a68;
  --brand-subtle: rgba(78, 138, 104, 0.2);
  --brand-text: #8fc0a4;
  --ring: #8fc0a4;
  --ring-offset: var(--surface);
  --scrim: rgba(0, 0, 0, 0.6);

  --celebrate: #d98a5c;
  --celebrate-subtle: rgba(190, 106, 65, 0.2);

  --ok-solid: #6ba585;  --ok-bg: #14271c;  --ok-fg: #8fc0a4;
  --warn-solid: #dfae4e; --warn-bg: #2a2008; --warn-fg: #dfae4e;
  --risk-solid: #e07a66; --risk-bg: #2a1310; --risk-fg: #e07a66;
  --info-solid: #6fa0c8; --info-bg: #0f1e2a; --info-fg: #6fa0c8;

  --done-solid: #9a9176; --done-bg: #211e17; --done-fg: #c4bba3;

  --chart-1: #6fa0c8; --chart-2: #dfae4e; --chart-3: #6ba585; --chart-4: #9b82ff; --chart-5: #d98a5c;

  --radius-card: 22px;
  --radius-sheet: 28px;
  --radius-control: 14px;

  --shadow-card: 0 0 0 1px rgba(242, 236, 221, 0.05), 0 8px 22px rgba(0, 0, 0, 0.5);
  --shadow-sheet: 0 0 0 1px rgba(242, 236, 221, 0.06), 0 -10px 30px rgba(0, 0, 0, 0.55);
  --shadow-pop: 0 0 0 1px rgba(242, 236, 221, 0.06), 0 12px 34px rgba(0, 0, 0, 0.55);

  --font-display: 'Eczar', Georgia, serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/themeNeevTokens.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Build (confirm CSS compiles)**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/ui/theme.css src/ui/themeNeevTokens.test.ts
git commit -m "feat(web/neev): add neev + neev-dark Calm Cockpit token blocks"
```

---

### Task 4: Pure skin resolver (`themeSkin.ts`)

**Files:**
- Create: `src/ui/themeSkin.ts`
- Test: `src/ui/themeSkin.test.ts` (create)

**Interfaces:**
- Produces:
  - `type ThemeSkin = 'blueprint' | 'neev'`
  - `type DataTheme = 'light' | 'dark' | 'neev' | 'neev-dark'`
  - `resolveDataTheme(skin: ThemeSkin, resolved: 'light' | 'dark'): DataTheme`
  - `skinForRole(role: string | undefined, enabled: boolean): ThemeSkin`
- Consumed by: Task 5 (`ThemeModeProvider`) and Task 6 (`OwnerSkinSync`).

- [ ] **Step 1: Write the failing test**

Create `src/ui/themeSkin.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolveDataTheme, skinForRole } from './themeSkin'

describe('resolveDataTheme', () => {
  it('blueprint passes the mode through', () => {
    expect(resolveDataTheme('blueprint', 'light')).toBe('light')
    expect(resolveDataTheme('blueprint', 'dark')).toBe('dark')
  })
  it('neev maps to the warm themes', () => {
    expect(resolveDataTheme('neev', 'light')).toBe('neev')
    expect(resolveDataTheme('neev', 'dark')).toBe('neev-dark')
  })
})

describe('skinForRole', () => {
  it('is neev only for an owner when the flag is enabled', () => {
    expect(skinForRole('owner', true)).toBe('neev')
  })
  it('is blueprint for owner when the flag is off', () => {
    expect(skinForRole('owner', false)).toBe('blueprint')
  })
  it('is blueprint for any non-owner role', () => {
    expect(skinForRole('pm', true)).toBe('blueprint')
    expect(skinForRole('accountant', true)).toBe('blueprint')
  })
  it('is blueprint while the role is still loading', () => {
    expect(skinForRole(undefined, true)).toBe('blueprint')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/themeSkin.test.ts`
Expected: FAIL — `Cannot find module './themeSkin'`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/themeSkin.ts`:
```ts
/**
 * Pure mapping between the active "skin" + resolved light/dark mode and the
 * `data-theme` value written to <html>. Kept pure + framework-free so it can be
 * unit-tested and reused by both the runtime provider and the no-FOUC script's
 * mirror logic. The server remains the authorization source of truth; the skin
 * only drives presentation.
 */
export type ThemeSkin = 'blueprint' | 'neev'
export type DataTheme = 'light' | 'dark' | 'neev' | 'neev-dark'

export function resolveDataTheme(skin: ThemeSkin, resolved: 'light' | 'dark'): DataTheme {
  if (skin === 'neev') return resolved === 'dark' ? 'neev-dark' : 'neev'
  return resolved
}

/** The Neev skin is owner-only and gated by the VITE_NEEV_OWNER flag. */
export function skinForRole(role: string | undefined, enabled: boolean): ThemeSkin {
  return enabled && role === 'owner' ? 'neev' : 'blueprint'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/themeSkin.test.ts`
Expected: PASS (6 assertions across 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/themeSkin.ts src/ui/themeSkin.test.ts
git commit -m "feat(web/neev): pure resolveDataTheme + skinForRole mapping"
```

---

### Task 5: Add `skin` state to `ThemeModeProvider`

**Files:**
- Modify: `src/ui/ThemeModeProvider.tsx`
- Test: `src/ui/ThemeModeProvider.skin.test.tsx` (create)

**Interfaces:**
- Consumes: `resolveDataTheme`, `ThemeSkin` from `./themeSkin` (Task 4).
- Produces: `useThemeMode()` now returns `{ mode, resolved, skin, setMode, setSkin }`. `setSkin(skin: ThemeSkin)` persists to `localStorage['cstk.skin']` and re-applies `data-theme`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/ThemeModeProvider.skin.test.tsx`:
```tsx
import { useEffect } from 'react'
import { render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { ThemeModeProvider, useThemeMode } from './ThemeModeProvider'
import type { ThemeSkin } from './themeSkin'

function SetSkin({ skin }: { skin: ThemeSkin }) {
  const { setSkin } = useThemeMode()
  useEffect(() => {
    setSkin(skin)
  }, [setSkin, skin])
  return null
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('ThemeModeProvider skin', () => {
  it('applies data-theme="neev" when skin is set to neev (light default)', async () => {
    render(
      <ThemeModeProvider>
        <SetSkin skin="neev" />
      </ThemeModeProvider>,
    )
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('neev'),
    )
  })

  it('applies data-theme="light" for the blueprint skin', async () => {
    render(
      <ThemeModeProvider>
        <SetSkin skin="blueprint" />
      </ThemeModeProvider>,
    )
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('light'),
    )
  })

  it('persists the skin to localStorage', async () => {
    render(
      <ThemeModeProvider>
        <SetSkin skin="neev" />
      </ThemeModeProvider>,
    )
    await waitFor(() => expect(localStorage.getItem('cstk.skin')).toBe('neev'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/ThemeModeProvider.skin.test.tsx`
Expected: FAIL — `useThemeMode()` has no `setSkin` (TypeError / undefined).

- [ ] **Step 3: Edit `src/ui/ThemeModeProvider.tsx`**

Add the import near the top (after the React import):
```tsx
import { resolveDataTheme, type ThemeSkin } from './themeSkin'
```

Add a storage key next to `STORAGE_KEY`:
```tsx
const STORAGE_KEY = 'cstk.theme'
const SKIN_KEY = 'cstk.skin'
```

Add a skin reader next to `readStored`:
```tsx
function readStoredSkin(): ThemeSkin {
  try {
    const v = localStorage.getItem(SKIN_KEY)
    if (v === 'neev' || v === 'blueprint') return v
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return 'blueprint'
}
```

Replace the `apply` function so it takes the skin:
```tsx
function apply(skin: ThemeSkin, resolved: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', resolveDataTheme(skin, resolved))
}
```

Extend the context interface:
```tsx
interface ThemeModeContextValue {
  mode: ThemeMode
  resolved: ResolvedTheme
  skin: ThemeSkin
  setMode: (mode: ThemeMode) => void
  setSkin: (skin: ThemeSkin) => void
}
```

Replace the provider body (from `export function ThemeModeProvider` through its `return`) with:
```tsx
export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStored())
  const [skin, setSkinState] = useState<ThemeSkin>(() => readStoredSkin())
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveMode(mode))

  // Apply the resolved theme to <html> whenever mode OR skin changes.
  useEffect(() => {
    const r = resolveMode(mode)
    setResolved(r)
    apply(skin, r)
  }, [mode, skin])

  // While in 'system', follow live OS-preference changes (re-using the skin).
  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined' || !window.matchMedia) {
      return
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const r: ResolvedTheme = mq.matches ? 'dark' : 'light'
      setResolved(r)
      apply(skin, r)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode, skin])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* localStorage unavailable — runtime-only change */
    }
  }, [])

  const setSkin = useCallback((next: ThemeSkin) => {
    setSkinState(next)
    try {
      localStorage.setItem(SKIN_KEY, next)
    } catch {
      /* localStorage unavailable — runtime-only change */
    }
  }, [])

  return (
    <ThemeModeContext.Provider value={{ mode, resolved, skin, setMode, setSkin }}>
      {children}
    </ThemeModeContext.Provider>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/ThemeModeProvider.skin.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Guard against regressions (typecheck + full suite)**

Run: `npx tsc -b --noEmit && npx vitest run`
Expected: 0 type errors; all existing tests still pass (the added context fields are additive).

- [ ] **Step 6: Commit**

```bash
git add src/ui/ThemeModeProvider.tsx src/ui/ThemeModeProvider.skin.test.tsx
git commit -m "feat(web/neev): ThemeModeProvider holds a skin (blueprint|neev)"
```

---

### Task 6: Wire the owner skin (`OwnerSkinSync` + flag)

**Files:**
- Modify: `src/api/config.ts` (add `NEEV_OWNER_ENABLED`)
- Create: `src/ui/OwnerSkinSync.tsx`
- Modify: `src/main.tsx` (render `<OwnerSkinSync />` inside `ThemeModeProvider`)
- Test: `src/ui/OwnerSkinSync.test.tsx` (create)

**Interfaces:**
- Consumes: `useMeRole()` from `../auth/useCan`, `useThemeMode()` from `./ThemeModeProvider`, `skinForRole` from `./themeSkin`, `NEEV_OWNER_ENABLED` from `../api/config`.
- Produces: `<OwnerSkinSync />` — renders `null`; sets the skin from role × flag on mount and whenever the role changes.

- [ ] **Step 1: Add the flag to `src/api/config.ts`**

Append after `USE_MOCKS`:
```ts
/** Neev "Calm Cockpit" owner skin — opt-in, reversible. Default OFF. */
export const NEEV_OWNER_ENABLED: boolean =
  String(import.meta.env.VITE_NEEV_OWNER).toLowerCase() === 'true'
```

- [ ] **Step 2: Write the failing test**

Create `src/ui/OwnerSkinSync.test.tsx`:
```tsx
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Force the flag ON for this suite, preserving the real config (API_BASE,
// USE_MOCKS, …) so transitive importers don't break.
vi.mock('../api/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/config')>()),
  NEEV_OWNER_ENABLED: true,
}))

import { OwnerSkinSync } from './OwnerSkinSync'
import { ThemeModeProvider } from './ThemeModeProvider'
import { qk } from '../api/queryKeys'
import type { Me } from '../api/auth'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('OwnerSkinSync', () => {
  it('switches to the neev skin for an owner when the flag is on', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData(qk.me(), { role: 'owner' } as unknown as Me)
    render(
      <QueryClientProvider client={qc}>
        <ThemeModeProvider>
          <OwnerSkinSync />
        </ThemeModeProvider>
      </QueryClientProvider>,
    )
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('neev'),
    )
  })

  it('keeps blueprint for a non-owner role', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData(qk.me(), { role: 'accountant' } as unknown as Me)
    render(
      <QueryClientProvider client={qc}>
        <ThemeModeProvider>
          <OwnerSkinSync />
        </ThemeModeProvider>
      </QueryClientProvider>,
    )
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('light'),
    )
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/ui/OwnerSkinSync.test.tsx`
Expected: FAIL — `Cannot find module './OwnerSkinSync'`.

- [ ] **Step 4: Create `src/ui/OwnerSkinSync.tsx`**

```tsx
import { useEffect } from 'react'
import { useMeRole } from '../auth/useCan'
import { NEEV_OWNER_ENABLED } from '../api/config'
import { useThemeMode } from './ThemeModeProvider'
import { skinForRole } from './themeSkin'

/**
 * Applies the Neev "Calm Cockpit" skin for owners once the role is known,
 * gated by VITE_NEEV_OWNER. Renders nothing. Mounted inside ThemeModeProvider
 * (for setSkin) and inside QueryClientProvider (for useMeRole). Reversible:
 * with the flag off, or for any non-owner role, it sets the blueprint skin.
 */
export function OwnerSkinSync() {
  const role = useMeRole()
  const { setSkin } = useThemeMode()
  useEffect(() => {
    setSkin(skinForRole(role, NEEV_OWNER_ENABLED))
  }, [role, setSkin])
  return null
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/ui/OwnerSkinSync.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Mount it in `src/main.tsx`**

Add the import after the `ThemeModeProvider` import:
```tsx
import { OwnerSkinSync } from './ui/OwnerSkinSync'
```
Render it as the first child inside `<ThemeModeProvider>`:
```tsx
      <ThemeModeProvider>
        <OwnerSkinSync />
        <LanguageProvider>
```
(Leave the rest of the tree unchanged.)

- [ ] **Step 7: Typecheck + full suite + build**

Run: `npx tsc -b --noEmit && npx vitest run && npm run build`
Expected: 0 type errors; all tests pass; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/api/config.ts src/ui/OwnerSkinSync.tsx src/ui/OwnerSkinSync.test.tsx src/main.tsx
git commit -m "feat(web/neev): apply the owner skin from role × VITE_NEEV_OWNER flag"
```

---

### Task 7: No-FOUC pre-paint hint

Avoids a one-frame Blueprint→neev flash on reload for owners by pre-applying the skin from a `localStorage` hint before first paint.

**Files:**
- Modify: `index.html` (the inline no-FOUC `<script>`)
- Test: `src/ui/noFoucHint.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/ui/noFoucHint.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
// index.html sits at the web root (two levels up). Vite ?raw → its text.
import html from '../../index.html?raw'

describe('no-FOUC script honours the neev skin hint', () => {
  it('reads the cstk.skin hint', () => {
    expect(html).toContain('cstk.skin')
  })
  it('can pre-apply neev / neev-dark before paint', () => {
    expect(html).toContain('neev-dark')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/noFoucHint.test.ts`
Expected: FAIL — `index.html` does not contain `cstk.skin`.

- [ ] **Step 3: Update the inline script in `index.html`**

Replace the body of the IIFE (the `try { … }` block) with:
```html
    <script>
      (function () {
        try {
          var mode = localStorage.getItem('cstk.theme') || 'system'
          var dark =
            mode === 'dark' ||
            (mode === 'system' &&
              window.matchMedia &&
              window.matchMedia('(prefers-color-scheme: dark)').matches)
          var skin = localStorage.getItem('cstk.skin') === 'neev' ? 'neev' : 'blueprint'
          var attr =
            skin === 'neev' ? (dark ? 'neev-dark' : 'neev') : dark ? 'dark' : 'light'
          document.documentElement.setAttribute('data-theme', attr)
        } catch (e) {
          document.documentElement.setAttribute('data-theme', 'light')
        }
      })()
    </script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/noFoucHint.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add index.html src/ui/noFoucHint.test.ts
git commit -m "feat(web/neev): pre-paint neev skin hint (no-FOUC)"
```

---

### Task 8: Phase-1 verification & DoD

**Files:** none (verification only).

- [ ] **Step 1: Full green gate**

Run: `npx tsc -b --noEmit && npx vitest run && npm run build && npm run budget`
Expected: 0 type errors; all tests pass (406 + the new tests); build succeeds; bundle budget passes (fonts are separate assets — JS entry unaffected; if the CSS bundle trips a budget, subset Eczar/IBM Plex Mono weights).

- [ ] **Step 2: Visual proof — neev light**

Start the dev server with the flag on (e.g. `VITE_NEEV_OWNER=true npm run dev`), log in as the owner, and screenshot the Owner Home/Brief.
Expected: warm sand canvas, **Eczar serif** headline, sage primary button. (Composition is still Blueprint layout — that's Phase 3; only the skin changes here.)

- [ ] **Step 3: Visual proof — neev dark**

Toggle dark mode (Settings) and re-screenshot.
Expected: warm-dark canvas (not the cold Blueprint dark), sand text, lifted sage.

- [ ] **Step 4: Reversibility proof**

Restart the dev server WITHOUT the flag (`npm run dev`), log in as owner.
Expected: Blueprint skin (cool tokens, Anek headlines) — identical to today. Log in as a non-owner with the flag on → Blueprint.

- [ ] **Step 5: Commit any screenshots/notes if captured, else finish**

```bash
git commit --allow-empty -m "test(web/neev): Phase 1 foundation verified (light/dark + reversible)"
```

---

## Definition of Done (Phase 1)

- With `VITE_NEEV_OWNER=true`, an **owner** sees the whole web app in warm Neev tokens + Eczar serif headlines, in both light (`neev`) and dark (`neev-dark`).
- Every other role, and owners with the flag off, see **unchanged Blueprint**.
- `tsc`, the full Vitest suite, `build`, and `budget` are all green.
- No backend file changed.

---

## What's next (separate just-in-time plans)

Foundation makes the app *look* Neev via tokens. The remaining phases refine *composition* and are each written as their own plan once Foundation lands (each needs the live component markup in hand):

- **Phase 2 — Shell:** re-skin `AppShell` (warm sidebar, topbar, scope switcher) to the prototype chrome.
- **Phase 3 — Tier-A editorial surfaces:** Brief hero ("3 decisions need your call"), Approvals, Decision Log, decision modal, Sites, Specs — rebuild card composition to match the prototype.
- **Phase 4 — Tier-B warm-but-dense desk tools:** Reconcile, Reports, Documents/Drawings, Admin, Payments, DPR, Permits, Search, Groups, Notifications, Settings, More — palette/type only, density preserved.
- **Phase 5 — neev-dark + a11y:** validate/adjust dark values, WCAG AA pass on every owner surface, focus rings, reduced-motion.
