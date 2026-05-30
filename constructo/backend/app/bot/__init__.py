"""Constructo WhatsApp bot brain ("Nivaan").

A polite, near-invisible Hinglish site assistant that lives inside WhatsApp
groups. The package implements design-05 (persona + the Guest Rule):

  * :mod:`app.bot.sender` — outbound abstraction (BRIDGE / CLOUD_API / dry-run).
  * :mod:`app.bot.intents` — classify an inbound message (LLM + fast-paths).
  * :mod:`app.bot.compose` — build Nivaan's brief Hinglish replies.
  * :mod:`app.bot.handle` — orchestrate one inbound message end-to-end.
  * :mod:`app.bot.brief_delivery` — deliver the 7am owner brief + reply map.
  * :mod:`app.bot.reply_actions` — apply a brief reply ("1"/"approve"/…) to the
    decision ledger (the WhatsApp ↔ app one-ledger handoff).
  * :mod:`app.bot.router` — thin FastAPI endpoints for testing/integration.
"""
