# Contractor App QA Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the real defects surfaced by the 2026-06-12 four-session QA audit of the contractor mobile app (owner / supervisor / PM / architect), make the QA harness trustworthy, and close the role-access and chat-parity gaps — without chasing test-environment noise.

**Architecture:** Phased. Phase 0 makes future QA real (install `idb`, dev build, seed a rich QA company). Phases 1–2 are low-risk mobile + backend fixes shipped as small PRs. Phase 3 is the deferred supervisor→chat-kit migration (its own deep plan). Phase 4 fixes AI output language. Phase 5 is founder-gated product decisions. Every PR follows the working agreement: feature branch → CI-green → merge; invoke `constructo-contractor-design` (Neev) before any UI; explicit `git add <paths>`; never touch the founder's `(homeowner)/updates.tsx`.

**Tech Stack:** Expo / React Native (mobile), FastAPI + SQLAlchemy async + Alembic (backend), Postgres/Neon, Jest + tsc (mobile gate), ruff + pytest (backend gate).

---

## The Reframe — Signal vs Noise (read before executing)

The three QA reports listed ~30 findings. The agents ran **blind** (no `idb` → AppleScript taps that can't hold a 250 ms long-press; some pure code-analysis) against a **near-empty auto-created dev company**. Verified against the actual code, the findings sort into four buckets. **Do not "fix" the noise.**

| QA finding | Verdict | Why | Phase |
|---|---|---|---|
| PM "Company" shows a UUID | ✅ **Real bug** | `pm/more.tsx:78` renders `me.company_id`; `/auth/me` already returns `company_name` (`auth/router.py:198`) | 1 |
| Architect has no mobile app (blank/"coming soon") | ✅ **Real bug** | `(contractor)/_layout.tsx` has no `architect` case → falls to `index.tsx` "coming soon" | 2 |
| PM has no chat access on mobile | ✅ **Real gap** | `pm/_layout.tsx` only defines DPR + More | 2 |
| Supervisor chat: no delivery ticks | ✅ **Real gap** | `supervisor/chat.tsx` is the OLD pre-kit screen (custom poll, no `threadState` ticks) | 3 |
| Supervisor `@nivaan` = just `@ask` (no proposals) | ✅ **Real gap** | `supervisor/chat.tsx:323` routes both `@ask`/`@nivaan` to `chatApi.ask`; only `owner/chat/[id].tsx` has `NivaanProposalCard` | 3 |
| Brief empty-state text is Hindi for an `en` owner | ✅ **Real bug** | Brief LLM/`_fallback_text` don't receive the recipient's `language` | 4 |
| Sign-out toast "action REPLACE…" | ✅ **Real bug** | `pm/more.tsx:47` `router.replace('/')` — wrong route name | 1 |
| Timeline shows "Unclear message content" | ✅ **Real bug** | low-confidence/unknown events leak into the site timeline read | 1 |
| Long-press menu "absent" (Dispute / Make-a-to-do) | 🌫️ **Test artifact** | Menu EXISTS at `supervisor/chat.tsx:660` (CaptureCard long-press → full menu). AppleScript click can't hold 250 ms → registered as a tap (proof toggle) | — |
| Owner chat title shows "Site" | 🌫️ **Mostly artifact** | Tap nav passes the name (`chat.tsx:68`); the agent **deep-linked** without params → "Site". Real residue: a push/deep-link open has no name fallback | 1 (small hardening) |
| No double-tick ✓✓ | 🌫️ **Test artifact** | Only one device online → nobody to deliver to. Owner single ✓ works | (covered by 3 + re-test) |
| Camera "crashes" | 🌫️ **Test artifact** | iOS simulator has no camera | — |
| SegmentFetcher crash every launch | 🌫️ **Harness** | Expo Go 54 + RN 0.81 bridgeless quirk; gone in a dev build | 0 |
| Garbled `+91hello…` message in thread | 🌫️ **Harness hygiene** | Repeated failed keyboard automation | 0 |
| Empty Brief / zero Approvals / no CaptureCards / null location / null names / blank worker-days / DPR already "sent" | 📊 **Data gap** | The QA company has almost no seeded data | 0 (seed) |
| Satvik had no site assignment | 📊 **Data gap** | Missing `site_assignments` row | 0 (seed) |
| Foresight has no per-site risk radar | 🤔 **Product call** | Numeric summary exists; radar visual never built | 5 |
| Capture tab has no text input | 🤔 **Product call** | Photo+voice only by design? Or regression? | 5 |
| Supervisor can't self-create tasks (no "+") | 🤔 **Product call** | Receive-only inbox by design? | 5 |

**Bottom line:** ~6 real code bugs, 2 real access gaps, 1 big deferred migration, 1 language bug, ~6 data gaps, ~3 product decisions. The rest is harness noise.

---

## File Structure

**Phase 0 (harness + data)**
- Create: `constructo/backend/scripts/seed_qa_company.py` — idempotent rich seed for the QA company (Tripathi Auto Constructions / Tiwari Dream House)
- Modify: `constructo/docs/qa/session-*.md` — add the `idb` install + dev-build preamble (one shared note)

**Phase 1 (quick fixes)**
- Modify: `constructo/mobile/app/(contractor)/pm/more.tsx` — company name + sign-out route
- Modify: `constructo/mobile/app/(contractor)/owner/chat/[id].tsx` — title fallback hardening
- Modify: `constructo/backend/app/brief/generate.py` — thread recipient language into the brief
- Modify: `constructo/backend/app/sites/<timeline read>.py` — filter unknown/low-confidence events from the site timeline (exact file located in Task 1.4)
- Test: `constructo/backend/tests/brief/test_generate_language.py`, `constructo/backend/tests/sites/test_timeline_filter.py`

**Phase 2 (role access)**
- Create: `constructo/mobile/app/(contractor)/architect/_layout.tsx`, `.../architect/chat.tsx`, `.../architect/more.tsx`
- Modify: `constructo/mobile/app/(contractor)/_layout.tsx` — route `architect`
- Modify: `constructo/mobile/app/(contractor)/pm/_layout.tsx` — add a Chat tab
- Create: `constructo/mobile/app/(contractor)/pm/chat.tsx` — PM chat inbox (reuse owner inbox)

**Phase 3 (own plan — outlined here)**
- Modify: `constructo/mobile/app/(contractor)/supervisor/chat.tsx` → migrate to `src/chat` kit

---

## PHASE 0 — Make QA Trustworthy

> Outcome: every future QA run measures the product, not an empty DB or a broken harness.

### Task 0.1: Document the QA harness prerequisites

**Files:**
- Modify: `constructo/docs/qa/session-A-owner.md` (and B, C, D) — replace the "Confirm idb works" block with the working prereqs

- [ ] **Step 1: Add the prereq note to each session file**

Insert near the top of each `## SETUP` section:

```markdown
### Harness prerequisites (do once)
1. Install idb so taps/typing work:
   `brew install idb-companion && pipx install fb-idb` (or `pip install fb-idb`)
2. Use a DEV BUILD, not Expo Go (Expo Go 54 + RN 0.81 crashes on `SegmentFetcher`):
   `cd constructo/mobile && npx expo run:ios --device "<SIM_NAME>"`
   Expo Go is only acceptable for read-only screenshot checks.
3. Re-run the rich seed (Task 0.2) so AI features have data:
   `cd constructo/backend && uv run python -m scripts.seed_qa_company`
```

- [ ] **Step 2: Commit**

```bash
git add constructo/docs/qa/session-A-owner.md constructo/docs/qa/session-B-supervisor.md constructo/docs/qa/session-C-pm-architect.md constructo/docs/qa/session-D-crossrole-chat.md
git commit -m "docs(qa): add idb + dev-build + seed prerequisites to QA sessions"
```

### Task 0.2: Rich, idempotent seed for the QA company

**Files:**
- Create: `constructo/backend/scripts/seed_qa_company.py`
- Reference (read first, mirror its style): `constructo/backend/scripts/seed_demo.py`

**What it must produce** on the existing **Tripathi Auto Constructions** company / **Tiwari Dream House** site (look them up by name; do NOT create a second company):
- Set `site.location` (e.g. "Gomti Nagar, Lucknow") and a `SiteBaseline` (expected_daily_headcount).
- Fill any null `user.name` for the seeded team (owner/PM/architect/supervisor).
- A spread of `SiteEventModel` rows dated **today** and **yesterday**: attendance below baseline (fires labor-shortfall risk), a delivery, an invoice that mismatches the delivery (fires reconcile/approval), a progress update, an issue. All `confidence>=0.9`, `needs_clarification=False`.
- Two `Decision` rows: one `pending` (invoice approval, evidence-linked), one **overdue** (`sla_due_at` in the past) so the SLA sweep escalates.
- Two `Permit` rows: one approved & **near expiry** (≤15 days), one stale `under_review`.
- A **draft** (not sent) `Dpr` row for today so the PM ConfirmCard flow is testable.
- Ensure the supervisor (`+919066906818`) has a `SiteAssignment` to the site.
- Build the brief for today + yesterday (`build_brief`) and index events (`index_all_unindexed`).

- [ ] **Step 1: Read the reference seed**

Run: `sed -n '1,120p' constructo/backend/scripts/seed_demo.py`
Expected: see the `_upsert`, deterministic `uuid5` id, model imports pattern.

- [ ] **Step 2: Write the seed script targeting the existing company**

```python
"""Enrich the QA company (Tripathi Auto Constructions / Tiwari Dream House) with
the data the AI features need: baseline, today's events, decisions, permits,
a DRAFT dpr, names, supervisor assignment. Idempotent (uuid5 ids).

    cd constructo/backend && uv run python -m scripts.seed_qa_company
"""
from __future__ import annotations
import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select
from app.db import SessionLocal
from app.brief.generate import build_brief
from app.models import (
    Company, Decision, DecisionKind, DecisionState, Permit, PermitStatus,
    Site, SiteBaseline, SiteEventModel, User,
)
from app.sites.models import SiteAssignment
from app.search.index import index_all_unindexed

COMPANY_NAME = "Tripathi Auto Constructions"
SITE_NAME = "Tiwari Dream House"
NS = uuid5(NAMESPACE_URL, "constructo.seed.qa-company")
TODAY = datetime.now(UTC).date()
NOW = datetime.now(UTC)
YESTERDAY = TODAY - timedelta(days=1)


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


async def _upsert(session, model, ident, **fields):
    obj = await session.get(model, ident)
    if obj is None:
        obj = model(id=ident, **fields); session.add(obj)
    else:
        for k, v in fields.items():
            setattr(obj, k, v)
    return obj


async def seed() -> dict[str, int]:
    counts: dict[str, int] = {}
    async with SessionLocal() as s:
        company = (await s.execute(
            select(Company).where(Company.name == COMPANY_NAME)
        )).scalar_one_or_none()
        if company is None:
            raise SystemExit(f"Company {COMPANY_NAME!r} not found — wrong DB?")
        site = (await s.execute(
            select(Site).where(Site.company_id == company.id, Site.name == SITE_NAME)
        )).scalar_one_or_none()
        if site is None:
            raise SystemExit(f"Site {SITE_NAME!r} not found — wrong DB?")

        # location + baseline
        if not site.location:
            site.location = "Gomti Nagar, Lucknow"
        owner = (await s.execute(
            select(User).where(User.company_id == company.id, User.role == "owner")
        )).scalars().first()
        await _upsert(s, SiteBaseline, _id("baseline"), site_id=site.id,
                      expected_daily_headcount=20, notes="QA baseline",
                      updated_by=owner.id if owner else None)

        # names (fill any nulls)
        for u in (await s.execute(
            select(User).where(User.company_id == company.id)
        )).scalars().all():
            if not u.name:
                u.name = {"owner": "Owner", "pm": "Akhanda (PM)",
                          "architect": "Munna bhaiya (Architect)",
                          "supervisor": "Satvik (Supervisor)"}.get(u.role, u.role)

        # supervisor assignment
        sup = (await s.execute(
            select(User).where(User.company_id == company.id, User.role == "supervisor")
        )).scalars().first()
        if sup:
            exists = (await s.execute(select(SiteAssignment).where(
                SiteAssignment.site_id == site.id, SiteAssignment.user_id == sup.id
            ))).scalar_one_or_none()
            if exists is None:
                s.add(SiteAssignment(site_id=site.id, user_id=sup.id))

        # events (today + yesterday) — below-baseline attendance + invoice mismatch
        events = [
            ("att", "attendance", TODAY, "aaj sirf 12 mazdoor aaye",
             {"headcount": 12, "raw_phrase": "12 mazdoor"}),
            ("del", "material_delivery", YESTERDAY, "50 bori cement aaya ACC se",
             {"material": "cement", "quantity": 50, "unit": "bags", "vendor": "ACC Limited"}),
            ("inv", "invoice_received", TODAY, "ACC ka bill: 60 bags, Rs 36000",
             {"vendor": "ACC Limited", "material": "cement", "quantity": 60,
              "amount": 36000, "currency": "INR", "invoice_number": "ACC/2026/77"}),
            ("prog", "progress_update", TODAY, "pehli manzil ka slab 70%",
             {"percent": 70, "area": "first floor slab"}),
            ("iss", "issue", TODAY, "paani ki supply band, kaam ruka",
             {"category": "water", "blocking": True}),
        ]
        for key, et, on, summary, fields in events:
            await _upsert(s, SiteEventModel, _id("event", key), site_id=site.id,
                          event_type=et, occurred_on=on, summary=summary, fields=fields,
                          confidence=0.9, needs_clarification=False,
                          source_message_ids=[], version=1)
        counts["events"] = len(events)

        # decisions: one pending, one overdue
        await _upsert(s, Decision, _id("dec", "inv"), company_id=company.id, site_id=site.id,
                      kind=DecisionKind.approval, title="Approve ACC cement invoice (₹36,000)?",
                      detail="Invoice bills 60 bags but the site logged 50.",
                      raised_by=None, assigned_to=owner.id if owner else None,
                      state=DecisionState.pending, sla_due_at=NOW + timedelta(days=1),
                      evidence_event_ids=[_id("event", "inv"), _id("event", "del")])
        await _upsert(s, Decision, _id("dec", "over"), company_id=company.id, site_id=site.id,
                      kind=DecisionKind.approval, title="Confirm next week's slab schedule?",
                      detail="Owner to confirm.", raised_by=None,
                      assigned_to=owner.id if owner else None, state=DecisionState.pending,
                      sla_due_at=NOW - timedelta(days=1))
        counts["decisions"] = 2

        # permits: near-expiry + stale review
        await _upsert(s, Permit, _id("permit", "bp"), company_id=company.id, site_id=site.id,
                      permit_type="Building Plan Approval", authority="LDA",
                      status=PermitStatus.approved, applied_on=TODAY - timedelta(days=200),
                      decided_on=TODAY - timedelta(days=170), expiry_on=TODAY + timedelta(days=12),
                      reference_no="LDA/BP/2026/3391", notes="Renew",
                      created_by=owner.id if owner else None)
        await _upsert(s, Permit, _id("permit", "fire"), company_id=company.id, site_id=site.id,
                      permit_type="NOC-fire", authority="UP Fire Services",
                      status=PermitStatus.under_review, applied_on=TODAY - timedelta(days=40),
                      reference_no="UPFS/NOC/2026/118", created_by=owner.id if owner else None)
        counts["permits"] = 2

        await s.commit()
        for d in (YESTERDAY, TODAY):
            await build_brief(s, company.id, d, llm=None)
        await s.commit()
        counts["indexed"] = await index_all_unindexed(s)
        await s.commit()
    return counts


def main() -> None:
    counts = asyncio.run(seed())
    print("✅ Enriched QA company:")
    for k, v in counts.items():
        print(f"   - {k}: {v}")


if __name__ == "__main__":
    main()
```

> NOTE: A **draft DPR** row is intentionally omitted from the code above because the `Dpr` model field names must be confirmed first. Add it in Step 3.

- [ ] **Step 3: Confirm the Dpr model + add a draft DPR**

Run: `grep -n "class Dpr\|status\|summary\|sections\|site_id\|report_date" constructo/backend/app/**/dpr*.py constructo/backend/app/models*.py 2>/dev/null | head`
Then add a `_upsert(s, Dpr, _id("dpr"), site_id=site.id, ... status=<draft enum>, report_date=TODAY, ...)` block mirroring the real fields, before the final `s.commit()`. Match the exact enum/field names you find.

- [ ] **Step 4: Run the seed against the dev DB**

Run: `cd constructo/backend && DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run python -m scripts.seed_qa_company`
Expected: prints non-zero events/decisions/permits/indexed counts, no exception.

- [ ] **Step 5: Lint + commit**

```bash
cd constructo/backend && uv run ruff check scripts/seed_qa_company.py
git add constructo/backend/scripts/seed_qa_company.py
git commit -m "feat(qa): rich idempotent seed for the QA company (baseline/events/decisions/permits/draft DPR)"
```

---

## PHASE 1 — Quick Real-Bug Fixes (one PR: `fix/contractor-qa-phase-1`)

> Invoke the `constructo-contractor-design` (Neev) skill before editing any screen.

### Task 1.1: PM "Company" shows name, not UUID

**Files:**
- Modify: `constructo/mobile/app/(contractor)/pm/more.tsx:75-84`

- [ ] **Step 1: Render `company_name`, fall back to id only if missing**

Replace the company `SettingsRow` `title`:

```tsx
{me?.company_id ? (
  <SettingsRow
    icon="briefcase"
    title={me.company_name ?? me.company_id}
    subtitle={str.company}
    hideChevron
    last
    onPress={() => {}}
  />
) : null}
```

- [ ] **Step 2: Typecheck**

Run: `cd constructo/mobile && npx tsc --noEmit`
Expected: no new errors (`Me.company_name` already exists in `src/api/types.ts:41`).

### Task 1.2: Fix the sign-out navigation route

**Files:**
- Modify: `constructo/mobile/app/(contractor)/pm/more.tsx:45-48`

- [ ] **Step 1: Confirm the login route name**

Run: `ls constructo/mobile/app/\(auth\)/` — expect `login.tsx`.

- [ ] **Step 2: Replace the bare `'/'` with the explicit login route**

```tsx
async function onSignOut() {
  await signOut()
  router.replace('/(auth)/login')
}
```

- [ ] **Step 3: Typecheck**

Run: `cd constructo/mobile && npx tsc --noEmit`
Expected: clean.

> Also check whether `owner/more.tsx`, `supervisor` more, `accountant/more.tsx`, and `index.tsx` use `router.replace('/')` after sign-out; if so, apply the same fix (grep `router.replace('/')` under `app/(contractor)`).

### Task 1.3: Harden the owner chat detail title (push/deep-link safety) — DEFERRED (2026-06-12)

> **Status: DEFERRED to a backend follow-up.** Verified during execution: `site_name`/`title` live on `ConversationSummary` (`src/api/chat.ts:183-184`), NOT on `ChatMessage`. So the detail screen cannot resolve the name client-side from `messages`. The normal tap path already passes the name (`owner/chat.tsx:68`); only a param-less push/deep-link open shows "Site". Proper fix = backend includes the conversation title/site_name in the thread payload (or a lightweight `GET /chat/conversations/{id}` meta), then the detail falls back to it. Not shipping a half-fix. Original (now-invalid) approach below for reference.



**Files:**
- Modify: `constructo/mobile/app/(contractor)/owner/chat/[id].tsx:193-197`

**Why:** Normal tap nav passes a name (`owner/chat.tsx:68`). A push/deep-link open has no params → header shows "Site". Resolve the name from the loaded thread when the param is absent.

- [ ] **Step 1: Derive a title from the first message's site/conversation when the param is empty**

After `const messages = thread.messages` add:

```tsx
// A deep-link / push open may carry no `title` param. Fall back to the
// site name on a loaded message before the generic "Site" label.
const resolvedTitle =
  title ||
  messages.find((m) => m.site_name)?.site_name ||
  str.site
```

Then in the header replace `title || str.site` usages:

```tsx
<BodyStrong style={{ flex: 1 }} numberOfLines={1}>
  {isHomeowner ? `${str.homeowner} · ${resolvedTitle}` : resolvedTitle}
</BodyStrong>
```

- [ ] **Step 2: Confirm `site_name` exists on the message type (else fall back gracefully)**

Run: `grep -n "site_name" constructo/mobile/src/api/chat.ts`
If `ChatMessage` has no `site_name`, drop the `.find(...)` line and keep `title || str.site` (the param path already works for taps; document this as a backend follow-up to include conversation title in the thread payload).

- [ ] **Step 3: Typecheck**

Run: `cd constructo/mobile && npx tsc --noEmit`
Expected: clean.

### Task 1.4: Filter unknown / low-confidence events from the site timeline

**Files:**
- Locate + Modify: the site timeline read (Step 1)
- Test: `constructo/backend/tests/sites/test_timeline_filter.py`

**Why:** Session A saw "Unclear message content" / "Message received is unclear" in the site timeline. These are `unknown`-type or `needs_clarification` events that should not surface as activity.

- [ ] **Step 1: Locate the timeline read**

Run: `grep -rn "occurred_on\|order_by\|event_type\|timeline\|recent" constructo/backend/app/sites/router.py | head`
Identify the endpoint that returns the per-site activity feed.

- [ ] **Step 2: Write the failing test**

```python
# tests/sites/test_timeline_filter.py
import pytest

@pytest.mark.asyncio
async def test_timeline_excludes_unknown_and_unclear(client, seeded_site):
    # seeded_site has one good progress event and one unknown/needs_clarification event
    resp = await client.get(f"/api/v1/sites/{seeded_site.id}/timeline")
    assert resp.status_code == 200
    summaries = [e["summary"] for e in resp.json()["items"]]
    assert not any("unclear" in s.lower() for s in summaries)
    assert not any(e["event_type"] == "unknown" for e in resp.json()["items"])
```

Adjust the route path + fixture names to what Step 1 found.

- [ ] **Step 3: Run it — expect FAIL**

Run: `cd constructo/backend && DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/sites/test_timeline_filter.py -v`
Expected: FAIL (unclear events present).

- [ ] **Step 4: Add the filter to the query**

In the timeline query add `.where(SiteEventModel.event_type != "unknown", SiteEventModel.needs_clarification.is_(False))` (match the model + existing query style).

- [ ] **Step 5: Run it — expect PASS**

Run: same as Step 3. Expected: PASS.

- [ ] **Step 6: Commit Phase 1**

```bash
cd constructo/backend && uv run ruff check . && DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/sites/test_timeline_filter.py
cd ../mobile && npx tsc --noEmit
git add constructo/mobile/app/\(contractor\)/pm/more.tsx constructo/mobile/app/\(contractor\)/owner/chat/\[id\].tsx constructo/backend/app/sites/ constructo/backend/tests/sites/test_timeline_filter.py
git commit -m "fix(contractor): PM company name, sign-out route, chat title fallback, timeline noise filter"
```

---

## PHASE 2 — Role Access Gaps (one PR: `fix/contractor-role-access`)

> Invoke the `constructo-contractor-design` (Neev) skill first.

### Task 2.1: Give the architect a real mobile app (Chat + More)

**Files:**
- Create: `constructo/mobile/app/(contractor)/architect/_layout.tsx`
- Create: `constructo/mobile/app/(contractor)/architect/chat.tsx`
- Create: `constructo/mobile/app/(contractor)/architect/more.tsx`
- Modify: `constructo/mobile/app/(contractor)/_layout.tsx`

- [ ] **Step 1: Route the architect role**

In `(contractor)/_layout.tsx`, after the homeowner redirect, add:

```tsx
if (role === 'architect')
  return (
    <ThemeProvider initial="neev">
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  )
```

> Expo Router resolves `architect/_layout.tsx` for the `architect/` group; the role redirect just makes the architect land there. Confirm whether a `<Redirect href="/(contractor)/architect/chat" />` is needed for the initial route during local testing.

- [ ] **Step 2: Create the architect tab layout (Chat · More)**

Mirror `pm/_layout.tsx`, with two tabs:

```tsx
import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { useT } from '../../../src/i18n/I18nProvider'
import { FACES } from '../../../src/theme/fonts'
import { useTheme } from '../../../src/theme/ThemeProvider'

const STR = { en: { chat: 'Chat', more: 'More' }, hi: { chat: 'चैट', more: 'और' } } as const
const tabIcon = (name: keyof typeof Ionicons.glyphMap) =>
  ({ color }: { color: string; size: number }) => <Ionicons name={name} size={22} color={color} />

export default function ArchitectLayout() {
  const { lang } = useT(); const { theme } = useTheme(); const str = STR[lang]
  return (
    <Tabs initialRouteName="chat" screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: theme.colors.accent,
      tabBarInactiveTintColor: theme.colors.textMute,
      tabBarStyle: { backgroundColor: theme.colors.card, borderTopColor: theme.colors.line, height: 64, paddingBottom: 8, paddingTop: 6 },
      tabBarLabelStyle: { fontFamily: FACES[theme.name].bodyStrong, fontSize: 12 },
    }}>
      <Tabs.Screen name="chat" options={{ title: str.chat, tabBarIcon: tabIcon('chatbubble-ellipses-outline') }} />
      <Tabs.Screen name="more" options={{ title: str.more, tabBarIcon: tabIcon('ellipsis-horizontal-outline') }} />
    </Tabs>
  )
}
```

- [ ] **Step 3: Create `architect/chat.tsx` as a thin re-export of the owner inbox**

The owner inbox (`owner/chat.tsx`) already lists every conversation the user can access (`chatApi.conversations()`), gates "New group" on `role === 'owner'`, and routes to `owner/chat/[id]`. Reuse it:

```tsx
/** Architect chat — reuses the owner inbox (conversations are access-scoped
 * server-side; the New-group button self-gates to owner only). */
export { default } from '../owner/chat'
```

- [ ] **Step 4: Create `architect/more.tsx` (identity + sign-out)**

Copy `pm/more.tsx` verbatim, rename the component to `ArchitectMore`, keep `me.company_name ?? me.company_id` and `router.replace('/(auth)/login')`. (The `ROLE_LABEL` map already has no `architect` entry → it falls back to `me.role`; add `architect: { en: 'Architect', hi: 'आर्किटेक्ट' }`.)

- [ ] **Step 5: Typecheck**

Run: `cd constructo/mobile && npx tsc --noEmit`
Expected: clean.

> **Note for executor:** `architect/chat/[id]` detail. The owner inbox routes to `/(contractor)/owner/chat/[id]`. That screen works for any role (it reads `useAuth().me`). The architect reusing the owner inbox will deep-link into the owner detail route — acceptable (it's role-agnostic). If route-group purity is wanted later, add `architect/chat/[id].tsx` re-exporting the owner detail.

### Task 2.2: Give the PM a Chat tab

**Files:**
- Modify: `constructo/mobile/app/(contractor)/pm/_layout.tsx`
- Create: `constructo/mobile/app/(contractor)/pm/chat.tsx`

- [ ] **Step 1: Create `pm/chat.tsx` re-exporting the owner inbox**

```tsx
/** PM chat — reuses the owner inbox (access-scoped server-side). */
export { default } from '../owner/chat'
```

- [ ] **Step 2: Add the Chat tab between DPR and More**

In `pm/_layout.tsx`, add a label to `STR`-equivalent (PM uses `t('pm.tabDpr')`; add an i18n key or inline). Insert:

```tsx
<Tabs.Screen
  name="chat"
  options={{ title: t('pm.tabChat'), tabBarIcon: tabIcon('chatbubble-ellipses-outline') }}
/>
```

- [ ] **Step 3: Add the `pm.tabChat` i18n key**

Run: `grep -n "tabDpr" constructo/mobile/src/i18n/en.ts constructo/mobile/src/i18n/hi.ts`
Add `tabChat: 'Chat'` (en) and `tabChat: 'चैट'` (hi) next to `tabDpr` in the `pm` block.

- [ ] **Step 4: Typecheck + commit Phase 2**

```bash
cd constructo/mobile && npx tsc --noEmit && npx jest
git add constructo/mobile/app/\(contractor\)/architect constructo/mobile/app/\(contractor\)/pm constructo/mobile/app/\(contractor\)/_layout.tsx constructo/mobile/src/i18n/en.ts constructo/mobile/src/i18n/hi.ts
git commit -m "feat(contractor): architect mobile app (Chat+More) + PM Chat tab"
```

---

## PHASE 3 — Supervisor Flagship → Chat Kit Migration (OWN PLAN)

> This is the largest, riskiest piece and the deferred migration from the chat-build notes. It gets its own plan file: `docs/superpowers/plans/2026-06-13-supervisor-chat-kit-migration.md`. Outline only here.

**Goal:** Migrate `supervisor/chat.tsx` from its bespoke poll/optimistic implementation onto the `src/chat` kit (`useChatThread` + `MessageView`), gaining **delivery ticks**, **tap-to-retry**, **real Nivaan proposals** (`@nivaan` → `NivaanProposalCard`), and **system notices**, while **preserving** the supervisor-only features the owner screen lacks: dispute/resolve, recap, radar, pinned brief, camera, voice, slash-commands, smart-suggest.

**Why it's risky:** `supervisor/chat.tsx` is 1100+ lines with state the kit doesn't model (radar/recap/dispute sheets, slash parsing, smart-suggest, HoldToTalk). The migration must be behavior-preserving and verified on-device (the kit's durable outbox + live socket replace the custom `pending`/`refetch`).

**Task outline (full TDD detail in the dedicated plan):**
1. Extract the supervisor-only sheets (radar/recap/dispute/brief) into standalone components that take props (decouple from the local message state).
2. Swap message state to `useChatThread({ siteId }, { myUserId })`; render via `MessageView` (`CaptureCard`, `MessageBubble` with `deliveryState`, `SystemNotice`, `NivaanProposalCard`).
3. Re-wire `@nivaan` to the proposal path (`thread.sendProposal`) and keep `@ask` as the grounded one-liner; keep slash-commands + smart-suggest feeding `thread.send` with a capture.
4. Re-wire camera/voice onto `thread.sendMedia`.
5. Keep the long-press CaptureCard menu (Reply/Dispute/To-do/Vendor-confirm) on top of the kit.
6. Jest for the pure helpers; on-device verify (ticks ✓/✓✓, tap-to-retry, `@nivaan` proposal Confirm books exactly one capture, dispute blocks approval).

**Gate:** own branch `feat/supervisor-chat-kit`, founder device-verify before merge.

---

## PHASE 4 — AI Output Language Correctness

**Goal:** The brief, Nivaan, and DPR answer in the recipient's `user.language`, not always Hindi.

**Findings:** `_fallback_text` (`brief/generate.py:249`) is English, but the **LLM** path generates Hindi because the recipient's language is never passed into the brief prompt. Nivaan/ask "mirror the user's language" (`agent/loop.py:61`) — acceptable but drifts for `en` owners.

**Task outline (own small PR `fix/ai-output-language`):**
1. Thread `language` into `build_brief` (resolve the owner's `user.language`; default `en`) and into the brief system prompt ("Write in {language}.").
2. Test: `tests/brief/test_generate_language.py` — an `en` company owner gets an English brief; `hi` gets Hindi.
3. For Nivaan/ask, pass the caller's `user.language` explicitly into the prompt instead of relying on query-mirroring; test abstain + answer language.
4. Gate: ruff + pytest.

---

## PHASE 5 — Founder Product Decisions (gated)

Build only after the founder decides each:

| Decision | Options | Default recommendation |
|---|---|---|
| **Foresight per-site risk radar** | (a) build the visual radar card; (b) keep numeric summary; (c) reuse the chat Radar/sentinel signals as a card | (c) — reuse `chatApi.sentinel` signals as a per-site card; cheapest, consistent |
| **Capture tab text input** | (a) restore a free-text quick-capture; (b) keep photo+voice only | (a) — a text shortcut is the fastest capture for literate supervisors; verify it wasn't an intentional removal |
| **Supervisor task self-create** | (a) add "+" on Tasks/Asks; (b) keep receive-only | (a) — supervisors do generate their own follow-ups; long-press "Make a to-do" already exists, so a "+" is consistent |
| **Architect depth** | Phase-2 Chat+More now; later RFI/drawings inbox | ship Phase 2 now, revisit after pilot pull |

---

## Self-Review

- **Spec coverage:** Every ✅ real-bug and real-gap row in the Reframe table maps to a task (1.1 PM company, 1.2 sign-out, 1.3 chat title, 1.4 timeline, 2.1 architect, 2.2 PM chat, 3 supervisor ticks+Nivaan, 4 language). 📊 data gaps → Task 0.2. 🤔 product calls → Phase 5. 🌫️ noise → explicitly NOT tasked.
- **Placeholders:** Task 0.2 Step 3 (Dpr model) and Task 1.4 Step 1 (timeline route) require a `grep` to confirm exact names before writing — these are explicit verification steps, not hidden TODOs; the code around them is complete.
- **Type consistency:** `me.company_name` (types.ts:41) used in 1.1, 2.1, 2.2. `router.replace('/(auth)/login')` consistent in 1.2 + 2.1. `useChatThread` address shape `{ siteId }` matches `owner/chat/[id].tsx` usage.

---

## Execution Handoff

Recommended order: **Phase 0 → 1 → 2** as three PRs (cheap, high-confidence, unblock real QA), then re-run the four QA sessions against the seeded data, then **Phase 3** (own plan) and **Phase 4**. Phase 5 waits on founder decisions.
