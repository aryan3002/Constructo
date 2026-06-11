# Contractor Setup & Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a real owner onboard a full contractor team — including the central **Architect** — entirely in-product, so the CivilArch pilot can run without hand-seeded SQL (today the architect login + site assignment were created by hand).

**Architecture:** Two shippable parts. **Part A** makes the `architect` role first-class end-to-end (backend site-visibility + landing; web invite/assign dropdowns + nav) — this replaces the SQL hacks used to unblock the spec-desk today. **Part B** adds a "invite your team" step to the owner first-run so a new company lands at a useful state (company → site → team). Build/ship Part A, then Part B.

**Tech Stack:** Backend = FastAPI + async SQLAlchemy + Postgres (pytest-asyncio, ruff line-100); Web = React 18 + Vite + TS (vitest, `npm run build` = tsc -b + vite). Dev DB = `postgresql+asyncpg://constructo:constructo@localhost:5433/constructo`.

**Verification baselines:** backend `uv run ruff check` (whole tree, from `constructo/backend`) + `uv run pytest`; web `npm run build && npm run budget && npm test` (from `constructo/web`). Web browser-verify (mock or local-backend) the architect onboarding path before each PR.

---

## PART A — Architect is a first-class role (PR 1)

### Task 1: Architect sees all company sites (backend)

The contractor Architect is a company-wide design authority (owns the spec across the whole project), like owner/PM — not a per-site assignee. Today they only see *assigned* sites, which is why the spec-desk showed "No sites yet" until a `SiteAssignment` was hand-inserted.

**Files:**
- Modify: `constructo/backend/app/sites/router.py:52` (`_ALL_SITES_ROLES`)
- Test: the existing sites test module — find it with `ls constructo/backend/tests | grep -i site`; co-locate the new test there.

- [ ] **Step 1: Write the failing test** — an architect with NO `SiteAssignment` rows still sees every site in their company. Seed: a company + 2 sites + an `architect` user in that company (no assignments). Mirror the auth/seed helpers already used in the sites test module (bearer via `create_access_token(str(user.id), user.role.value)`).

```python
async def test_architect_sees_all_company_sites_without_assignment(client, factory, db_session):
    company = await factory.company()
    s1 = await factory.site(company_id=company.id, name="Site A")
    s2 = await factory.site(company_id=company.id, name="Site B")
    architect = await factory.user(company_id=company.id, role=UserRole.architect)
    token = create_access_token(str(architect.id), architect.role.value)
    resp = await client.get("/api/v1/sites", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    names = {s["name"] for s in resp.json()["items"]}
    assert names == {"Site A", "Site B"}
```
(Adapt factory/fixture names to the existing module — read a sibling test first.)

- [ ] **Step 2: Run it, confirm it FAILS** (architect currently sees `[]`).
Run: `cd constructo/backend && DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest <sites_test_file> -k architect_sees_all -v`
Expected: FAIL (empty items / KeyError).

- [ ] **Step 3: Add architect to the all-sites set**

```python
# constructo/backend/app/sites/router.py
_ALL_SITES_ROLES = {UserRole.owner, UserRole.pm, UserRole.architect}
```
Update the docstring of `effective_visible_site_ids` to read: `"owner/pm/architect -> all company sites; others -> assigned sites only."`

- [ ] **Step 4: Run it, confirm it PASSES.**

- [ ] **Step 5: Commit**
```bash
git add constructo/backend/app/sites/router.py constructo/backend/tests/<sites_test_file>
git commit -m "feat(sites): architects see all company sites (like owner/pm)"
```

### Task 2: Architect lands on the spec-desk (backend)

**Files:**
- Modify: `constructo/backend/app/auth/landing.py:22` (`ROLE_LANDING[UserRole.architect]`)
- Test: the existing landing test — find with `grep -rln "ROLE_LANDING\|landing_for" constructo/backend/tests`.

