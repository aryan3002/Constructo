# Labs Quarantine — Real Features Hidden for the Pilot

> Last updated: 2026-06-11

These are **real, tested backend features** that are not needed by the CivilArch
interior fit-out pilot. They are not deleted — they are hidden behind the
`enable_labs` flag so the pilot deploy stays lean and focused. When the product
expands beyond the fit-out pilot, flip the flag on and they become live immediately.

---

## Gated features

### Dispute-Pack — Tamper-Evident Settlement Case File (Phase 3.6)

Routes: `GET /api/v1/dispute-pack` · `POST /api/v1/dispute-pack/ask`

Assembles a hash-chained, tamper-evident case file for a specific counterparty
(supplier or sub-contractor): all contractor-to-supplier payments vs that
party's invoices, netted by `compute_settlement` into an advance-adjustment
verdict. The `/ask` endpoint answers deterministic money questions grounded
strictly in the pack's records (it abstains rather than hallucinate). The chain
is computed on read; each record carries its SHA-256 link so the sequence cannot
be silently altered. RBAC-scoped to the contractor's visible sites; homeowners
are blocked at the route level. This is a general-contractor compliance surface
the interior fit-out pilot does not exercise — quarantined, not removed.

### Vendor Confirm-Loop — Two-Party-Verified GRN (Phase 3.8)

Routes: `POST /api/v1/vendor-confirm` · `GET /api/v1/vendor-confirm` ·
`GET /api/v1/vendor-confirm/{token}` · `POST /api/v1/vendor-confirm/{token}/respond`

A no-install, token-as-capability GRN confirmation loop. The contractor crew
creates a confirmation link for a delivery; the vendor opens the public URL (no
account needed) and confirms or disputes the quantity claim. A vendor-confirmed
record becomes a two-party-verified GRN. The public view exposes **only the
quantity claim** — no prices, rates, or any other site data (money-firewalled by
design). Crew-side routes require authentication and site membership; the public
`GET/POST /{token}` routes are unauthenticated but token-gated. This is also a
general-contractor supply-chain surface not exercised by the interior fit-out
pilot — quarantined, not removed.

---

## How the flag works

| Setting | Behaviour |
|---------|-----------|
| `ENABLE_LABS=true` (default) | Both routers registered — dev / CI / staging as normal |
| `ENABLE_LABS=false` | Both routers **not** registered — routes return 404, no data access |

In `constructo/backend/app/config.py`:

```python
enable_labs: bool = True  # Labs/post-pilot routes (dispute-pack, vendor-confirm). Set ENABLE_LABS=false in the pilot deploy to hide them.
```

In `constructo/backend/app/main.py`:

```python
if settings.enable_labs:
    app.include_router(dispute_pack_router)  # Phase 3.6 tamper-evident dispute pack
    app.include_router(vendor_confirm_router)  # Phase 3.8 vendor confirm-loop
```

To quarantine in the pilot deploy, add `ENABLE_LABS=false` to the container
environment (Azure Container App secret/env var). Nothing else needs to change.

To re-enable, remove that env var (the default is `True`) or set
`ENABLE_LABS=true`.

---

## Web route note

`constructo/web/src/App.tsx` contains a public route `/vendor-confirm/:token`
that renders the vendor's claim view in the browser. When `ENABLE_LABS=false`,
the backend endpoints return 404, so that web route is harmless: no confirm
links are ever created by the crew (the creation endpoint is also gated), so the
URL is never visited in practice. The frontend route itself does not need to be
removed or hidden.
