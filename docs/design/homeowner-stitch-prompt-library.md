# Constructo Homeowner — Stitch Prompt Library

Complete, ready-to-paste prompt set for generating the **fresh "Calm Cockpit" homeowner redesign** in Google Stitch. The design system is already installed — these prompts just describe each screen's content/layout.

## How to use
1. Open the Stitch project **"Constructo — Homeowner (Fresh Redesign)"** (id `14655651634697253072`).
2. For every screen: **device = Mobile**, **model = Gemini 3.1 Pro**, and **select the design system "Calm Cockpit"** (asset `ffb723eb8d164ae5a29a3851b56b74e1`) so colors/type/shape stay consistent.
3. Paste the prompt. Generate. To make a state-variant of an existing screen, use **Generate variants** (Refine) instead of a fresh screen.
4. Tip: generation can take 3–5 min and may show a timeout — the screen still appears. Don't re-run immediately; check the canvas first.

## Language modes (important — the real app is single-language)
The shipping app runs in **one language at a time**, chosen by the user — **never both on screen at once**. Produce two sets of screens:
- **English mode** — 100% English UI. (₹ + Indian digit grouping stay; numbers stay numeric.)
- **Hindi mode** — Hindi (Devanagari) UI, warm and natural, with English used **only where necessary**: proper nouns/names (Priya, Bengaluru), the brand "Constructo", and unavoidable tokens (OTP, PDF, ₹, dates/numbers). **No English gloss sitting next to the Hindi.**

The prompts below carry copy as bilingual source pairs (`English · हिंदी`) so one library drives both sets. **Prepend ONE directive as the FIRST line** of any prompt and Stitch renders a single-language screen.

⚠️ **Tested finding:** a soft directive ("use only one side") *leaks* — the model keeps English UI chrome (NEXT UP, PHOTOS) even in Hindi mode. Use these **forceful** directives, which work:

> **English directive (paste as first line):**
> `CRITICAL LANGUAGE RULE — READ FIRST: Every visible string on this screen MUST be in ENGLISH. Do NOT render ANY Hindi/Devanagari characters anywhere — greeting, labels, captions, buttons, status chips, or bottom nav. No Hindi translations beside anything. Where a string below shows "English · हिंदी", use ONLY the English side. Keep ₹ Indian number formatting.`

> **Hindi directive (paste as first line):**
> `CRITICAL LANGUAGE RULE — READ FIRST: Every visible string MUST be in HINDI (Devanagari), natural and warm. Do NOT render English words ANYWHERE except the proper name, the brand "Constructo", and numbers/₹/dates. TRANSLATE all UI labels, headers, buttons AND the bottom nav into Hindi (Home→होम, Photos→तस्वीरें, Updates→अपडेट, Design→डिज़ाइन, "Next up"→आगे, "This week"→इस हफ़्ते, Changes→बदलाव, "View all"→सब देखें, Ask→पूछें, Listen→सुनिए). Where a string below shows "English · हिंदी", use ONLY the हिंदी side. NO English UI words. No English gloss beside the Hindi.`

