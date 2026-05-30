"""Attendance & field-capture module (Phase B).

Field roles (supervisor, mukadam/labor_contractor) capture attendance from the
contractor app. Extraction already produces ``attendance`` SiteEvents from the
WhatsApp feed; this module adds the *write* path used by the app's CaptureBar
and computes planned-vs-actual headcount against the B0 ``site_baselines`` row.

Nothing here moves money or mutates frozen models — it only writes new
``site_events`` rows (the shared attendance ledger) and reads ``payments`` for
the mukadam's own payment status.
"""
