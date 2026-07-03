"""cleanup_request_nudge_decisions: resolves legacy [homeowner-request-nudge]
shadow Decisions, never touches [homeowner-quiet-nudge]."""
from app.homeowner.nudge import NUDGE_TAG
from app.homeowner.quiet import QUIET_NUDGE_TAG
from app.models import Decision, DecisionKind, DecisionState
from scripts.cleanup_request_nudge_decisions import run


async def test_cleanup_resolves_request_nudges_only(factory, db_session):
    company = await factory.company()
    site = await factory.site(company)

    factory_fn = lambda: _FixedSession(db_session)  # noqa: E731

    stale = Decision(
        company_id=company.id, site_id=site.id, kind=DecisionKind.generic,
        title=f"{NUDGE_TAG}[req-1] Overdue ask", detail="x", state=DecisionState.pending,
    )
    quiet = Decision(
        company_id=company.id, site_id=site.id, kind=DecisionKind.generic,
        title=f"{QUIET_NUDGE_TAG}[site-1] Quiet site — add a reason",
        detail="x", state=DecisionState.pending,
    )
    real = Decision(
        company_id=company.id, site_id=site.id, kind=DecisionKind.approval,
        title="Approve the invoice?", detail="x", state=DecisionState.pending,
    )
    db_session.add_all([stale, quiet, real])
    await db_session.flush()

    # Dry-run reports the count, writes nothing.
    dry = await run(session_factory=factory_fn, apply=False)
    assert dry == {"would_resolve": 1}
    await db_session.refresh(stale)
    assert stale.state == DecisionState.pending

    # --apply resolves exactly the request-nudge; leaves quiet + real untouched.
    applied = await run(session_factory=factory_fn, apply=True)
    assert applied == {"resolved": 1}
    await db_session.refresh(stale)
    await db_session.refresh(quiet)
    await db_session.refresh(real)
    assert stale.state == DecisionState.resolved
    assert stale.resolved_at is not None
    assert quiet.state == DecisionState.pending
    assert real.state == DecisionState.pending

    # Idempotent: a second apply finds nothing left to resolve.
    again = await run(session_factory=factory_fn, apply=True)
    assert again == {"resolved": 0}


class _FixedSession:
    """Adapt the script's ``async with session_factory() as s`` to the test's
    shared ``db_session`` (never closes it; the fixture owns the transaction)."""

    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, *exc):
        return False
