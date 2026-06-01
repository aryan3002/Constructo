"""Homeowner sub-role authority — who may COMMIT vs who may only voice.

Pure (no I/O) so it is trivially unit-tested and reused by both the response
gate and ``GET /me/capabilities``. The doctrine ([[04 - Role-by-Role AI
Experience]], Hard Rule "advise, never gatekeep"):

* **Approving commits money/scope** → reserved for ``primary_owner``/``co_owner``.
* **Commenting is always open** → a family member or advisor is never silenced;
  only the authority to *commit* is reserved.

The DB lookup of a member's sub-role lives in :mod:`app.homeowner.scoping`
(``member_sub_role``); this module decides what a given sub-role may do.
"""
from __future__ import annotations

from app.models import HomeownerSubRole

#: Sub-roles permitted to approve (commit) a decision.
APPROVERS: frozenset[HomeownerSubRole] = frozenset(
    {HomeownerSubRole.primary_owner, HomeownerSubRole.co_owner}
)

#: Sub-roles permitted to MANAGE members (add / designate role / remove) and
#: who are always design-authoritative. Same set as approvers today, but kept
#: distinct so the two axes (money vs household management) can diverge later.
MANAGERS: frozenset[HomeownerSubRole] = frozenset(
    {HomeownerSubRole.primary_owner, HomeownerSubRole.co_owner}
)


def can_approve(sub_role: HomeownerSubRole) -> bool:
    """True iff this sub-role may commit a money/scope-bearing decision."""
    return sub_role in APPROVERS


def can_manage_members(sub_role: HomeownerSubRole) -> bool:
    """True iff this sub-role may add members, designate roles, and remove.

    Owners and co-owners manage the household; family/advisor never do.
    """
    return sub_role in MANAGERS


def can_design(sub_role: HomeownerSubRole, can_design_flag: bool = False) -> bool:
    """True iff this member may WRITE design selections/references.

    Owners/co-owners are always design-authoritative regardless of the flag;
    any other member needs an explicit per-row ``can_design`` grant. Commenting
    on the design stays open to everyone — this gates only commit-class writes.
    """
    return sub_role in MANAGERS or bool(can_design_flag)


def capabilities_for(
    sub_role: HomeownerSubRole,
    *,
    can_design_flag: bool = False,
    design_space_id=None,
) -> dict:
    """Machine-readable capability map the mobile client renders affordances from.

    ``can_comment`` is always True — every member can voice a perspective. The
    new ``can_manage_members``/``can_design``/``design_space_id`` axes are
    independent of ``can_approve``: a family member with ``can_design`` may
    propose a selection but still cannot approve money.
    """
    return {
        "sub_role": sub_role.value,
        "can_approve": can_approve(sub_role),
        "can_comment": True,
        "can_manage_members": can_manage_members(sub_role),
        "can_design": can_design(sub_role, can_design_flag),
        "design_space_id": str(design_space_id) if design_space_id else None,
    }
