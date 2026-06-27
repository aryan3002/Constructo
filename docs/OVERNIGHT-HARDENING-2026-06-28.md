# Overnight hardening — what I found & fixed (2026-06-28)

You asked me to make the product demo-bulletproof while you slept. I ran a read-only
audit across 7 surfaces (homeowner, contractor/architect, auth/security, backend
engines, web, the new Design Profiler, and the failing tests), adversarially verified
every finding, then fixed the high-value + low-risk ones on branch
**`fix/overnight-hardening`** (PR linked at the end). **Nothing was merged or deployed.**

**Audit result:** 22 findings examined → **21 confirmed real**. I fixed **13** of them
(every Critical/High that was safe to fix unsupervised, plus the cheap wins). The other
**8 I deliberately left for you** — they're either behavioral changes to your auth/
authority model, feature work, or low-severity items where your call matters. My
recommendation is on each below.

---

## ✅ Fixed in this PR (13)

| # | Sev | Area | What was wrong → fix | Test |
|---|-----|------|----------------------|------|
| 1 | **CRIT** | auth | Auth was **fail-OPEN by default** with no code guard — a deploy with an empty allowlist + dev OTP (or the public dev `JWT_SECRET`) is world-open. Added `APP_ENV=prod` boot guard that **refuses to start** in an insecure posture. Dev/CI/tests untouched. | ✔ |
| 2 | HIGH | auth | `/join` bound a code to **whoever redeemed it** — a forwarded invite link = membership hijack. Now must match the invited phone; can't re-point a claimed membership. | ✔ |
| 3 | HIGH | design | Homeowner brief **"Approve" CTA always 409'd** (approve only valid once contractor-ready, unreachable from the apps). Now gated on real brief state; 409 → calm copy; real version/state in header. | ✔ |
| 4 | HIGH | contractor | **Offline outbox wedged forever** on the first non-retryable error — one bad capture silently blocked ALL later supervisor captures. Now drops permanently-rejected items and keeps draining. | ✔ |
| 5 | MED | homeowner | Empty chat rendered **"No messages yet" upside-down** (the literal first screen a new homeowner sees). Fixed the inverted-list flip. | ✔ |
| 6 | MED | backend | `/payments/settlement` **500'd on a non-numeric invoice amount** ("72,000") — one bad row killed the whole company's Advance Guard. Safe coercion. | ✔ |
| 7 | MED | contractor | Audit submit could create **duplicate owner-visible findings** on retry/double-tap. `add_finding` now idempotent on (title, location). | ✔ |
| 8 | MED | design | Homeowner **negative ranking tags were silently dropped** ("Too dark" ≠ `too_dark`) — they never affected the taste model. Normalized. | ✔ |
| 9 | MED | sentinel | Nightly sweep used UTC while the rest uses local date → mis-evaluated "today's attendance" + 3 flaky tests. Aligned the clock. | ✔ |
| 10 | LOW | homeowner | **Escalated decisions were a dead-end** (shown under "Needs your input" but no action buttons). Now actionable. | ✔ |
| 11 | LOW | homeowner | Failed photo-comment posts **silently did nothing**. Now shows an error. | ✔ |
| 12 | LOW | design | Room-specific **preset packs never matched** underscore area keys. Tolerant matching + aligned seed keys. | ✔ |
| 13 | — | docs | `DEPLOY.md` Phase-0 updated with `APP_ENV=prod` + `JWT_SECRET` as required. | — |

**Net test movement:** backend **1367 pass** (only the 7 pre-existing WeasyPrint *environment* failures remain — not product bugs); mobile `tsc` clean + **269 tests** pass; **zero regressions**.

---

## 🟡 Left for you to decide (8) — with my recommendation

These are real, but each is a judgment call about your product/auth model, a feature,
or low enough that I didn't want to change behavior unsupervised.

1. **HIGH · auth · cross-tenant leak in the DEFAULT config.** A fresh login auto-provisions an **owner into a shared "Default Company"**, so two unrelated logins become co-owners who can read each other's sites/users. *Live prod is bounded* (your allowlist + named pilot company), but dev/demo with an open allowlist leaks freely. **Recommend:** on first login, create a *fresh company per phone* (or gate unknown phones behind an invite). It's a behavioral change to onboarding — your call. Pairs with fix #1.
2. **MED · authority · no role check on approvals.** Any company member assigned to a site can `approve`/`reject`/`assign`/`batch-resolve` **owner-authority decisions** (incl. homeowner-question items) via the API. **Recommend:** reserve resolving owner-authority kinds to `owner`/`pm` (the supervisor "confirm done" `/respond` verb stays). Left it because it changes who-can-do-what and could touch real flows — worth a deliberate decision.
3. **MED · web · expired JWT traps the user.** No global 401 handler; an expired token leaves the user stuck on error screens with no bounce to `/login`. **Recommend:** a one-line-ish 401 interceptor (clearToken + redirect) in the shared web request helper. Web-only; I focused on backend+mobile tonight.
4. **MED · design · golden-path dead-ends.** There's **no UI for architect sign-off or contractor materialize**, so the homeowner→architect→contractor brief story can't complete live. **Recommend:** add an architect "sign off" button (+ wire the web materialize), or pre-seed a late brief state for the demo. (I fixed the cosmetic header so it no longer lies about state.)
5. **LOW · backend · attendance_erosion uses a UUID lexicographic tiebreak** to pick the latest same-day attendance — a coin flip that can fabricate/suppress a "crew shrinking" finding. **Recommend:** thread `created_at` into the engine's EventRow and tiebreak on it.
6. **LOW · backend · concurrent DPR draft → duplicate rows → later 500.** No unique constraint on (site_id, report_date). **Recommend:** add the constraint + IntegrityError-replay (needs a migration).
7. **LOW · design · local uploaded images show as grey boxes** with `STORAGE_BACKEND=local` (filesystem path isn't device-reachable). Prod (S3/R2) is fine. **Recommend (zero-code):** run local demos with `STORAGE_BACKEND=s3`; or add a `/media` route for full local parity.
8. **ENV · the 7 failing `reports_pdf` tests are NOT a bug** — WeasyPrint's native libs aren't installed on this Mac. CI/Linux/prod install them. `brew install pango gdk-pixbuf libffi` to go green locally.

---

## How to review

Branch `fix/overnight-hardening` — **6 focused commits**, each independently
verifiable (security / backend-robustness / sentinel / mobile). Read top-to-bottom or
cherry-pick. I'd merge the whole thing — every change is test-backed with zero
regressions — but it's yours to approve. The **8 deferred items** want a few minutes of
your judgment before I (or you) tackle them; tell me which to pick up.
