"""Quiet-period detection sweep (H6 Slice Q — the #1 anxiety reducer).

The SILENCE spike ("no photo for days → my project has stalled / my money is at
risk") is the homeowner's most corrosive, cheapest-to-kill anxiety. This sweep
mirrors :mod:`app.homeowner.nudge` exactly — injected ``now`` clock, idempotent,
callable-only (the APScheduler wiring lives in :mod:`app.scheduler`).

The design **splits in two** (Data-and-AI-Pipelines §3.1, risk R1):

* a deterministic *"is it quiet?"* detector — pure rules, no LLM: a site whose
  newest homeowner-visible signal (published photos, non-quiet updates, weekly
  summaries, completed milestones) is older than ``quiet_threshold_days`` is
  stale; and
* a *reason* layer that is SOURCED and human-gated. The reason is NEVER
  invented: we map the site's CURRENT milestone phase to a low-visibility cause
  and ask :func:`app.homeowner.ai.draft_quiet_reason` to *rephrase only that*.
  When no phase reason is known the helper ABSTAINS (returns ``None``) and we do
  **not** auto-publish a guessed reason — we escalate a contractor-facing nudge
  instead ("Site X has been quiet — add a one-line reason for the homeowner?").

THE GATE: even when a reason is known, nothing reaches the homeowner until a
contractor confirms. We insert the ``Update(type=quiet)`` row as a DRAFT and a
``QuietPeriod`` (status ``suggested``) that links to it; the homeowner feed
(``/updates``, ``/home``) physically excludes quiet updates whose window is not
yet ``confirmed``/``published`` (see :func:`visible_quiet_update_ids`). Raw AI
cannot cross the contractor│homeowner line.

IDEMPOTENT: the partial-unique ``uq_quiet_open_per_site`` index allows at most
one live window per site; we additionally skip a site that already has a live
window or whose last quiet card published within ``quiet_cooldown_days``.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.extraction.llm import LLMClient, get_llm_client
from app.homeowner.ai import draft_quiet_reason
from app.models import (
    Decision,
    DecisionKind,
    DecisionState,
    Milestone,
    MilestoneStatus,
    PublishedPhoto,
    QuietPeriod,
    QuietStatus,
    Site,
    Update,
    UpdateType,
    WeeklySummary,
)

# Stable prefix so a quiet-period contractor nudge is recognisable (and never
# duplicated), mirroring nudge.py's NUDGE_TAG.
QUIET_NUDGE_TAG = "[homeowner-quiet-nudge]"

# Statuses that count as a LIVE quiet window (the partial-unique predicate).
_LIVE = (
    QuietStatus.open,
    QuietStatus.suggested,
    QuietStatus.confirmed,
    QuietStatus.published,
)

# Phase → low-visibility reason seed map (Data-and-AI-Pipelines §3.2). The
# milestone name (lower-cased, substring match) is translated into the calm,
# SOURCED reason fed to ``draft_quiet_reason``. A milestone whose name matches
# none of these yields no phase reason → the helper abstains → contractor nudge.
_PHASE_REASONS: dict[str, str] = {
    "curing": "the new concrete is curing — staying wet to gain strength",
    "slab": "the slab concrete is curing and must be left to set",
    "rcc": "the RCC concrete is curing and must be left to set",
    "deshutter": "the team is waiting to de-shutter after the pour cures",
    "plaster": "the fresh plaster is curing before the next coat",
    "waterproof": "the waterproofing layer is curing before work continues",
    "inspection": "we are waiting on a scheduled site inspection",
    "permit": "we are waiting on a permit/approval before the next stage",
    "procurement": "materials for the next stage are being procured",
    "material": "materials for the next stage are being procured",
    "monsoon": "work is paused for the monsoon and will resume after",
}


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def _phase_reason_for(name: str | None) -> str | None:
    """Map a milestone name to a SOURCED low-visibility reason, or None.

    None means "no known phase reason" → the AI must abstain (never invent).
    """
    if not name:
        return None
    low = name.lower()
    for key, reason in _PHASE_REASONS.items():
        if key in low:
            return reason
    return None


async def _last_signal_at(session: AsyncSession, site_id: UUID) -> datetime | None:
    """Newest homeowner-visible signal across the published feed for a site.

    Sources (Data-and-AI-Pipelines §3.1): ``published_photos``, ``updates``
    EXCLUDING ``type=quiet`` (a quiet card is not itself "activity"), and
    ``weekly_summaries``. Returns the max ``published_at`` (tz-aware) or None
    when the site has never had a homeowner-visible signal.
    """
    times: list[datetime] = []

    photo_max = (
        await session.execute(
            select(PublishedPhoto.published_at).where(PublishedPhoto.site_id == site_id)
        )
    ).scalars().all()
    times.extend(photo_max)

    update_max = (
        await session.execute(
            select(Update.published_at).where(
                Update.site_id == site_id, Update.type != UpdateType.quiet
            )
        )
    ).scalars().all()
    times.extend(update_max)

    summary_max = (
        await session.execute(
            select(WeeklySummary.published_at).where(WeeklySummary.site_id == site_id)
        )
    ).scalars().all()
    times.extend(summary_max)

    if not times:
        return None
    return max(_aware(t) for t in times)


async def _current_phase_name(session: AsyncSession, site_id: UUID) -> str | None:
    """The site's CURRENT phase: the milestone marked ``now`` (lowest order),
    falling back to the most-recently-started milestone. Name only (the sourced
    fact); None when the site has no milestones to source a reason from."""
    now_ms = (
        await session.execute(
            select(Milestone)
            .where(Milestone.site_id == site_id, Milestone.status == MilestoneStatus.now)
            .order_by(Milestone.order)
        )
    ).scalars().first()
    if now_ms is not None:
        return now_ms.name
    recent = (
        await session.execute(
            select(Milestone)
            .where(Milestone.site_id == site_id)
            .order_by(Milestone.order.desc())
        )
    ).scalars().first()
    return recent.name if recent is not None else None


async def _has_live_window(session: AsyncSession, site_id: UUID) -> bool:
    row = (
        await session.execute(
            select(QuietPeriod.id).where(
                QuietPeriod.site_id == site_id, QuietPeriod.status.in_(_LIVE)
            )
        )
    ).first()
    return row is not None


async def _within_cooldown(
    session: AsyncSession, site_id: UUID, moment: datetime, cooldown_days: int
) -> bool:
    """True if a quiet card was detected within ``cooldown_days`` of ``moment``
    (anti-spam, C2). Considers the most recent QuietPeriod's ``detected_at``."""
    last = (
        await session.execute(
            select(QuietPeriod.detected_at)
            .where(QuietPeriod.site_id == site_id)
            .order_by(QuietPeriod.detected_at.desc())
        )
    ).scalars().first()
    if last is None:
        return False
    return _aware(last) > moment - timedelta(days=cooldown_days)


