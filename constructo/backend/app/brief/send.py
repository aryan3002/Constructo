"""Send a rendered brief to a recipient over the pilot WhatsApp channel.

Three transports, selected by ``WHATSAPP_SEND_MODE``:

  * ``dry_run`` (default): log and return ``False``. Dev/test never touch the
    network.
  * ``url``: POST ``{to_phone, text}`` to ``WHATSAPP_SEND_URL`` (a generic
    webhook / your own relay).
  * ``cloud_api``: POST to the WhatsApp Cloud API
    ``https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_NUMBER_ID}/messages``
    with a ``Bearer {WHATSAPP_TOKEN}`` header and a text-message body.

IMPORTANT (Cloud API):
  * Free-form text is only delivered inside the 24-hour customer-service window
    — i.e. the recipient (the owner / test number) must have messaged your
    WhatsApp number within the last 24h. Outside that window Meta REQUIRES a
    pre-approved message template; a plain text send will be rejected.
  * The Meta-provided test access token expires every 24 hours. For a real
    pilot, generate a permanent System User token instead.
"""
from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 10.0
_CLOUD_API_BASE = "https://graph.facebook.com/v21.0"


def _mode() -> str:
    return os.environ.get("WHATSAPP_SEND_MODE", "dry_run").strip().lower()


async def send_brief(to_phone: str, text: str) -> bool:
    """Send the brief text via the configured WhatsApp transport.

    Returns ``True`` on a successful send, ``False`` on dry-run or any failure.
    """
    mode = _mode()

    if mode == "dry_run":
        logger.info("send_brief: dry-run mode; not sending to %s", to_phone)
        return False

    if mode == "url":
        return await _send_url(to_phone, text)

    if mode == "cloud_api":
        return await _send_cloud_api(to_phone, text)

    logger.warning("send_brief: unknown WHATSAPP_SEND_MODE=%r; treating as dry-run", mode)
    return False


async def _send_url(to_phone: str, text: str) -> bool:
    url = os.environ.get("WHATSAPP_SEND_URL")
    if not url:
        logger.info(
            "send_brief: WHATSAPP_SEND_URL unset for url mode; dry-run, not sending to %s",
            to_phone,
        )
        return False

    payload = {"to_phone": to_phone, "text": text}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
    except Exception:
        logger.exception("send_brief: failed to send brief to %s", to_phone)
        return False

    logger.info("send_brief: sent brief to %s (url mode)", to_phone)
    return True


async def _send_cloud_api(to_phone: str, text: str) -> bool:
    token = os.environ.get("WHATSAPP_TOKEN")
    phone_number_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID")
    if not token or not phone_number_id:
        logger.warning(
            "send_brief: cloud_api mode requires WHATSAPP_TOKEN and "
            "WHATSAPP_PHONE_NUMBER_ID; not sending to %s",
            to_phone,
        )
        return False

    url = f"{_CLOUD_API_BASE}/{phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {token}"}
    body = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "text",
        "text": {"body": text},
    }
    # NOTE: free-form text only delivers inside the 24h customer-service window;
    # otherwise Meta requires a pre-approved template (see module docstring).
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            resp = await client.post(url, headers=headers, json=body)
            resp.raise_for_status()
    except Exception:
        logger.exception("send_brief: cloud_api send failed for %s", to_phone)
        return False

    logger.info("send_brief: sent brief to %s (cloud_api mode)", to_phone)
    return True
