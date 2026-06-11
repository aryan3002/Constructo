"""Kill-criteria metrics — deterministic weekly rollup over existing vault tables.

No LLM calls; pure SQL aggregation over chat_messages, raw_messages, site_events.
The weekly snapshot is persisted in bet_metrics_weekly and exposed to the owner.
"""