async def run_quiet_period_sweep(
    session: AsyncSession,
    *,
    now: datetime | None = None,
    llm: LLMClient | None = None,
) -> list[UUID]:
    """Detect stale sites and raise ONE quiet card (or contractor nudge) each.

    Per site with a homeowner-visible history:

    * compute staleness from the newest visible signal vs
      ``settings.quiet_threshold_days``;
    * skip if not stale, if a live quiet window already exists (idempotent), or
      if within ``settings.quiet_cooldown_days`` of the last detection (anti-spam);
    * map the CURRENT milestone phase → a SOURCED reason and call
      :func:`draft_quiet_reason`:
      * ``None`` (unknown phase) → ABSTAIN: escalate a contractor-facing
        :class:`Decision` nudge; write NO homeowner-facing row;
      * a reason → insert an ``Update(type=quiet)`` DRAFT (invisible until
        confirmed) + a ``QuietPeriod`` (status ``suggested``) linking to it.

    Returns the ids of the sites acted on this run. The clock is injected so
    tests are deterministic; ``llm`` defaults to the env-selected client (fake
    without creds), matching the rest of the homeowner AI surface.
    """
    moment = _aware(now) if now is not None else datetime.now(UTC)
    client = llm if llm is not None else get_llm_client()
    threshold = settings.quiet_threshold_days
    cooldown = settings.quiet_cooldown_days

    site_ids = (await session.execute(select(Site.id))).scalars().all()
    acted: list[UUID] = []

    for site_id in site_ids:
        # Idempotency + anti-spam guards first (cheap, skip early).
        if await _has_live_window(session, site_id):
            continue
        if await _within_cooldown(session, site_id, moment, cooldown):
            continue

        last_signal = await _last_signal_at(session, site_id)
        if last_signal is None:
            continue  # never published anything — not "quiet", just not started
        gap_days = (moment - last_signal).days
        if gap_days < threshold:
            continue  # still fresh

        phase_name = await _current_phase_name(session, site_id)
        reason_fact = _phase_reason_for(phase_name)
        reason_text = await draft_quiet_reason(client, phase=reason_fact)

        if reason_text is None:
            # ABSTAIN — never confabulate. Escalate to the contractor; no
            # homeowner-facing row is written.
            site = await session.get(Site, site_id)
            if site is None:
                continue
            session.add(
                Decision(
                    company_id=site.company_id,
                    site_id=site_id,
                    kind=DecisionKind.generic,
                    title=f"{QUIET_NUDGE_TAG}[{site_id}] Quiet site — add a reason",
                    detail=(
                        f"This site has had no homeowner-visible update for "
                        f"{gap_days} days and no known phase reason. Add a "
                        "one-line reason for the homeowner, or publish a photo."
                    ),
                    state=DecisionState.pending,
                )
            )
            acted.append(site_id)
            continue

        # Known reason → DRAFT pending contractor confirm. The Update row is
        # created but stays invisible (its window is `suggested`, not confirmed),
        # so raw AI never reaches the homeowner.
        update = Update(
            site_id=site_id,
            type=UpdateType.quiet,
            title="Nothing new to see on site right now",
            body=reason_text,
        )
        session.add(update)
        await session.flush()  # assign update.id for the FK below
        session.add(
            QuietPeriod(
                site_id=site_id,
                last_signal_at=last_signal,
                gap_days=gap_days,
                phase_reason=reason_fact,
                reason_source="schedule",
                draft_text=reason_text,
                update_id=update.id,
                status=QuietStatus.suggested,
            )
        )
        acted.append(site_id)

    if acted:
        await session.commit()
    return acted


