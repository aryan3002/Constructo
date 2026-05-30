"""Outbound message abstraction for the bot.

A single :func:`send` entrypoint routes to one of three transports, selected by
config:

  * ``BOT_SEND_VIA`` (preferred) or the existing ``WHATSAPP_SEND_MODE``:
      - ``bridge``  → POST ``{BRIDGE_URL}/send`` with an ``X-Bridge-Key`` header
        (the Node Baileys bridge, W1). This is the personal-WhatsApp path that
        can post to *groups* and *react* — what the Guest Rule needs.
      - ``cloud_api`` → reuse the Graph send in :mod:`app.brief.send` (1:1 DM
        text only; no group/reaction support).
      - ``dry_run`` (default) → log and record, never touch the network. Used by
        tests and local dev.

The /send CONTRACT (must match the bridge verbatim):

  POST {BRIDGE_URL}/send
  header  X-Bridge-Key: <BRIDGE_KEY>
  body    { "to": str,
            "type": "text" | "reaction",
            "text"?: str,
            "react_to_message_id"?: str,
            "reply_to_message_id"?: str }
  resp    { "ok": bool, "message_id": str }

:func:`send` is idempotent at the call site: pass ``idempotency_key`` and a
repeated call with the same key is suppressed (returns the prior result) within
the process. The bridge itself is the durable dedupe authority across restarts.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 10.0


# ---------------------------------------------------------------------------
# Result + transport selection
# ---------------------------------------------------------------------------


@dataclass
class SendResult:
    """Outcome of a :func:`send` call.

    ``ok`` is whether the message was accepted by the transport (always ``True``
    in dry-run — the message is "captured", just not transmitted). ``message_id``
    is the transport's id (synthetic in dry-run). ``transport`` records which
    path ran, ``deduped`` whether an idempotency key short-circuited it.
    """

    ok: bool
    message_id: str | None = None
    transport: str = "dry_run"
    kind: str = "text"  # "text" | "reaction"
    to: str = ""
    text: str | None = None
    dm: bool = False
    deduped: bool = False
    payload: dict[str, Any] = field(default_factory=dict)


def _mode() -> str:
    """Resolve the active transport.

    ``BOT_SEND_VIA`` wins if set (``bridge`` | ``cloud_api`` | ``dry_run``).
    Otherwise we map the shared ``WHATSAPP_SEND_MODE`` (``url`` is treated as the
    bridge; ``cloud_api`` as cloud; everything else dry-run) so the bot honours
    the same switch the brief sender already uses.
    """
    explicit = os.environ.get("BOT_SEND_VIA")
    if explicit:
        return explicit.strip().lower()
    legacy = os.environ.get("WHATSAPP_SEND_MODE", "dry_run").strip().lower()
    if legacy == "url":
        return "bridge"
    if legacy == "cloud_api":
        return "cloud_api"
    return "dry_run"


# Process-local idempotency ledger (best-effort within a worker). The bridge is
# the durable authority across restarts; this just avoids double-sends inside a
# single handle/deliver call.
_SEEN: dict[str, SendResult] = {}


def reset_idempotency() -> None:
    """Clear the in-process idempotency ledger (test helper)."""
    _SEEN.clear()


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------


async def send(
    to: str,
    *,
    text: str | None = None,
    react_to: str | None = None,
    reply_to: str | None = None,
    dm: bool = False,
    idempotency_key: str | None = None,
) -> SendResult:
    """Send an outbound WhatsApp message (or reaction).

    Args:
        to: destination JID/phone. For a reaction or reply this is the chat the
            target message lives in; for a DM it's the owner's chat.
        text: message body. Required unless ``react_to`` is given (a bare
            reaction carries no text).
        react_to: a message id to react to. When set, sends a ``reaction``
            (``✅`` by default, or ``text`` if a different emoji is passed).
        reply_to: a message id this message quotes/answers.
        dm: hint that this is a private message to the owner (sensitive content).
            Does not change the transport contract — it's recorded on the result
            and used by callers/tests to assert the Guest Rule.
        idempotency_key: if provided, a repeated call with the same key in this
            process returns the prior result without re-sending.

    Returns a :class:`SendResult`. Never raises on a transport failure — returns
    ``ok=False`` so the caller (the Guest Rule) degrades to silence.
    """
    if idempotency_key is not None and idempotency_key in _SEEN:
        prior = _SEEN[idempotency_key]
        return SendResult(**{**prior.__dict__, "deduped": True})

    is_reaction = react_to is not None
    if is_reaction:
        emoji = text or "✅"
        body: dict[str, Any] = {
            "to": to,
            "type": "reaction",
            "text": emoji,
            "react_to_message_id": react_to,
        }
    else:
        if not text:
            raise ValueError("send() requires text for a non-reaction message")
        body = {"to": to, "type": "text", "text": text}
        if reply_to is not None:
            body["reply_to_message_id"] = reply_to

    mode = _mode()
    if mode == "bridge":
        result = await _send_bridge(body, dm=dm)
    elif mode == "cloud_api":
        result = await _send_cloud_api(body, dm=dm)
    else:
        result = _send_dry_run(body, dm=dm)

    if idempotency_key is not None and result.ok:
        _SEEN[idempotency_key] = result
    return result


# ---------------------------------------------------------------------------
# Transports
# ---------------------------------------------------------------------------


def _send_dry_run(body: dict[str, Any], *, dm: bool) -> SendResult:
    logger.info("bot.send dry-run: %s (dm=%s)", body, dm)
    # Synthetic, deterministic-ish id so dry-run callers/tests have something
    # to thread through (e.g. a reply id). Not network-derived.
    import uuid

    mid = f"dry-{uuid.uuid4().hex[:12]}"
    return SendResult(
        ok=True,
        message_id=mid,
        transport="dry_run",
        kind=body["type"],
        to=body["to"],
        text=body.get("text"),
        dm=dm,
        payload=body,
    )


async def _send_bridge(body: dict[str, Any], *, dm: bool) -> SendResult:
    bridge_url = os.environ.get("BRIDGE_URL")
    bridge_key = os.environ.get("BRIDGE_KEY", "")
    if not bridge_url:
        logger.warning("bot.send: bridge mode but BRIDGE_URL unset; dry-run instead")
        return _send_dry_run(body, dm=dm)

    url = bridge_url.rstrip("/") + "/send"
    headers = {"X-Bridge-Key": bridge_key}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            resp = await client.post(url, headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        logger.exception("bot.send: bridge send failed for %s", body.get("to"))
        return SendResult(
            ok=False, transport="bridge", kind=body["type"], to=body["to"],
            text=body.get("text"), dm=dm, payload=body,
        )

    return SendResult(
        ok=bool(data.get("ok")),
        message_id=data.get("message_id"),
        transport="bridge",
        kind=body["type"],
        to=body["to"],
        text=body.get("text"),
        dm=dm,
        payload=body,
    )


async def _send_cloud_api(body: dict[str, Any], *, dm: bool) -> SendResult:
    """Cloud API has no group/reaction support — text DMs only.

    Reuses the Graph send in :mod:`app.brief.send`. A reaction request degrades
    to a no-op success (the Guest Rule's react-only path is a bridge-only
    feature; on cloud we simply stay silent rather than send a stray text).
    """
    if body["type"] == "reaction":
        logger.info("bot.send: reactions unsupported on cloud_api; no-op")
        return SendResult(
            ok=True, transport="cloud_api", kind="reaction", to=body["to"],
            dm=dm, payload=body,
        )

    from app.brief.send import send_brief

    ok = await send_brief(body["to"], body["text"])
    return SendResult(
        ok=ok, transport="cloud_api", kind="text", to=body["to"],
        text=body.get("text"), dm=dm, payload=body,
    )
