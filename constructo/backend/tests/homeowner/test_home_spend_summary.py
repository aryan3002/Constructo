"""Home payments card (T5): "paid so far" is the real money received, not the
sum of change-order costs, and approved changes are counted separately.
"""
from datetime import date
from decimal import Decimal

from app.models import Change, Payment, PaymentDirection, PaymentStatus

from .conftest import auth


async def _payment(db_session, ctx, amount, direction, status=PaymentStatus.recorded):
    db_session.add(
        Payment(
            company_id=ctx.company.id,
            site_id=ctx.site.id,
            direction=direction,
            counterparty_name="Someone",
            amount=Decimal(amount),
            paid_on=date(2026, 5, 1),
            status=status,
            notes="private note",
            method="upi",
            reference_no="REF-1",
        )
    )
    await db_session.flush()


async def _home(client, ctx):
    r = await client.get("/api/v1/homeowner/home", headers=auth(ctx.homeowner))
    assert r.status_code == 200, r.text
    return r.json()


async def test_total_paid_counts_only_undisputed_homeowner_payments(client, ctx, db_session):
    await _payment(
        db_session, ctx, "500000", PaymentDirection.homeowner_to_contractor,
        PaymentStatus.confirmed,
    )
    await _payment(
        db_session, ctx, "70000", PaymentDirection.homeowner_to_contractor,
        PaymentStatus.disputed,
    )
    await _payment(db_session, ctx, "90000", PaymentDirection.contractor_to_supplier)
    db_session.add(
        Change(site_id=ctx.site.id, description="Extra plug points", cost_delta=12000,
               approved_by=ctx.owner.id)
    )
    db_session.add(Change(site_id=ctx.site.id, description="Upgrade tiles", cost_delta=10500))
    await db_session.flush()

    spend = (await _home(client, ctx))["spend_summary"]
    assert spend["total_paid"] == 500000
    assert spend["change_count"] == 2
    assert spend["approved_change_count"] == 1
    assert spend["total_change_cost_delta"] == 22500
    # Only the total crosses to the homeowner — never payment details.
    assert set(spend) == {
        "total_change_cost_delta", "change_count", "approved_change_count", "total_paid",
    }


async def test_no_payments_means_total_paid_null(client, ctx, db_session):
    db_session.add(Change(site_id=ctx.site.id, description="Upgrade tiles", cost_delta=10500))
    await db_session.flush()

    spend = (await _home(client, ctx))["spend_summary"]
    assert spend["total_paid"] is None
    assert spend["change_count"] == 1
    assert spend["approved_change_count"] == 0


async def test_only_disputed_or_supplier_payments_is_still_null(client, ctx, db_session):
    await _payment(
        db_session, ctx, "70000", PaymentDirection.homeowner_to_contractor,
        PaymentStatus.disputed,
    )
    await _payment(db_session, ctx, "90000", PaymentDirection.contractor_to_supplier)

    assert (await _home(client, ctx))["spend_summary"] is None


async def test_payments_without_changes_still_returns_summary(client, ctx, db_session):
    await _payment(db_session, ctx, "250000", PaymentDirection.homeowner_to_contractor)

    spend = (await _home(client, ctx))["spend_summary"]
    assert spend == {
        "total_change_cost_delta": 0,
        "change_count": 0,
        "approved_change_count": 0,
        "total_paid": 250000,
    }


async def test_no_changes_no_payments_means_no_summary(client, ctx):
    assert (await _home(client, ctx))["spend_summary"] is None
