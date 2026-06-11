"""Nivaan proposals: the agent drafts a card; a HUMAN commits. No auto-commit."""
from sqlalchemy import func, select

from app.agent.nivaan import ProposalRequest, build_proposal
from app.models import Conversation, ConversationKind, SiteEventModel, UserRole


async def _site_conv(db_session, company, site, owner):
    conv = Conversation(
        company_id=company.id, site_id=site.id, kind=ConversationKind.site,
        created_by=owner.id,
    )
    db_session.add(conv)
    await db_session.flush()
    return conv


async def _event_count(db_session, site_id) -> int:
    return await db_session.scalar(
        select(func.count()).select_from(SiteEventModel).where(SiteEventModel.site_id == site_id)
    )


async def test_non_money_proposal_drafts_a_commit_card_without_committing(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = await _site_conv(db_session, company, site, owner)

    req = ProposalRequest(
        capture_type="material_delivery",
        fields={"material": "cement", "quantity": 50, "unit": "bori", "vendor": "ACC"},
    )
    reply = await build_proposal(db_session, owner, conv, req)

    p = reply.meta["proposal"]
    assert p["tier"] == "commit"
    assert p["capture_type"] == "material_delivery"
    assert p["fields"]["quantity"] == 50
    assert p["committable"] is True
    # Structural proof: the agent committed NOTHING — the site has no events.
    assert await _event_count(db_session, site.id) == 0


async def test_proposal_summary_is_numeric_guarded(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = await _site_conv(db_session, company, site, owner)
    req = ProposalRequest(
        capture_type="material_delivery",
        fields={"material": "cement", "quantity": 50, "unit": "bori"},
    )
    reply = await build_proposal(db_session, owner, conv, req)
    # The drafted summary mentions only grounded numbers (50), never an invented one.
    summary = reply.meta["proposal"]["summary"]
    assert "50" in summary
    assert "500" not in summary
