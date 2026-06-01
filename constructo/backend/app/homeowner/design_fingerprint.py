"""Deterministic multi-member design reducer (proposal C — the trust firewall).

Pure Python, NO network and NO database — the only thing that *decides* how many
members' design inputs combine into one household fingerprint. The LLM
(:func:`app.homeowner.ai.generate_design_profile`) may only rephrase this output;
it can never exceed the facts computed here ([[05 - Data and AI Pipelines]] §5.5).

Aggregation policy (founder-locked): **primary-weighted blend + per-room
delegation**. Owners/co-owners are *authoritative everywhere*; any other member
is *advisory* UNLESS granted a say via ``HomeownerMember.can_design`` (whole-house
when ``design_space_id`` is NULL, else that room only). An advisor is **always
advisory**, even if mistakenly granted ``can_design`` — money/commit stays walled
([[04 - Role-by-Role AI Experience]] §3.1). Unattributed legacy rows
(``actor_member_id is None``) are treated as the **household/primary** so a NULL
never manufactures a phantom conflicting member.

Conflict surfacing (Hard Rule 5): when two *authoritative* contributors diverge
on the same ``(item, room)``, the reducer emits a ``conflicts[]`` entry — a calm
"decide together" card for a human to resolve. The reducer NEVER picks a winner;
advisory divergence is rendered as a suggestion, never a conflict.

Everything here is a plain function over plain dataclasses so it is unit-tested
directly with no fixtures.
"""
from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass, field
from uuid import UUID

from app.models import HomeownerSubRole

# Sub-roles that are design-authoritative everywhere, no grant needed. Kept in
# sync with authority.MANAGERS (owners/co-owners), but stated locally so the
# reducer stays pure (no import of the gate).
_AUTHORITATIVE_ROLES: frozenset[HomeownerSubRole] = frozenset(
    {HomeownerSubRole.primary_owner, HomeownerSubRole.co_owner}
)
# An advisor is comment-only by doctrine: never authoritative even if a primary
# mistakenly flips can_design on their row (the authority bug guard, [[04]] §3.1).
_NEVER_AUTHORITATIVE_ROLES: frozenset[HomeownerSubRole] = frozenset(
    {HomeownerSubRole.advisor}
)


@dataclass(frozen=True)
class MemberInfo:
    """The subset of a ``HomeownerMember`` row the reducer needs (no I/O)."""

    id: UUID
    sub_role: HomeownerSubRole
    can_design: bool = False
    # NULL = whole-house say; a space id = that room only. Mirrors the member row.
    design_space_id: UUID | None = None
    # Owner-set label ("Papa", "Neha — designer"); falls back to the role name.
    display_name: str | None = None


# Selection statuses that mark a DECIDED choice — a human resolution wins its
# (item, room) group over still-"proposed" diverging picks (conflict settled).
_DECIDED_STATUSES: frozenset[str] = frozenset({"selected", "approved", "final", "done"})


@dataclass(frozen=True)
class SelectionInput:
    """An attributed selection (one material/finish choice)."""

    item: str
    choice: str
    actor_member_id: UUID | None = None
    space_id: UUID | None = None
    # Lifecycle status; a decided status (see _DECIDED_STATUSES) settles a
    # conflict in favour of this choice when a human has resolved it.
    status: str = "proposed"


@dataclass(frozen=True)
class ReferenceInput:
    """An attributed inspiration reference."""

    actor_member_id: UUID | None = None
    room_tag: str | None = None


@dataclass
class _Contribution:
    """An authoritative-or-advisory selection after weight resolution."""

    item: str
    choice: str
    room: str | None
    member_id: UUID | None
    sub_role: str
    display_name: str | None
    authoritative: bool
    decided: bool = False


def _norm(text: str) -> str:
    """Normalise an item/choice key for grouping (case- and space-insensitive)."""
    return " ".join(text.strip().lower().split())


def _member_label(info: MemberInfo | None) -> str:
    if info is None:
        return "Household"
    if info.display_name and info.display_name.strip():
        return info.display_name.strip()
    return info.sub_role.value.replace("_", " ").title()


def _resolve_authority(
    info: MemberInfo | None, room: str | None
) -> bool:
    """Is this member authoritative for a contribution targeting ``room``?

    * No member (unattributed legacy row) → treated as household/primary →
      authoritative (so a NULL never becomes a phantom advisory voice).
    * primary_owner / co_owner → authoritative everywhere.
    * advisor → never authoritative (comment-only), even with can_design.
    * anyone else with ``can_design`` → authoritative within their scope: a
      room-scoped grant (``design_space_id`` set) only covers that room; a
      whole-house grant covers every room.
    * otherwise → advisory.
    """
    if info is None:
        return True
    if info.sub_role in _AUTHORITATIVE_ROLES:
        return True
    if info.sub_role in _NEVER_AUTHORITATIVE_ROLES:
        return False
    if not info.can_design:
        return False
    if info.design_space_id is None:
        return True  # whole-house say
    # Room-scoped say: authoritative only inside that room. A contribution to a
    # different (or unknown) room is advisory.
    return room is not None and str(info.design_space_id) == room


@dataclass
class FingerprintResult:
    """Structured output, a backward-compatible superset of {profile, tone}.

    ``selection_pairs`` / ``reference_tags`` keep the legacy AI signature fed; the
    new keys (``per_room``, ``contributors``, ``conflicts``) drive proposal C.
    """

    selection_pairs: list[tuple[str, str]] = field(default_factory=list)
    reference_tags: list[str] = field(default_factory=list)
    per_room: dict[str, list[dict]] = field(default_factory=dict)
    contributors: list[dict] = field(default_factory=list)
    conflicts: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "selection_pairs": [list(p) for p in self.selection_pairs],
            "reference_tags": list(self.reference_tags),
            "per_room": self.per_room,
            "contributors": self.contributors,
            "conflicts": self.conflicts,
        }


