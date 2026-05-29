"""Send a rendered brief to a recipient over the pilot WhatsApp channel.

The transport is intentionally thin and swappable: it POSTs ``{to_phone, text}``
to the URL in ``WHATSAPP_SEND_URL``. When that env var is unset we run in
dry-run mode (log and return ``False``) so dev/test never touch the network.
"""
from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 10.0


async def send_brief(to_phone: str, text: str) -> bool:
    """POST the brief text to the configured WhatsApp send endpoint.

    Returns ``True`` on a successful send, ``False`` on dry-run (no
    ``WHATSAPP_SEND_URL`` configured) or on any send failure.
    """
    url = os.environ.get("WHATSAPP_SEND_URL")
    if not url:
        logger.info("send_brief: WHATSAPP_SEND_URL unset; dry-run, not sending to %s", to_phone)
        return False

    payload = {"to_phone": to_phone, "text": text}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
    except Exception:
        logger.exception("send_brief: failed to send brief to %s", to_phone)
        return False

    logger.info("send_brief: sent brief to %s", to_phone)
    return True
