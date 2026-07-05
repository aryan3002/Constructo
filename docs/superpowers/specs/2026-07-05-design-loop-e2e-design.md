# Design Loop End-to-End — Audit & Design (2026-07-05)

**Status:** awaiting founder review
**Scope:** the Homeowner Design tab + the full homeowner ↔ designer ↔ contractor design loop
**Sources:** 4-agent verified sweep of mobile `(homeowner)/design*`, mobile `(contractor)/architect/*`, `web/src/features/designer/*`, `backend/app/profiler/*` + `app/homeowner` design endpoints, and the 2026-06-12 / 2026-06-28 specs. Load-bearing claims re-verified by hand against the working tree.

---

## 1. Executive summary

The Design Profiler engine is a genuinely good machine — deterministic taste math, clean LLM trust boundary, versioned multi-audience briefs, a real approval state machine, membrane-checked access. The homeowner intake UI (areas → upload/Pinterest/preset references → star ranking → brief view → approve/send) is real and wired. The designer has theme-decision and materialize surfaces.

**But the loop cannot run in production.** Three structural breaks:

1. **No ignition.** `POST …/themes` (generate), `POST …/clarifications` (generate) and `POST …/brief` (generate) have **zero client callers** — no button in the homeowner app, architect app, or web. Themes and briefs only exist where a seed script created them. A real homeowner can rank 50 images and nothing will ever happen.
2. **No signal.** Zero notifications/activity/push anywhere in the loop (verified: no profiler references in `app/activity/`, notifications, or push). Every hand-off — brief sent to designer, designer signs off, changes requested — is silent. Both sides must poll.
3. **No designer sign-off surface.** The state machine's `architect_review → architect_sign_off` transition has no UI on mobile or web, and `revision_requested` is a dead-end state (it appears only as a transition *target*, `profiler/router.py:94-95`). A brief sent to the designer is stuck forever.

Plus one authority bug: the spec says the **homeowner** (owner/co-owner) approves themes, but `POST /themes/{id}/decision` is gated to contractor-side `_EDIT_ROLES` (`profiler/router.py:994-998`) — homeowners are locked out of the decision the whole intake exists to feed.

Also: ~250 lines of good, uncommitted bug fixes are sitting in the working tree right now (reference photos were saved as dead `file://` paths; the Pinterest og:image regex failed on **every real pin page** because real Pinterest emits `content` before `property`; stale `pin.it` links, ranked counters, keyboard trap). These fix real P0s and must be landed first.

---

## 2. What exists and works today

| Layer | Working |
|---|---|
| Homeowner intake | Design tab (Profile / Plans / Selections), profiler hub, per-area screen with Upload + Pinterest paste-link + preset packs, star+tag ranking (per-ref isolated state), real counts (after in-flight fix), calm confidence bands |
| Engine | Deterministic taste reducer + confidence + multi-owner conflict detection (`taste.py`, pure math); vision extraction on reference add; themes with reducer confidence + deterministic evidence; brief payload deterministic, LLM narrates 3 audience renderings; version++ on regenerate; attributed approval log; membrane matrix incl. homeowner-membership gate |
| Brief UI (homeowner) | 3-audience tabs, palette/materials/rooms/do-don't, Submit-for-designer-review / Request-changes / Approve (membrane-aware, degrades to comment on 403), approval timeline |
| Designer | Mobile: Brief hub → site view (areas, conflicts, add refs) → theme approve/adjust/reject. Web `/designer`: Intake tab (brief view, theme decisions, **materialize → Material+Spec rows**), Selections desk, Site changes |
| Bridge | `materialize` → idempotent pending Specs → existing spec approval flow (web-only trigger) |
| Simple design layer (non-Labs) | Homeowner references board per room, selections + advisory "check fit", style-profile prose draft/confirm, drawings view |

Deployment note: `enable_labs` defaults `true` and the Azure prod app does not override it → the profiler engine **is live in prod** today.

---

## 3. Gap audit

### P0 — the loop is broken without these