def build_fingerprint(
    *,
    selections: list[SelectionInput],
    references: list[ReferenceInput],
    members: dict[UUID, MemberInfo],
) -> FingerprintResult:
    """Merge all members' attributed inputs into one household fingerprint.

    ``members`` maps member-id → :class:`MemberInfo`; a selection/reference whose
    ``actor_member_id`` is missing from the map (or None) is treated as the
    unattributed household/primary voice.

    Deterministic: groups are ordered by first appearance, options within a
    conflict by first appearance, so the same inputs always yield byte-identical
    output (safe to feed an LLM and to assert in tests).
    """
    result = FingerprintResult()

    # --- resolve every selection's weight, grouped by (item, room) -----------
    # OrderedDict preserves first-seen order for deterministic output.
    groups: OrderedDict[tuple[str, str | None], list[_Contribution]] = OrderedDict()
    contributor_ids: OrderedDict[UUID | None, _Contribution] = OrderedDict()

    for sel in selections:
        room = str(sel.space_id) if sel.space_id is not None else None
        info = members.get(sel.actor_member_id) if sel.actor_member_id else None
        authoritative = _resolve_authority(info, room)
        contrib = _Contribution(
            item=sel.item,
            choice=sel.choice,
            room=room,
            member_id=sel.actor_member_id,
            sub_role=info.sub_role.value if info else "household",
            display_name=_member_label(info),
            authoritative=authoritative,
            decided=sel.status.strip().lower() in _DECIDED_STATUSES,
        )
        groups.setdefault((_norm(sel.item), room), []).append(contrib)
        contributor_ids.setdefault(sel.actor_member_id, contrib)

    # --- references contribute room tags + their authors as contributors -----
    for ref in references:
        if ref.room_tag and ref.room_tag.strip():
            tag = ref.room_tag.strip()
            if tag not in result.reference_tags:
                result.reference_tags.append(tag)
        if ref.actor_member_id and ref.actor_member_id not in contributor_ids:
            info = members.get(ref.actor_member_id)
            contributor_ids[ref.actor_member_id] = _Contribution(
                item="", choice="", room=None,
                member_id=ref.actor_member_id,
                sub_role=info.sub_role.value if info else "household",
                display_name=_member_label(info),
                authoritative=_resolve_authority(info, None),
            )

    # --- emit per-group fingerprint material + conflicts ---------------------
    for (_item_key, room), contribs in groups.items():
        authoritative = [c for c in contribs if c.authoritative]
        advisory = [c for c in contribs if not c.authoritative]

        # A conflict is divergence between DIFFERENT authoritative members. One
        # member (or the unattributed household, member_id=None) revising their
        # own pick is never a fight with themselves — keep only their latest. So
        # collapse to the last choice per member, then look at distinct choices.
        latest_by_member: OrderedDict[UUID | None, _Contribution] = OrderedDict()
        for c in authoritative:
            latest_by_member[c.member_id] = c  # last write wins per member
        distinct: OrderedDict[str, _Contribution] = OrderedDict()
        for c in latest_by_member.values():
            distinct.setdefault(_norm(c.choice), c)

        display_item = (authoritative or advisory or contribs)[0].item

        # A human resolution settles the group: if any authoritative pick carries
        # a decided status, the LAST such pick (most recent in input order) wins
        # and the group is no longer a conflict (Hard Rule 5: a human picked it).
        decided = [c for c in authoritative if c.decided]

        if decided:
            chosen = decided[-1]
            result.selection_pairs.append((chosen.item, chosen.choice))
            entry = {
                "item": chosen.item,
                "choice": chosen.choice,
                "by": chosen.display_name,
                "authoritative": True,
            }
            if room is not None:
                result.per_room.setdefault(room, []).append(entry)
        elif len(distinct) >= 2:
            # Calm "decide together" card — a HUMAN resolves it, never the reducer.
            options = [
                {
                    "choice": c.choice,
                    "member_id": str(c.member_id) if c.member_id else None,
                    "sub_role": c.sub_role,
                    "by": c.display_name,
                }
                for c in distinct.values()
            ]
            # Cost-bearing vs aesthetic is not modelled per-item yet; owners are
            # always able to resolve, so report the authoritative resolver set.
            result.conflicts.append(
                {
                    "item": display_item,
                    "room": room,
                    "options": options,
                    "resolve_roles": sorted(r.value for r in _AUTHORITATIVE_ROLES),
                }
            )
            # A conflicted item is intentionally NOT blended into selection_pairs:
            # the household must pick one before it feeds the profile prose.
        elif authoritative:
            chosen = next(iter(distinct.values()))
            result.selection_pairs.append((chosen.item, chosen.choice))
            entry = {
                "item": chosen.item,
                "choice": chosen.choice,
                "by": chosen.display_name,
                "authoritative": True,
            }
            if room is not None:
                result.per_room.setdefault(room, []).append(entry)

        # Advisory voices are always surfaced (never silenced), never a conflict.
        for c in advisory:
            entry = {
                "item": c.item,
                "choice": c.choice,
                "by": c.display_name,
                "authoritative": False,
            }
            if room is not None:
                result.per_room.setdefault(room, []).append(entry)

    # --- contributors roster (deterministic by first appearance) -------------
    for c in contributor_ids.values():
        result.contributors.append(
            {
                "member_id": str(c.member_id) if c.member_id else None,
                "sub_role": c.sub_role,
                "name": c.display_name,
                "authoritative": c.authoritative,
            }
        )

    return result