Generate each screen twice (once per directive) → an **English set** and a **Hindi set**. For best results, the Hindi directive must explicitly translate the nav + chrome (that's the part that leaks).

## Design language (baseline every screen inherits)
Warm Paper canvas `#FAF6EE` · white cards (16–20px radius, soft warm shadow) · **Calm Pine** `#1E7A63` primary · **Warm Clay** `#C5683B` for celebration only · status spine **always color+icon+word** (ok `#1E9E5A` ✓ / attention `#E8A317` ! / risk `#E5484D` △ / info `#3B7DD8` ⇄) · **Anek** headlines, **Hind** body, **Spline Sans Mono** for all numbers/₹/dates · ₹ Indian grouping (`₹1,20,000`) · **NEVER a percentage or progress ring** (use the time-bar) · real photos only (no AI/3D renders) · **single-language per screen** (English mode OR Hindi-first mode per the user's setting — see Language modes above; never both on one screen) · tap targets ≥48px · 4-tab bottom bar (Home · Photos · Updates · Design) + floating "✨ Ask" pill · calm, reassuring, never enterprise, red only for true delay/risk.

> **Already generated** (in the project): Home — On track ✓, Updates — Timeline ✓ (plus a Home–needs-attention draft and the hero photo asset). Re-generate or variant any of these as needed.

---

# TAB 1 — HOME ("Am I okay?")

## 1.1 Home — On track (flagship)
```
Design the HOME screen of "Constructo" — a calm, premium homeowner app for an Indian family building their house. Its one job is to answer "Am I okay?" in 3 seconds. Tone: reassuring, warm, bilingual Hindi/English. NEVER a percentage or progress ring.
Top to bottom:
1. SIGNATURE "LIVING HOME" HERO (full-bleed, ~45% height): a real photo of a half-built Indian house (concrete frame / brick walls, warm daylight) with a soft dark bottom gradient. Overlay: "Constructo" wordmark top-left, circular avatar/settings button top-right (48px); lower-left a warm greeting "सुप्रभात, Priya" (Anek) and below it "PRIYA'S HOME · BENGALURU" (mono caps); bottom-right a status chip — green dot + check + "On track · ~Nov 2026" (NOT a percentage).
2. STATUS CARD WITH TIME-BAR (white card overlapping the hero bottom by ~24px): a horizontal TIME-BAR with "Started Jan 2026" far-left and "~Handover Nov 2026" far-right (mono, muted), a calm-pine fill from the left, a warm "you-are-here" dot ~55% along, faint ticks for completed milestones. Below: milestone "Roof slab curing · छत की ढलाई — क्योरिंग" and one Hinglish status sentence "छत की ढलाई पूरी हो गई — अब 14 दिन क्योरिंग चल रही है, सब सामान्य है।" + a tiny "✦ Reviewed by your site engineer" badge.
3. SHORTCUT RAIL: 3–4 compact tappable tiles — NEXT UP "Plastering · ~Jul", PHOTOS "12 new" (tiny thumb), THIS WEEK "Summary ready", CHANGES "₹2,40,000 · all approved" (mono, Indian grouping).
4. LATEST FROM SITE: section label + "View all", horizontal scroll of 2–3 real construction photos with bilingual one-line captions ("छत की ढलाई · Roof slab poured · 2 days ago").
5. WEEKLY SUMMARY CARD (warm-clay left accent): eyebrow "THIS WEEK · 2–8 JUN", a 2-line warm summary, "🔊 Suniye" + "Read the full letter →".
Floating "✨ कोई सवाल? Ask" pill above the bar. Bottom nav 4 tabs, Home active (calm pine). Premium, calm, real.
```

## 1.2 Home — Needs attention
```
Design the HOME screen of "Constructo" (calm homeowner app, Indian family building a house) in the "NEEDS ATTENTION" state — the day one thing genuinely needs her. Same calm shell as normal Home. Bilingual Hindi/English. NO percentages.
1. LIVING-HOME HERO (~40% height): real Indian house under construction, warm daylight, soft gradient. "Constructo" top-left, avatar top-right (48px), "नमस्ते, Priya" (Anek) + "PRIYA'S HOME · BENGALURU" (mono). Status chip bottom-right: amber dot + "1 thing needs you" (amber, NOT red, NOT a percentage).
2. NEEDS-ATTENTION CARD (white, amber left border, overlapping hero): eyebrow "NEEDS YOU · 1 of 1", title "Choose your bathroom tile · बाथरूम टाइल चुनें", context "Tiling starts in ~4 days — pick before then.", cost "+₹0 · reversible" (mono), primary calm-pine button "Review choice →". ONE thing, calm, clear next step.
3. STATUS CARD WITH TIME-BAR: "Started Jan 2026 ●———◇— ~Handover Nov 2026" with a you-are-here dot (NOT %), milestone "Roof curing · छत क्योरिंग", short sentence "बाकी सब समय पर चल रहा है।", "✦ Reviewed by your site engineer".
4. SHORTCUT RAIL: NEXT UP "Plastering · ~Jul", PHOTOS "12 new", THIS WEEK "Summary ready", CHANGES "₹2,40,000 · approved".
5. LATEST FROM SITE strip: 2 real photos with bilingual captions.
Floating "✨ Ask" pill. Bottom nav, Home active. Amber for attention; red only for true delay. One thing at a time, never alarming.
```

## 1.3 Home — Quiet period (anti-silence)
```
Design the HOME screen of "Constructo" (calm homeowner app) in the "QUIET PERIOD" state — no new site photos for a few days, which is normal. Reassure, don't alarm. Bilingual Hindi/English. NO percentages, NO red.
1. LIVING-HOME HERO (~40%): the most recent real photo of the house (warm daylight), slightly softer. "Constructo" + avatar. Greeting "नमस्ते, Priya" + "PRIYA'S HOME · BENGALURU". Status chip: calm grey/muted dot + clock + "Quiet · on track" (muted, never red).
2. QUIET-PERIOD CARD (white, muted grey left accent, gentle — NOT red, NOT pulsing): icon a soft clock, title "Quiet on site — and that's normal", body in Hinglish "पिछले 3 दिन से नई फ़ोटो नहीं आईं क्योंकि छत की क्योरिंग चल रही है — इसमें कुछ दिन कुछ नहीं दिखता। चिंता की कोई बात नहीं।", a small "Why quiet? →" link. Reassuring, explains the reason.
3. STATUS CARD WITH TIME-BAR (same as on-track): time-bar with you-are-here dot, milestone "Roof curing · छत क्योरिंग — day 3 of 14", sentence "सब समय पर है।", "✦ Reviewed by your site engineer".
4. SHORTCUT RAIL: NEXT UP "Plastering · ~Jul", PHOTOS "no new — curing", THIS WEEK "Summary ready", CHANGES "₹2,40,000".
Floating "✨ Ask" pill. Bottom nav, Home active. The whole screen says "relax, nothing's wrong."
```

---

# TAB 2 — PHOTOS & VIDEOS ("Show me")

## 2.1 Photos & Videos (gallery)
```
Design the PHOTOS & VIDEOS tab of "Constructo", a calm premium homeowner app for an Indian family building their house — the "show me it's real" evidence gallery. Bilingual Hindi/English. No percentages.
1. Header: title "Photos" + subtitle "हर हफ़्ते की तस्वीरें". A rounded AI SEARCH BAR (magnifier, placeholder "Search photos… 'kitchen', 'roof'") with a 🎤 mic button right.
2. "LATEST" hero: one large rounded real photo of an Indian house under construction (warm daylight), bilingual caption overlaid "छत की ढलाई · Roof slab poured", small date "2 days ago".
3. Segmented pills: [All] (active calm pine) · [By Room] · [By Milestone] · [My visits].
4. Grouped grid: date header "This week · इस हफ़्ते" then a 2-column grid of rounded real construction photos, each with a small room chip (Kitchen/Living/Exterior) + tiny AI caption; then "Last week" group. A couple of tiles show a ▶ video icon.
5. A calm grey (NOT red) explainer tile where photos are sparse: "No new photos for 2 days — curing in progress, normal. / 2 दिन से कोई फ़ोटो नहीं।"
Floating "+" FAB (calm pine, bottom-right) to add her own site-visit photos. "✨ Ask" pill. Bottom nav, Photos active. Captions in her language, 16px radius, premium.
```

## 2.2 Photo viewer (full-screen)
```
Design a FULL-SCREEN PHOTO VIEWER for "Constructo" (calm homeowner app). One real construction photo of an Indian house, edge to edge on a warm-dark background. Bilingual Hindi/English. No percentages.
- Top bar (over photo): back chevron left, and right a small kebab menu; subtle.
- Bottom info sheet (rounded 24px top, white, rising over the photo): a bilingual AI caption "छत की ढलाई पूरी · Roof slab poured" (Anek/Hind), a metadata row in mono "📅 8 Jun 2026 · 🏠 Roof · ✓ by site engineer", and a small "ⓘ Curing matlab? Tap to translate" jargon-translate chip.
- Action row (large, ≥48px): "⭐ Save" · "📤 Share" · "🙈 Hide" (calm, secondary styling; Hide reversible).
- A thin filmstrip of adjacent photo thumbnails at the very bottom to swipe between.
Calm, premium, photo-forward. No status colors needed unless flagged.
```

---

# TAB 3 — PROJECT UPDATES ("What's the story?")

## 3.1 Updates — Timeline (already generated; regenerate/variant if needed)
```
Design the PROJECT UPDATES tab (Timeline view) of "Constructo", a calm homeowner app — "the story, at her reading level." Bilingual Hindi/English. No percentages.
1. Header: title "Updates" + subtitle "आपके घर की कहानी".
2. Sub-tab pills: [Timeline] (active calm pine) · [Milestones] · [Changes] · [Property].
3. PINNED WEEKLY SUMMARY CARD (warm-clay left accent): eyebrow "THIS WEEK · 2–8 JUN · ✦ AI summary", heading "Your week at a glance", 2 lines Hinglish summary, "🔊 Suniye" + "Read the full letter →".
4. Vertical TIMELINE feed (each card white, 16px, left status icon+color, newest first):
   - MILESTONE (green ✓): "Roof slab complete · छत की ढलाई पूरी", small real photo thumb, "View evidence →", tiny warm-clay accent.
   - PROGRESS (blue ⇄): "Curing started · क्योरिंग शुरू", "2 days ago".
   - DELAY (red △, sparingly): "Plastering pushed ~5 days · प्लास्टर में देरी" — MUST show revised date "~Jul 18", reason "rain · बारिश", impact "handover unchanged", "Why? →".
   - CHANGE (blue ⇄): "Bathroom tile upgraded · +₹18,000 · approved by you".
   - QUIET (muted grey clock, never red): "Site quiet 3 days — curing, normal. Nothing to worry about."
Floating "✨ Ask" pill. Bottom nav, Updates active. Status always color+icon+word; red only on the genuine delay.
```

## 3.2 Updates — Milestones
```
Design the PROJECT UPDATES tab (MILESTONES view) of "Constructo", a calm homeowner app. A vertical delivery-tracker of the home's journey. Bilingual Hindi/English. NO percentages — use ranges and dates.
1. Header "Updates" + subtitle; sub-tab pills with [Milestones] active.
2. A vertical milestone tracker (timeline rail with dots), top = done, bottom = upcoming:
   - DONE milestones (green ✓ filled dot): "Foundation · नींव — done 12 Feb", "Structure & roof · ढांचा — done 8 Jun", each with a small evidence chip "3 photos →" and "Save as PDF".
   - CURRENT milestone (calm-pine ring dot, emphasized): "Curing & plastering · क्योरिंग और प्लास्टर", a RANGE estimate in mono "usually 10–18 days · you're on day 8", short status line.
   - UPCOMING milestones (muted hollow dots): "Flooring · फ़र्श — ~Aug", "Finishing & paint — ~Oct", "Handover — ~Nov" with "~" honesty.
3. A small note: "Dates are best estimates and shift with weather — we'll always tell you why."
Floating "✨ Ask" pill. Bottom nav, Updates active. Calm, never a percentage, evidence on done items.
```

## 3.3 Updates — Changes (cost-change story log)
```
Design the PROJECT UPDATES tab (CHANGES view) of "Constructo", a calm homeowner app — the cost-change story log that defuses money anxiety. Bilingual Hindi/English. NO percentages.
1. Header "Updates" + subtitle; sub-tab pills with [Changes] active.
2. PINNED running-total card (white, calm): "Approved changes so far" with a big mono "+₹2,40,000" and a calm line "3 changes · all approved by you — no surprises."
3. A vertical list of CHANGE STORY cards (white, 16px, blue ⇄ icon), each told as a story not a line-item:
   - Title "Bathroom tiles upgraded · बाथरूम टाइल बेहतर की".
   - WHY line: "You picked anti-slip matte for the kids' bathroom."
   - Impact row (mono): "+₹18,000 · +0 days".
   - WHO: "Requested by you · Approved by Rahul (you) · 4 Jun".
   - "Show details ▾".
   Include one site-initiated change too: "Extra steel in beam · ज़्यादा सरिया" — WHY "site engineer found soil needed it", "+₹22,000 · +2 days", "Approved by you".
Floating "✨ Ask" pill. Bottom nav, Updates active. Story before number; running total always visible; calm, never alarming.
```

## 3.4 Weekly Summary — full "letter" detail
```
Design the WEEKLY SUMMARY detail screen of "Constructo" — a warm, letter-style recap that reads like a Sunday note from your builder. Bilingual Hindi/English. No percentages.
- Top: back chevron + title "This week · 2–8 Jun"; a warm-clay thin accent.
- A letter-style card (white, generous padding, Anek headings, Hind body) with 4 clear sections:
  1. "What got done · क्या हुआ" — 2–3 warm bullet lines with tiny photo thumbs.
  2. "Coming next week · आगे क्या" — 1–2 lines.
  3. "Needs your attention · आपकी ज़रूरत" — one item or "Nothing this week 🙂".
  4. "Any delays · कोई देरी" — honest line or "On schedule".
- A signature line: "✦ Written for you, reviewed by Suresh (site engineer)".
- Action bar: "🔊 Suniye" (read aloud) · "📤 Share with family".
Calm, warm, editorial. Real photo thumbs only. Premium letter feel.
```

---

# TAB 4 — DESIGN DOCUMENTS ("This is mine")

## 4.1 Design Documents (hub)
```
Design the DESIGN DOCUMENTS tab of "Constructo", a calm premium homeowner app — the only "creator" tab where she shapes her home's look. Bilingual Hindi/English. AI writes TEXT only, never house renders. No percentages.
1. Header: title "Design" + subtitle "आपकी पसंद, आपका घर". Top-right small member avatars + ⚙.
2. STYLE PROFILE hero card: eyebrow "YOUR DESIGN VIBE ✦", AI Hinglish prose "Warm minimalism with natural wood — गर्म, सादा, लकड़ी वाला।", tone chips [Warm] [Minimal] [Natural wood] [Earthy], "Reviewed by you · 12 Apr" + [Adjust] pill.
3. PLANS & DRAWINGS: label + "View all". Two plan cards: thumbnail, "Ground floor plan v3", AI "what changed" line "Kitchen widened 1 ft vs v2 · रसोई बड़ी हुई", [View PDF] + green [Approve] + small "Ask first". One card has an amber "Pending your approval" chip.
4. ROOM BY ROOM: horizontal scroll of room cards (Kitchen, Master Bath, Living): room photo, AI summary, coherence tone ("✓ coherent" green / "~ worth a look" amber — never red, never blocking), "Add a selection →".
5. INSPIRATION BOARD: small masonry of 4–5 real interior reference photos + "+ Add inspiration" tile, tiny provenance "Added by Neha (Advisor)".
6. MONTHLY DESIGN DIGEST card (warm-clay accent): "This month in design · इस महीने", 2-line AI summary + "Share →".
Floating "✨ Ask" pill. Bottom nav, Design active. Consistency tones advisory only, never blocking, never red. Editorial, calm.
```

## 4.2 Design Intake — Step 1 ("What feels like home?")
```
Design the DESIGN INTAKE step 1 of "Constructo" (first-run, one-time) — "What feels like home?" It should feel like describing your dream home to a friend, not a form. Bilingual Hindi/English. No percentages.
- Top: small progress dots (3 steps, step 1 active — dots, NOT a percentage). Title "What feels like home? · आपको क्या पसंद है?", subtitle "Pick a few that feel right — there's no wrong answer."
- A 2-column grid of curated REAL interior photos (kitchens, living rooms, bedrooms — warm, varied styles), each a rounded tappable swatch; a couple show a selected state (calm-pine check overlay).
- A prominent 🎙 VOICE escape-hatch button below the grid: "या बस बता दें — क्या चाहती हैं? (Hold to talk)".
- A skip link: "मुझे अभी पक्का नहीं — skip".
- Bottom: a calm-pine "Continue →" button (≥48px).
Real photos only, warm, friendly, low-pressure. No status colors.
```

## 4.3 Design Intake — Step 3 ("Here is your design vibe")
```
Design the DESIGN INTAKE step 3 of "Constructo" — "Here is your design vibe", the grounded AI profile. Bilingual Hindi/English. AI writes TEXT only (no renders). No percentages.
- Top: progress dots (step 3 active). Title "Here's your design vibe · आपका अंदाज़".
- A warm PROFILE CARD (white, calm): an AI Hinglish prose paragraph "Warm minimalism — natural wood, soft earthy tones, lots of daylight. आपको सादा पर गर्म लुक पसंद है।", and a small grounding badge "Based on 3 photos + 4 picks".
- Per-room override chips: "Kitchen: warm wood ✎", "Bedroom: calm neutral ✎" (tappable to adjust).
- A 🎙 "Adjust by voice — कुछ बदलना है? बोलें" button (headline action).
- Bottom buttons: primary calm-pine "✓ हाँ, यह सही है (This feels right)" and secondary "थोड़ा बदलें (Adjust by typing)".
Warm, affirming, editorial. A small warm-clay confetti-lite hint on confirm.
```

---

# ACTION FLOWS & MOMENTS

## 5.1 Decision detail (the pre-brief)
```
Design the DECISION DETAIL screen of "Constructo" — a calm homeowner app — where she makes one choice, pre-briefed so it's never scary. Bilingual Hindi/English. No percentages.
- Top: back chevron + "A decision for you · 1 of 1".
- WHY-NOW card (calm): "Tiling starts in ~4 days, so we need your tile pick before then. · टाइल का काम जल्दी शुरू होगा।"
- TWO option cards side by side, each a REAL product photo: "Matte anti-slip" and "Glossy" — each with a plain "What this means" line (e.g. "Safer when wet, softer look" / "Shinier, shows water spots") and a price line in mono "+₹0" / "+₹6,000".
- A taste cross-link chip (advisory, never blocking): "✦ Matte matches your warm-calm profile".
- Primary choices: "Choose Matte" / "Choose Glossy" (calm-pine), plus secondary "💬 Ask first" and "Let Rahul decide".
- Reassurance footer: "✓ Reversible until tiling begins (~4 days)".
Calm, photo-led, never a bare "Approve?". Real photos only.
```

## 5.2 Flag an issue (capture-first, 2 steps)
```
Design the FLAG AN ISSUE screen of "Constructo" — capture-first, under 30 seconds. Bilingual Hindi/English. No percentages.
STEP 1 (capture): Title "Spotted something? · कुछ दिखा?". Two BIG primary inputs side by side: a large "📷 Photo" button and a large "🎙 Hold to talk · बोलें" button (both ≥72px, calm). A tiny secondary "or type it" link below. Reassuring line "Send it once — we'll sort it out."
STEP 2 (confirm — show as the next state): a small photo thumb + an AI-drafted EDITABLE title "Bathroom tile crack lag raha ✎", the raw voice transcript shown small, an AI-preselected room chip "Bathroom ✎", soft urgency chips "AI guessed 'Needs a look' · tap to change" (calm — never "DANGER", never auto-escalate), and a calm-pine "Send to your team →" button. Footer "Reversible — edit or withdraw anytime."
Voice/photo first, typing last. Calm, never alarming.
```

## 5.3 My Requests tracker
```
Design the MY REQUESTS tracker of "Constructo" — a calm homeowner app. Bilingual Hindi/English. No percentages.
- Header: "Your requests · आपके सवाल".
- Segmented pills: [Open · 2] (active) · [Resolved · 5].
- A list of request cards (white, 16px), each showing: the request title "Bathroom tile crack · बाथरूम टाइल", a status pill (color+icon+word: 🟡 "Seen" / 🟡 "In progress" / 🟢 "Done" / 🔵 "Scheduled"), the actor "Raised by Neha (Family) · 3 Jun", and the latest REAL reply text in a small thread bubble "Suresh: Will fix Thursday, sending a mason. · गुरुवार को ठीक होगा।". An SLA promise line "Expected by Thu · we'll nudge once."
- One Done card shows a "Confirm fixed / Reopen" choice.
Calm, honest, real reply threads (not fake status strings). "✨ Ask" pill + bottom nav.
```

## 5.4 Ask / Assistant ("Poochho")
```
Design the ASSISTANT chat screen of "Constructo" — "Poochho · पूछो", a grounded project assistant. Bilingual Hindi/English. No percentages.
- Header: "Poochho · आपके घर के बारे में पूछें" with a small honesty banner "I only answer from your site's updates — and I'll say if I'm not sure."
- A chat thread:
  - User bubble (right, calm-pine): "Curing matlab kya? Kitne din?"
  - Assistant bubble (left, white): a plain Hinglish answer "क्योरिंग का मतलब छत को पानी से मज़बूत करना — आपके घर में 14 दिन चलेगी, day 8 चल रहा है।", with a small grounding badge "Based on 3 updates from your site" and a tappable citation chip "📸 Roof update · 6 Jun".
  - One ABSTAIN example: user asks "Extra cost kitna aayega?" → assistant says "मैं cost confirm नहीं कर सकती — आपकी टीम को भेज दूँ?" with a "Send to team →" button.
- Suggested chips above the input: "Kitchen kab?", "Is week kya hua?", "Curing matlab?".
- Input bar: text field + 🎙 mic (voice-first) + send.
Calm, honest, cites sources, abstains gracefully. Real, trustworthy.
```

---

# ONBOARDING, HOUSEHOLD & SETTINGS

## 6.1 Auth — phone + OTP
```
Design the LOGIN / OTP screen of "Constructo" homeowner app — phone + OTP only, no passwords. Bilingual Hindi/English. Warm, calm, one door.
- A calm intro: small Constructo wordmark, a warm line "Your home, one calm place. · आपका घर, एक शांत जगह।".
- Phone state: a single phone field pre-filled "+91", helper "We'll send a 6-digit code", a calm-pine "Send code →" button.
- OTP state (show as the next step): 6 large mono OTP boxes, a "Code sent on SMS" line, a 24s resend countdown, and a small "Change number" link.
- Footer: tiny "By continuing you agree to our terms."
Warm paper bg, white card, calm pine primary, Spline Mono for the OTP digits. Friendly, trustworthy, minimal.
```

## 6.2 Welcome (invited)
```
Design the WELCOME screen of "Constructo" (shown right after an invited homeowner verifies their phone). Bilingual Hindi/English. Warm, reassuring, templated truth.
- A warm hero illustration or soft real photo of a home.
- Headline (Anek): "Welcome to Sharma Residence 🏡".
- A templated truth card: "You've been invited by Verma Constructions as the Primary Owner · आप इस घर के मुख्य मालिक हैं।" with a small builder logo/avatar.
- A short reassuring line: "We'll keep you calmly updated — in your language. कुछ करने की ज़रूरत नहीं, बस देखते रहिए।"
- Primary calm-pine "Continue →".
Warm, premium, no forms here. Just orientation and trust.
```

## 6.3 Household setup
```
Design the HOUSEHOLD SETUP screen of "Constructo" — the primary owner adds family. Bilingual Hindi/English. No percentages.
- Header: "Who's in this with you? · आपके साथ कौन है?", subtitle "Add family — they'll see updates too (up to 6)."
- The current user shown as a card: "Priya · Primary owner · approves & manages".
- A list of added members, each a card with name, a role chip [Primary owner / Co-owner / Family / Advisor], a plain capability line ("can view & flag", "also approves costs"), and a "design say" toggle for advisors.
- A "+ Add someone" row (opens add-by-phone). One member shown as "⏳ Invited · code not used yet" with Resend/Cancel.
- Co-owner add shows an inline confirm note "Rahul will also approve costs."
- Bottom calm-pine "Done →".
Named roles, plain language, calm. Graceful — never a grey lock.
```

## 6.4 Settings hub
```
Design the SETTINGS hub of "Constructo" homeowner app. Bilingual Hindi/English. Calm, plain language with live human subtitles.
- Header: "Settings · सेटिंग्स".
- A small profile row: avatar + "Priya · +91 ••••• 43210".
- Rows-with-chevron, each with a live subtitle:
  - "Members · सदस्य" — "You + 3 others".
  - "Notifications · सूचनाएँ" — "Daily summary · 8am".
  - "Language · भाषा" — "Hindi + English".
  - "Privacy · निजता" — "You never see raw site logs; your notes stay private".
  - "Help · मदद" — "Chat or call your builder".
- A low-emphasis "Sign out" at the bottom.
Warm paper bg, white grouped rows, calm pine accents, Hind body. Reassuring, never enterprise.
```

## 6.5 Members
```
Design the MEMBERS screen of "Constructo" — the household roster. Bilingual Hindi/English.
- Header: "Members · सदस्य", subtitle "Everyone who can see your project."
- Member cards, each: avatar, name, role chip (Primary owner / Co-owner / Family / Advisor), a plain capability line ("approves & manages" / "can view & flag" / "design only — comments, not approvals"), and a notification cadence ("Daily" / "Weekly").
- One invited member: half-filled avatar, "⏳ Invited · code not used yet", Resend / Cancel.
- For a Family member viewing this, the "manage" control is replaced by "Ask Priya or Rahul · [Message Priya]" (graceful authority, never a grey lock).
- "+ Add someone" button (calm-pine).
Named roles, plain capabilities, calm, human.
```

## 6.6 My Notifications
```
Design the MY NOTIFICATIONS screen of "Constructo" homeowner app — per-member control. Bilingual Hindi/English. No percentages.
- Header: "How should we update you? · आपको कैसे बताएँ?".
- A segmented choice (big, ≥48px): [As it happens] · [Daily summary] (active, with an "8:00 AM" time chip) · [Weekly] · [Pause].
- A smart-default suggestion card (dismissible): "💡 Suggested: Daily at 8am — most owners find this calm enough."
- A non-negotiable note card (calm, not alarming): "Some things always reach you even when paused: a decision you must make, a cost change, or a delay."
- A "Quiet hours" row "9:30 PM – 7:00 AM" and a "Language for my updates" row "Hindi".
Calm, respectful, honest about what punches through. Warm paper, calm pine.
```

---

# NET-NEW SURFACES

## 7.1 Handover + Snag list
```
Design the HANDOVER screen of "Constructo" — "a graduation, not an audit", shown near project completion. Bilingual Hindi/English. NO percentage ring — use a count bar.
- Header: "Handover · गृह प्रवेश की तैयारी", a warm celebratory tone (subtle warm-clay).
- Internal tabs: [Checklist] (active) · [Walkthrough] · [Warranty].
- A COUNT bar (not %): "6 of 9 items cleared" with a segmented bar.
- A list of snag/checklist items grouped by room, each: title "Kitchen — cabinet hinge loose · कैबिनेट", a status (🟡 open / 🟢 cleared), and for open ones a "📷 Add photo to flag" (a snag can't be resolved without a photo). One shows an "auto-suggested to check (advisory)" tag.
- A warm footer card: "When everything's cleared, we'll make your handover PDF — yours to keep."
Calm, celebratory, evidence-led, count not percentage.
```

## 7.2 "This week in 60 seconds" recap (stories player)
```
Design a STORIES-STYLE RECAP player for "Constructo" — "This week in 60 seconds". Bilingual Hindi/English. REAL photos only (no AI frames). No percentages.
- Full-screen, warm-dark. Segment progress bars at the very top (5 segments, story-style).
- A large real construction photo filling the screen with a soft gradient.
- Overlaid AI Hinglish caption text (Anek, large) "छत की ढलाई पूरी — इस हफ़्ते का सबसे बड़ा कदम 🎉".
- A small "✦ Reviewed by Suresh" badge.
- Bottom: "📤 Share with family" and "See all photos →".
- Tap zones implied (left/right).
Premium, warm, celebratory, real photos, optional sound. Like a calm Instagram-story recap of the home.
```

## 7.3 Calm Notifications / Inbox
```
Design the NOTIFICATIONS INBOX of "Constructo" — calm and partitioned. Bilingual Hindi/English. No percentages.
- Header: "Inbox · सूचनाएँ".
- Section 1 "NEEDS YOU" (only if present): one decision card "Choose bathroom tile · ~4 days" with "Review →"; a money item shows graceful authority "Rahul can approve · you can comment".
- Section 2 "GOOD TO KNOW": calm items — "🎉 Milestone reached: roof complete", "Weekly recap ready", "Quiet explained: curing, normal" (grey, never red).
- Empty state (show prominently): a calm illustration + "☀ All caught up. Nothing needs you now. · सब ठीक है।"
Calm, two-part, reassuring. Status always color+icon+word. Warm paper, calm pine.
```

---

## Generation order (suggested)
**Spine first:** 1.1 → 2.1 → 3.1 → 4.1 (the 4 tabs). **States:** 1.2, 1.3, 2.2, 3.2, 3.3. **Moments:** 3.4, 5.1, 5.2, 5.3, 5.4. **Design flow:** 4.2, 4.3. **Onboarding/settings:** 6.1–6.6. **Net-new:** 7.1–7.3.

When the homeowner set feels right, we repeat the same approach for the **contractor app** (Owner/Supervisor/Mukadam + PM/Accountant/Procurement) with the "Blueprint" amber-on-ink design system.
