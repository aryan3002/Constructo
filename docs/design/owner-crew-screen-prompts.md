# Owner & Crew — Screen prompts for Claude Design

Paste one at a time into the project that holds the owner/crew design system. Replace **"Blueprint"** with the actual system name if different. Tip: generate the **light** web screens first, then ask "now the dark-mode variant" so the tokens get tested in both modes.

Each prompt starts with the same compact reminder so the system doesn't drift.

---

## 1 · Owner Command Center (web · light · desktop) — the 7:15am decision hub

> Using the **Blueprint** owner/crew design system (warm-paper canvas, near-black ink, `#F2A100` safety-amber as the ONE primary, mono tabular ₹ with Indian grouping, 8px engineered radius, hairline elevation, status = colour + icon + word, evidence-on-tap, NEVER a %): design the **Owner Command Center** — the web console home, light mode, desktop.
>
> Left sidebar (sites + nav, de-emojied line icons) + a top bar (company name, ⌘K hint, site switcher, notifications bell, light/dark toggle, owner avatar). Main area = a calm-dense **3-column** layout:
>
> **Col 1 — "NEEDS YOU"** (≤3 ranked exception cards, worst-first). Each card: a status pill (colour+icon+word), a one-line plain claim, the ₹ in mono, a "show proof ▾" affordance, and a one-tap action row. Cards:
> - **RISK · Unverified invoice** — "ACC cement — invoice bills 120 bags, site logged 100" · **₹72,000** · ~₹12,000 at risk · actions **[Approve ₹72,000] [Hold] [Assign]** (owner sees Approve — money is owner-only). Show this one with proof **expanded**: a timestamped challan photo beside the invoice line.
> - **WARN · Labour shortfall** — "Whitefield Villa: 8 on site vs 14 expected · 3rd day" · **[Assign →]**
> - **INFO · Homeowner question** — "Priya asks: can we change the master-bath tile?" · **[Answer] [Propose →]**
>
> **Col 2 — "PORTFOLIO"** (sites worst-first). Each row: site name, **current stage + variance** ("Brickwork · 2 days behind expected" — NEVER a % or ring), a status dot, last activity. Three sites.
>
> **Col 3 — "THIS WEEK"** — ₹ cash **in / out** (mono, Indian grouping e.g. ₹4,20,000), ONE small sparkline (categorical colour, never the CTA amber), "Approvals pending · 3", and a secondary "Export to Tally".
>
> Amber appears only on the primary action + active nav; everything else is ink + the status hues. It must read like a calm ledger / decision queue, **not** a dashboard of charts.

---

## 2 · Reconciliation Cockpit (web · DARK · desktop) — the accountant's deep work

> Using the **Blueprint** system in **DARK mode** (deep ink canvas `#0E1014`, lifted amber `#FFB72E`, luminance-lift hairlines, glare-free for long indoor sessions; mono tabular ₹; status = colour + icon + word; evidence-first; no decoration): design the **Reconciliation Cockpit** — the accountant's master-detail screen.
>
> **Left — a dense virtualized queue.** A tight data grid with hairline row dividers; columns **[date · vendor · challan ₹ · invoice ₹ · status]**, money **right-aligned mono tabular**. A header keyboard hint: "↑↓ / j k to scan · Enter to open". Rows:
> - ✓ **matched** (ok) — "UltraTech · ₹1,84,000 · ₹1,84,000"
> - △ **mismatch** (risk) — "ACC cement · challan ₹60,000 · invoice ₹72,000"  ← **selected** (amber-15% selection wash)
> - ! **unverified** (warn) — "Saint-Gobain · ₹— · ₹48,500"
> - ✓ matched — "Asian Paints · ₹96,500 · ₹96,500"
>
> **Right — the proof pane for the selected mismatch.** A **proof strip**: a timestamped challan photo beside the invoice PDF, side by side. The mismatch called out plainly ("120 bags billed · 100 received · **₹12,000** gap"). Actions: **[Hold payment] [Mark GRN]** and a gated **[Export to Tally]** (note it requires a step-up OTP). 
>
> A clean dark **ledger** — zero charts, zero glow, amber only on the one primary affordance. Show that the status spine + numerals stay perfectly legible on the dark canvas.

---

## 3 · Field Capture (mobile · on-site · Hindi-first) — point-shoot-done

> Using the **Blueprint** system on **mobile, Hindi-first (Devanagari)**, on-site (glare, gloves, one hand): warm-paper canvas, ink + amber, mono numerals, big targets, voice/photo before forms, status = colour+icon+word, offline-tolerant. Design the **supervisor's Capture home**.
>
> **Top:** a calm header — site name "Whitefield Villa", today's date, a small sync indicator ("✓ synced" / "⏳ queued").
>
> **Center (dominant):** TWO huge capture controls, each ≥72px tall, glove-friendly —
> - a big **amber hold-to-talk** mic button: "बोलकर बताएं — दबाकर रखें"
> - a big **camera** button: "फ़ोटो भेजें"
> - a tiny "टाइप करें" text link beneath (typing is the last resort).
>
> **Below — a confirm card** showing an AI-extracted capture from a just-spoken voice note: **"आज 12 मज़दूर आए · पहली मंज़िल की छत की ढलाई"**, with the extracted numbers as **mono chips** (मज़दूर · 12), a "✦ साइट से" confidence note, and **[पुष्टि करें ✓] [बदलें]**.
>
> **Below that:** today's quick log (2 calm rows) + a "समस्या बताएं" (raise an issue) affordance.
>
> It must feel like the **sibling** of the web — same paper, ink, amber, mono numbers — but sized for a thumb in the sun: one obvious thing to do, nothing dense.
>
> *Then also render the **mukadam** ultra-simple variant: literally one giant "बोलें" button + one camera button + the confirm card — for someone who barely uses apps.*

---

## 4 · DPR Review (PM · light) — the honest-AI moment

> Using the **Blueprint** system (light): design the **Daily Progress Report review** — the PM's screen. The AI has **drafted** today's DPR; the PM reviews and **sends** (AI never auto-sends; Send is the only share path).
>
> Top: a **confidence meter** — "92% confident" (green/amber by threshold) with a one-line note ("Headcount + materials verified; one ambiguous number"). 
>
> The report card: site + date, then sections — **Work done · Labour · Materials in · Issues** — each line plain and **evidence-linked** (tap → the photo/voice/log behind it). Numbers in mono.
>
> Primary action: **[Send report]** (amber). Show the low-confidence behaviour in a caption: if confidence were <88% the Send button blocks with "Review the flagged line before sending." Evidence-first, no %, calm.

---

### How to read the results
- **Owner Command Center** tells you if the *light density* feels calm or cluttered — the core test.
- **Reconciliation Cockpit** tells you if you actually like **dark mode** + the ledger feel.
- **Field Capture** tells you if the **mobile** rethink (the part you disliked before) lands — and whether Hindi-first works.
- **DPR** tells you if the **honest-AI** treatment (draft + confidence + human-sends) reads right.

If a screen feels off, the usual culprits to tweak in the system: amber used too much (should be rare), radius too soft (should be engineered 8px), or density crossing into clutter (cut rows, rank harder).
