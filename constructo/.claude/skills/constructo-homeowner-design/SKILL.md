---
name: constructo-homeowner-design
description: Use this skill to generate well-branded interfaces and assets for the Constructo Homeowner app ("Calm Cockpit"), either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, bundled icons, and a UI kit of components for prototyping a calm, reassuring, Devanagari-first construction-tracking app for homeowners.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Fastest path
1. Link the tokens: `<link rel="stylesheet" href="styles.css">` — gives you the sand canvas, Eczar/Hind/IBM Plex Mono webfonts (Devanagari + Latin), and every `--token`.
2. Use the components from the bundle: load `_ds_bundle.js`, then `const { Button, StatusPill, TimeBar, EvidenceCard, DecisionCard, PhotoTile, Avatar, BottomNav, QuietState, Icon, AppShell } = window.ConstructoHomeownerDesignSystem_f56755`. Each component has a `.prompt.md` next to it with usage.
3. Compose, don't re-implement. Full screens live in `ui_kits/homeowner/`.

## Non-negotiable brand rules (see readme.md §1–4)
- **Reassure.** Answer "Am I okay?" in 3 seconds; success is earned absence (no streaks/badges).
- **Eczar serif = headlines ONLY; Hind = all body; IBM Plex Mono = ₹ money** (Indian grouping ₹1,20,000, tabular).
- **Colour roles:** green = primary + on-track · clay = celebration/milestone · amber = needs-you choices · **red = genuine delay only**.
- **Status = colour + icon + word** (use `StatusPill`). **Progress in time, never a % or ring** (use `TimeBar`).
- **Real photos only** (never AI/3D renders). **Voice + photo before forms.**
- **Single language per screen** (EN or हिं). **≥48px targets, ≥4.5:1 contrast, ≥14px type, respect reduced-motion.**
- **No emoji in UI chrome** (only in human-authored message content). Icons come from the bundled `Icon` set.
