"""Wave 1: AI event extraction pipeline.

Converts a :class:`~app.contracts.events.RawMessage` (WhatsApp text, photo,
voice note, or document) into structured :class:`~app.contracts.events.SiteEvent`
records. The public entry points are :func:`app.extraction.extract.extract`
(pure pipeline) and :func:`app.extraction.worker.handle_ingested` (DB-backed).
"""