- [ ] **Step 1: Write the failing test**
```python
def test_architect_lands_on_spec_desk():
    assert landing_for(UserRole.architect) == "spec_desk"
```
- [ ] **Step 2: Run it, confirm it FAILS** (currently returns `"brief"`).
- [ ] **Step 3: Change the mapping**
```python
# constructo/backend/app/auth/landing.py
UserRole.architect: "spec_desk",   # was "brief"
```
- [ ] **Step 4: Run it, confirm it PASSES.**
- [ ] **Step 5: Commit**
```bash
git add constructo/backend/app/auth/landing.py constructo/backend/tests/<landing_test_file>
git commit -m "feat(auth): architect role-landing -> spec_desk"
```

### Task 3: Web maps the spec_desk landing key + commits the nav tab

The web `RoleLanding` maps backend landing keys → routes (with a per-role fallback). Make `spec_desk` explicit so it doesn't rely on the fallback. The Spec-desk nav tab was already added to owner/pm/architect in `AppShell.tsx` (uncommitted on this branch) — it lands in this commit.

**Files:**
- Modify: `constructo/web/src/pages/auth/RoleLanding.tsx` — the `LANDING_ROUTE` map (read the file; add the `spec_desk` key).
- Already-modified (commit as-is): `constructo/web/src/ui/AppShell.tsx` (Spec-desk tab in owner + pm `ROLE_TABS`).

- [ ] **Step 1: Add the landing-key route.** In `RoleLanding.tsx`'s `LANDING_ROUTE` object add:
```ts
spec_desk: '/spec-desk',
```
(Match the existing key style — e.g. alongside `brief`, `reconcile`, `attendance`, `orders`.)

- [ ] **Step 2: Typecheck** — `cd constructo/web && npx tsc -b` (or `npm run build`). Expected: clean. If `LANDING_ROUTE` is typed `Record<string,string>` this is fine; if it's a stricter union, add the key to the type too.

- [ ] **Step 3: Commit** (includes the already-staged AppShell nav tab)
```bash
git add constructo/web/src/pages/auth/RoleLanding.tsx constructo/web/src/ui/AppShell.tsx
git commit -m "feat(web): route spec_desk landing + Spec desk nav tab for owner/pm/architect"
```

### Task 4: Owner can invite + assign the Architect (web)

Backend `POST /invites` already accepts any role (incl. `architect`); the UI just never offers it. Add it to both role pickers.

**Files:**
- Modify: `constructo/web/src/pages/auth/InviteTeam.tsx:16` (`INVITABLE_ROLES`)
- Modify: `constructo/web/src/features/admin/TeamRoles.tsx:23` (`ASSIGNABLE_ROLES`)

- [ ] **Step 1: Add `'architect'` to `INVITABLE_ROLES`** (place it after `'pm'`, matching the role hierarchy):
```ts
const INVITABLE_ROLES: Role[] = ['pm', 'architect', 'supervisor', 'labor_contractor', 'accountant', 'procurement']
```
- [ ] **Step 2: Add `'architect'` to `ASSIGNABLE_ROLES`** in `TeamRoles.tsx` (after `'pm'`). (The `architect` i18n label `invite.role.architect` already exists in both en + hi.)
- [ ] **Step 3: Build + test** — `cd constructo/web && npm run build && npm test`. Expected: clean; 205+ vitest pass. If a test enumerates invitable roles, update it to include architect.
- [ ] **Step 4: Commit**
```bash
git add constructo/web/src/pages/auth/InviteTeam.tsx constructo/web/src/features/admin/TeamRoles.tsx
git commit -m "feat(web): offer the Architect role in invite + team-role pickers"
```

### Task 5: Verify Part A end-to-end, then open PR 1

