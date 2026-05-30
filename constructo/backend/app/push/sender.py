"""Expo push delivery (H3).

The homeowner app registers an Expo push token and stashes it in its
``homeowner_members.notif_prefs`` jsonb (key ``push_token``) — no migration. This
module turns a site event (a new published update, a decision needed, a request
status change) into an Expo push to every active member of that site who has a
token.

Transport is selected by ``PUSH_SEND_MODE`` (mirrors the bot sender):
  - ``dry_run`` (default) → record into an in-process log, never touch the
    network (tests + local dev).
  - ``expo``   → POST the Expo push API (https://exp.host/--/api/v2/push/send).

Every entrypoint is BEST-EFFORT: failures are logged and swallowed so a push
never breaks the request that triggered it.
"""
from __future__ import annotations

import logging
import os
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import HomeownerMember, MemberStatus

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_TIMEOUT_SECONDS = 10.0

# In-process record of dry-run sends, for tests/inspection. Each entry is the
# Expo message dict that WOULD have been sent.
_DRY_RUN_LOG: list[dict] = []


def _mode() -> str:
    return os.environ.get("PUSH_SEND_MODE", "dry_run").lower()


def dry_run_log() -> list[dict]:
    """The captured dry-run messages (tests read this; call reset between tests)."""
    return _DRY_RUN_LOG


def reset_dry_run_log() -> None:
    _DRY_RUN_LOG.clear()


async def send_expo_push(messages: list[dict]) -> dict:
    """Send a batch of Expo push messages. Returns a small status dict.

    Each message: ``{"to": <ExponentPushToken>, "title": str, "body": str,
    "data"?: dict}``. In dry-run nothing leaves the process.
    """
    if not messages:
        return {"sent": 0, "mode": _mode()}

    if _mode() == "expo":
        try:
            import httpx

            async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
                resp = await client.post(EXPO_PUSH_URL, json=messages)
                resp.raise_for_status()
            return {"sent": len(messages), "mode": "expo"}
        except Exception:
            logger.exception("expo push send failed")
            return {"sent": 0, "mode": "expo", "error": True}

    _DRY_RUN_LOG.extend(messages)
    logger.info("push dry-run: captured %d message(s)", len(messages))
    return {"sent": len(messages), "mode": "dry_run"}


async def _push_tokens_for_site(session: AsyncSession, site_id: UUID) -> list[str]:
    rows = (
        await session.execute(
            select(HomeownerMember).where(
                HomeownerMember.site_id == site_id,
                HomeownerMember.status == MemberStatus.active,
            )
        )
    ).scalars().all()
    tokens: list[str] = []
    for m in rows:
        token = (m.notif_prefs or {}).get("push_token")
        if isinstance(token, str) and token:
            tokens.append(token)
    return tokens


async def notify_site_homeowners(
    session: AsyncSession,
    site_id: UUID,
    title: str,
    body: str,
    *,
    data: dict | None = None,
) -> list[str]:
    """Push ``title``/``body`` to every active member of ``site_id`` with a token.

    Best-effort: returns the tokens targeted (empty if none / on error). Never
    raises — callers wire this after their own commit and ignore failures.
    """
    try:
        tokens = await _push_tokens_for_site(session, site_id)
        if not tokens:
            return []
        messages = [
            {"to": token, "title": title, "body": body, **({"data": data} if data else {})}
            for token in tokens
        ]
        await send_expo_push(messages)
        return tokens
    except Exception:
        logger.exception("notify_site_homeowners failed for site %s", site_id)
        return []
