# Homeowner App — UI kit

A high-fidelity, interactive recreation of the Constructo **homeowner** app (Direction C "Blend"), composed entirely from the design-system component primitives — not re-implemented.

## Run
`index.html` mounts `AppShell` from the compiled bundle. Open it in the Design System tab (where `_ds_bundle.js` is served).

## Screens
- **AppShell.jsx** — the calm phone shell: status bar, active-tab screen, bottom nav, and pushed overlays (Home Room, Decision). Holds the demo's interactive state.
- **HomeScreen.jsx** — the "Am I okay?" screen. Hero reassurance (serif), on-track pill, `TimeBar`, latest `EvidenceCard`, and a `DecisionCard` (or its "chosen" confirmation).
- **JourneyScreen.jsx** — the build story: pinned weekly **letter** card + running **total** (`+₹2,40,000`, all approved), then the status **spine** (milestone · progress · delay · change · quiet). Red appears only on the genuine delay.
- **DecisionScreen.jsx** — one pre-briefed choice: amber "needs you", two equal-weight real-photo options, mono ₹ prices, "Ask first", reversible footer.
- **HomeRoomScreen.jsx** — the curated builder thread: trust line, builder bubble, inline `EvidenceCard` + `DecisionCard`, an `@ask` → **Nivaan** grounded answer with citation + fallback, and the photo/voice-first composer.

## Interactions
- Bottom nav switches Home / Journey / Photos / Money.
- Home → message icon opens **Home Room**; the `DecisionCard` "Review" opens the **Decision** flow.
- Choosing a tile returns to Home with a calm confirmation.

## Composition
Every control is a DS component (`Button`, `IconButton`, `Chip`, `StatusPill`, `TimeBar`, `EvidenceCard`, `DecisionCard`, `Card`, `PhotoTile`, `Avatar`, `BottomNav`, `QuietState`, `Icon`). Screens add only layout + copy. Photos use `PhotoTile` placeholders — drop in real `src`s for production.
