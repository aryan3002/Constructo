"""Phase B approvals / decision-trust layer.

Operates the B0 ``decisions`` ledger: a pure state machine (pending →
acknowledged → resolved/rejected/escalated), an SLA sweep for homeowner
questions, and the approval-inbox API. One ledger: a decision resolved here is
the same row a WhatsApp reply would resolve.
"""