- [ ] **Step 1: Backend CI checks** — `cd constructo/backend && uv run ruff check && DATABASE_URL=...:5433/constructo uv run pytest -q`. Expected: all green.
- [ ] **Step 2: Web CI checks** — `cd constructo/web && npm run build && npm run budget && npm test`. Expected: all green.
- [ ] **Step 3: Browser-verify the architect path** against the LOCAL backend (already pointed at :5433): as the seeded architect (`+919800000010` / OTP `000000`), confirm the **Spec desk** tab is in the nav and the desk loads the real Tripathi schedule. (The architect now sees the site via Task 1, not the hand-inserted assignment.) Screenshot.
- [ ] **Step 4: Push + open PR 1** titled "feat(onboarding): make the Architect a first-class role end-to-end". Body: the 4 changes + "replaces the hand-seeded architect visibility used to unblock the spec-desk." Watch CI green, then merge.

---

## PART B — First-run invites the team (PR 2)

### Task 6: Add a "Team" step to the owner first-run

Today `OwnerFirstRun` is `company → site → whatsapp(skip)` and never invites anyone, so a fresh company reaches the dashboard with no team. Add a skippable **team** step that lets the owner invite the core roles (incl. architect) right after the site, reusing the existing invite UI.

**Files:**
- Modify: `constructo/web/src/pages/auth/OwnerFirstRun.tsx` (the `STEPS` constant + the step renderer)
- Reuse: `constructo/web/src/pages/auth/InviteTeam.tsx` (the existing invite component) — read it to see its props/shape; render it inside the first-run card, or lift its core invite form.

- [ ] **Step 1: Add `'team'` to the `STEPS` sequence** — insert after `'site'` (so order is `company → site → team → whatsapp`). Add its title/subtitle i18n keys (en + hi): `firstrun.team.title` = "Invite your team", `firstrun.team.subtitle` = "Add your architect, site engineer, PM and accountant — they each get a join link." (Mirror the existing `firstrun.*` keys; add to both `en.ts` and `hi.ts`.)

- [ ] **Step 2: Render the team step** — in the step renderer, when `step === 'team'`, render the invite UI (the `InviteTeam` component or its form) plus two controls: **"Continue"** (advance to `whatsapp`) and **"Skip for now"** (advance without inviting). Inviting is optional — never block reaching the dashboard. Keep Blueprint tokens + ≥48px tap targets, consistent with the other steps.

- [ ] **Step 3: Typecheck + build** — `cd constructo/web && npm run build`. Expected: clean (new i18n keys present in both bundles, or `tsc` fails on the `Record<TranslationKey,...>` in hi.ts).

- [ ] **Step 4: Browser-verify** — run the first-run as a fresh owner (mock mode is fine): confirm the new **Team** step appears after Site, an architect can be invited, and both **Continue** and **Skip** reach the dashboard. Screenshot.

- [ ] **Step 5: Commit + PR 2**
```bash
git add constructo/web/src/pages/auth/OwnerFirstRun.tsx constructo/web/src/pages/auth/InviteTeam.tsx constructo/web/src/i18n/en.ts constructo/web/src/i18n/hi.ts
git commit -m "feat(onboarding): owner first-run invites the team (incl. architect)"
```
Open PR 2 "feat(onboarding): first-run team-invite step". Watch CI green, merge.

---

## Out of scope (explicitly deferred)
- **Admin console "stubs"** (integrations / audit / security) — they are honest "coming soon" placeholders, not fake metrics; leave them. The admin console is already the real company-setup control plane.
- **Phase 0 security** (rotate creds, purge prod PII, close the OTP `000000` hole) — mandatory before the pilot goes live, tracked separately.
- **Homeowner room-slice (#4)** and **chat reliability** — separate milestones.

## Self-review notes
- Coverage: site-visibility (T1), landing (T2+T3), invite/assign architect (T4), first-run team step (T6) — covers "owner onboards a full team incl. architect, everyone lands right, no SQL."
- Type consistency: `spec_desk` is the single landing key used by backend (T2) and web (T3). Architect's web routes (`/spec-desk`) + i18n labels + coachmark already exist (from PR #166).
- The Task 1 + Task 4 changes are the proper, tested replacements for today's hand-seeded architect user + site assignment.