| # | Gap | Evidence |
|---|---|---|
| P0-1 | **No trigger for theme / clarification / brief generation** — endpoints exist (`_EDIT_ROLES`), no client wrapper or button anywhere | mobile `client.ts` design section (GET-only for themes/clarifications; no generate); web `designApi` has only `themeDecision`+`materialize` |
| P0-2 | **Zero notifications/activity for any design event** — homeowner submits → designer never learns; designer acts → homeowner never learns | no profiler hits in `app/activity/`, push, chat |
| P0-3 | **No architect sign-off / request-changes UI**; `revision_requested` has no exit transitions | `_BRIEF_TRANSITIONS` router.py:93-102; no `actOnBrief` caller on architect side |
| P0-4 | **Homeowner cannot decide themes** (spec: owner/co-owner approves; code: `_EDIT_ROLES` only) | router.py:994-998 vs spec §6 step 3 |
| P0-5 | **In-flight uncommitted fix pass not landed** (dead `file://` reference images; Pinterest parse failed on all real pins; stale pin.it UX; counters) | working tree diff, 14 files |

### P1 — the loop runs but feels broken

| # | Gap | Evidence |
|---|---|---|
| P1-1 | Clarifications: full API + mobile client wrappers exist, **no UI on either side** (homeowner can't see/answer; designer can't view) | `client.ts:549-554` unused; no screen renders them |
| P1-2 | Conflict resolution: homeowner sees flag, resolution button is a "design chat — coming soon" toast; web designer has no conflict UI; AI-compromise field specced but unsurfaced | `[area].tsx` conflict card; web Intake |
| P1-3 | Silent success: after approve/submit, toast "Done" — no "what happens next", no state-aware banner, no designer-response view | brief.tsx |
| P1-4 | **Two parallel, unconnected reference systems**: homeowner room board (`/homeowner/design/references`, room_tag) vs profiler references (area_key, ranked, feeds AI). Confusing duplicate "add inspiration" flows; room refs never influence taste | references/[room].tsx vs profiler/[area].tsx |
| P1-5 | Design chat is a stub in 3 places ("coming soon" toast) | design.tsx:341, profiler.tsx:258, [area].tsx:758 |
| P1-6 | No homeowner way to START a profile — 404 renders as "on its way" forever; only contractor-side roles can `POST /profiles` | design.tsx empty state; router `_EDIT_ROLES` |
| P1-7 | Homeowner never sees the outcome: materialized specs don't surface as homeowner decisions/selections; the loop's payoff is invisible | materialize → Spec rows only |
| P1-8 | Web/mobile designer parity holes: materialize web-only; add-references + conflicts mobile-only; no profile list on web | designer feature module |

### P2 — engine hygiene / hardening

- `GET /taste` **writes** to the DB (persist-on-GET, long-flagged) — move persistence to ranking/reference writes. (router.py:875-894)
- Vision extraction is synchronous + silently swallowed on failure — no status, no retry; a failed extraction permanently weakens taste with no visibility.
- Deferred membrane items still open: `contributor_id ∈ profile` validation, per-write cross-company tests.
- Hardcoded "Whole house" scope label; presigned-URL expiry renders silent blank tiles; brief versions never dedup.
- Untracked `mobile/src/api/homeowner.test.ts` (part of the in-flight pass) must land with it (tests must live under `src/`, never `app/`).

---

## 4. Target end-to-end loop

```
CONTRACTOR/DESIGNER or HOMEOWNER          ENGINE (deterministic)                 SIGNALS
─ start profile (or homeowner self-serve) ──────────────────────────────────▶ activity: profile_started → homeowner push
HOMEOWNER
─ add refs (upload/Pinterest/preset), rank ─▶ taste recompute on write
                                            area crosses threshold ─────────▶ AUTO: themes proposed + clarifications asked
                                                                              activity: themes_ready → homeowner + designer
─ answer clarifications (card in Design tab)─▶ feeds next recompute
─ resolve conflicts (accept AI compromise / pick / "ask our designer")
─ decide themes (owner/co-owner; designer may also — both attributed)
─ "Get my brief" (or designer triggers) ───▶ brief vN generated ────────────▶ brief_ready → both parties
─ review brief → Submit for designer review ────────────────────────────────▶ brief_sent → designer push + badge
DESIGNER (mobile dp/[id] + web Intake)
─ reviews architect rendering, clarification answers, conflicts
─ Request changes (note) ──────────────────▶ revision_requested ────────────▶ changes_requested → homeowner push
   └─ homeowner adjusts → regenerate → new version → homeowner_review (exit path!)
─ Sign off ────────────────────────────────▶ contractor_brief_ready ────────▶ signed_off → homeowner push
HOMEOWNER
─ Approve this version ────────────────────▶ approved ──────────────────────▶ approved → designer + contractor
CONTRACTOR/DESIGNER
─ Materialize (web + mobile) ──────────────▶ pending Specs + Materials ─────▶ specs_materialized
─ Spec approval routing (existing)  ───────▶ homeowner sees decisions/selections populate  ← the visible payoff
                                             brief locked on contractor_received
```