async def confirm_quiet_period(
    session: AsyncSession,
    quiet_period: QuietPeriod,
    *,
    confirmed_by: UUID,
    now: datetime | None = None,
) -> QuietPeriod:
    """Contractor gate: transition a ``suggested`` window to ``published`` and
    make its linked quiet ``Update`` homeowner-visible.

    This is the human-in-the-loop step the sweep deliberately stops short of: the
    AI-drafted reason sits as a DRAFT (``suggested``) until a contractor confirms,
    and only then does ``visible_quiet_update_ids`` admit it to the feed. We
    promote straight to ``published`` (the homeowner read path gates on
    ``confirmed``/``published`` alike) and copy the confirmed draft into
    ``published_text`` so the homeowner-facing copy is fixed at confirm time.

    Idempotent: confirming an already confirmed/published window is a no-op that
    returns the row unchanged. Only a ``suggested``/``open`` window may be
    confirmed; anything else (closed/dismissed) is rejected.
    """
    moment = _aware(now) if now is not None else datetime.now(UTC)
    if quiet_period.status in (QuietStatus.confirmed, QuietStatus.published):
        return quiet_period  # already through the gate — idempotent
    if quiet_period.status not in (QuietStatus.suggested, QuietStatus.open):
        from app.common.errors import AppError

        raise AppError(
            409,
            "not_confirmable",
            "This quiet period can no longer be confirmed.",
        )

    quiet_period.status = QuietStatus.published
    quiet_period.confirmed_by = confirmed_by
    quiet_period.confirmed_at = moment
    if quiet_period.published_text is None:
        quiet_period.published_text = quiet_period.draft_text or quiet_period.phase_reason

    await session.commit()
    await session.refresh(quiet_period)
    return quiet_period


async def visible_quiet_update_ids(
    session: AsyncSession, site_id: UUID
) -> set[UUID]:
    """Ids of quiet ``Update`` rows the homeowner MAY see for a site.

    The contractor│homeowner gate enforced at the query layer: a quiet update is
    visible only once its ``QuietPeriod`` is ``confirmed`` or ``published``. A
    quiet update with no window, or one still ``suggested``/``open``, is a draft
    and must be filtered out of every homeowner feed read.
    """
    rows = (
        await session.execute(
            select(QuietPeriod.update_id).where(
                QuietPeriod.site_id == site_id,
                QuietPeriod.update_id.is_not(None),
                QuietPeriod.status.in_(
                    (QuietStatus.confirmed, QuietStatus.published)
                ),
            )
        )
    ).scalars().all()
    return {uid for uid in rows if uid is not None}


async def current_confirmed_quiet(
    session: AsyncSession, site_id: UUID
) -> QuietPeriod | None:
    """The site's current contractor-confirmed quiet window, if any (for the
    Home/Photos/Updates empty-state card). Returns the most recent
    ``confirmed``/``published`` window; None when there is nothing to show."""
    return (
        await session.execute(
            select(QuietPeriod)
            .where(
                QuietPeriod.site_id == site_id,
                QuietPeriod.status.in_((QuietStatus.confirmed, QuietStatus.published)),
            )
            .order_by(QuietPeriod.detected_at.desc())
        )
    ).scalars().first()
