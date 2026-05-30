"""Owner Home dashboard module (Phase B).

Read-only aggregations over the merged B0 foundation that power the Owner Brief
home screen: the "N things need you today across M sites" headline, the
exceptions-first per-site risk roll-up (wired to ``site_baselines`` so the
labor-shortfall risk actually fires), a 2x2 at-a-glance pulse grid (cash /
labor / material / progress), and a cold-start setup checklist when the company
has no sites / baselines / events yet.

The brief *generation* endpoints already live in :mod:`app.brief`; this module
never writes the brief. The single write path here is creating a
:class:`app.models.Decision` from an inline Approve / Hold / Assign chip.
"""