Design chat everywhere in this flow = deep-link into the existing crew conversation with pre-filled context (the PR #241 `?site/?conversation/?msg` contract) — no new chat infrastructure.

---

## 5. Approaches considered

- **A. Minimal loop closure** — only ignition + notifications + sign-off UI (P0s). Fastest, but leaves clarifications/conflicts dead, dual reference systems, and no payoff surface; the feature still feels hollow.
- **B. Close the loop end-to-end (RECOMMENDED)** — P0s + P1s in phases below. Every state has a producer, a consumer, and a signal; one inspiration surface; the payoff (specs → homeowner decisions) lands. This matches "engine + contract is the spine; UIs are thin clients."
- **C. Big-bang unification** — merge the simple homeowner design layer and the profiler into one new domain + full redesign. Cleanest end state, but high-risk migration for a live-pilot product and weeks of no user-visible progress. Rejected for now; Phase 5 does the UI-level unification and leaves data migration for later.

---

## 6. Implementation plan (phased; each phase is shippable)

### Phase 0 — Land the in-flight fix pass *(small; do first)*
Review + commit the current working-tree diff (14 files + untracked `src/api/homeowner.test.ts`) on a branch, run backend pytest + ruff, mobile typecheck + jest, PR. It fixes: dead `file://` reference uploads (new `/design/references/upload`), Pinterest og:image attribute-order (all real pins failed), stale pin.it 422 messaging, `my_ranked_count` counters, avg-confidence pill, honest "Design chat (soon)", KeyboardAvoidingView, check-fit error state, generic preset fallback.

### Phase 1 — Engine ignition + authority (backend)
1. **Auto-propose on threshold:** on ranking/reference/clarification-answer writes, when an area crosses `ranked ≥ recommended_count` (or content meaningfully changed since last run), generate themes + clarifications server-side (debounced per area; proposals only — humans still commit; FakeLLM-safe in tests). Persist taste on these writes; **remove the GET /taste side-effect** (P2 fix rides along).
2. **Homeowner theme decisions:** open `POST /themes/{id}/decision` to homeowner owner/co-owner via the existing brief-approval membrane pattern (`_load_accessible_profile` + `member_sub_role ∈ APPROVERS`); keep architect ability; both attributed.
3. **Homeowner conflict resolution:** open `POST /conflicts/{id}/resolve` to owner/co-owner (accept AI compromise / keep_a / keep_b / defer_to_architect); surface `ai_compromise` in `ConflictOut` if not already.
4. **Brief lifecycle repairs:** add `regenerate` as an explicit action from `revision_requested` (and from `homeowner_review` for refresh) → new version → `homeowner_review`; allow homeowner owner/co-owner to trigger first brief generation ("Get my brief") in addition to architect; keep generation deterministic-payload + LLM-prose.
5. **Self-serve start:** `POST /profiles/self-serve` (or open scoped create) — homeowner owner/co-owner creates a whole-house default profile (default areas by site's spaces; contractor trigger unchanged).
6. **Hygiene:** extraction status column (`ok/failed/pending`) + re-run endpoint + surfaced in `ReferenceOut`; `contributor_id ∈ profile` validation; per-write cross-company tests.

### Phase 2 — Events + notifications (the nervous system)
Event catalog emitted on transitions (reuse existing site-event/activity + push infra; no new tables unless activity needs a kind): `profile_started, themes_ready, clarifications_asked, clarification_answered, conflict_detected, conflict_resolved, brief_ready(vN), brief_sent_to_designer, changes_requested(note), designer_signed_off, brief_approved, brief_locked, specs_materialized`.
Consumers: homeowner Updates tab cards + push; designer Brief-hub badges ("1 new brief", "2 answers") + push; owner-web activity rows. Deep-links land on the right screen (brief, area, clarifications).

### Phase 3 — Designer cockpit completion (mobile architect + web /designer)
1. Sign-off + Request-changes (with required note) on the brief — mobile `dp/[id]` + web Intake, wired to `actOnBrief`.
2. Clarifications panel: questions + homeowner answers; regenerate CTA when answers arrive.
3. Conflict list + resolve on web (parity with mobile); "deferred to you" queue for `deferred_to_architect`.
4. "Generate / Regenerate brief" button (both apps) + approval timeline rendering.
5. Materialize on mobile (parity) + "what materialized" result sheet linking to Selections desk.
6. Badges from Phase 2 events; profile list on web (not just by-site fetch).

### Phase 4 — Homeowner loop completion (mobile)
1. **"Questions for you" card** (Design tab + area screen): list clarifications, answer sheet → `answerClarification` (wrappers already exist).
2. **Conflict sheet:** show both sides + AI compromise → accept / pick / "ask our designer" (defer) — replaces the toast stub.
3. **Theme review card:** owner/co-owner approve/adjust/reject proposed themes (from Phase 1.2).
4. **State-aware Design tab banner:** "With your designer since Tue" / "Designer asked for changes — see note" / "Signed off — approve to proceed" / "Being priced by your contractor"; post-action screens say what happens next instead of bare "Done".
5. **Brief versions:** version chip + history list; "what changed" from payload diff (deterministic).
6. **Design chat unstubbed:** all three stub buttons deep-link to the crew conversation with prefilled context ("About our kitchen design brief v2: …").

### Phase 5 — One inspiration surface + visible payoff
1. Point `references/[room]` and the Selections-tab "References" chips at profiler areas (room_tag ↔ area mapping helper); single add-flow (upload/Pinterest/presets) everywhere; keep old endpoints serving legacy rows read-only (dual-read), hide the duplicate board UI; data migration deferred.
2. Surface materialized pending Specs to the homeowner as decisions/selections ("Your brief became 8 material choices — 3 need your approval"), closing brief → spec → homeowner-visible payoff.
3. Decide fate of the prose "style profile" (keep as narrative rendering fed by profiler taste, or retire the separate draft flow).

### Phase 6 — Verify + ship
Updated seeds for a full-loop demo (both personas); iOS sim smoke of every new screen (runtime-context bugs don't surface in jest — learned 2026-06-12); backend suite + ruff; mobile typecheck + jest; **web `npm run build`** (not `lint` — CI/Vercel gotcha); deploy backend rev + Vercel; ENABLE_LABS already on in prod.

**Sequencing:** 0 → 1 → 2 → (3 ∥ 4) → 5 → 6. Phases 3 and 4 parallelize cleanly (different apps, same contracts).
**Rough scale:** P0 ≈ half a day; P1 ≈ 2-3 days; P2 ≈ 1-2 days; P3 ≈ 2-3 days; P4 ≈ 3-4 days; P5 ≈ 2-3 days; P6 ≈ 1 day — subagent-driven TDD like prior profiler plans.

---

## 7. Decisions locked in as recommendations (veto anytime)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Who approves themes | Homeowner owner/co-owner (spec intent) AND architect; both attributed |
| D2 | Design chat | Deep-link into existing crew chat with prefilled context; no new chat infra |
| D3 | Dual reference systems | UI-level unification now (profiler is the source), data migration later |
| D4 | Generation policy | Auto-**propose** (themes/clarifications) on deterministic thresholds; brief generation stays human-triggered (homeowner "Get my brief" or designer) |
| D5 | Profile start | Homeowner self-serve creation + existing contractor trigger |

## 8. Out of scope (unchanged from program)
Pinterest OAuth board-sync (fast-follow; apply for Standard access early), brief→PDF export, floor-plan AI import, media ranking engine / storage quotas, spend summary, full data-model merge of the simple design layer (Phase 5 does UI only).
