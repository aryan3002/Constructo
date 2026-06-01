"""Unit tests for the pure multi-member design reducer (proposal C).

The reducer is pure (no I/O), so it is exercised directly with plain dataclasses
— no DB, no LLM. These lock the founder-locked aggregation policy: owners are
authoritative everywhere, granted members per scope, advisors never authoritative,
and divergence among authoritative members becomes a calm conflict (never picked).
"""
from uuid import uuid4

from app.homeowner.design_fingerprint import (
    MemberInfo,
    ReferenceInput,
    SelectionInput,
    build_fingerprint,
)
from app.models import HomeownerSubRole


def _members(*infos: MemberInfo) -> dict:
    return {m.id: m for m in infos}


def test_unattributed_rows_are_household_no_phantom_conflict():
    # Two legacy NULL-attributed selections diverging on the same item must NOT
    # manufacture a conflict — both are the single household/primary voice.
    fp = build_fingerprint(
        selections=[
            SelectionInput(item="Kitchen counter", choice="quartz"),
            SelectionInput(item="kitchen counter", choice="granite"),
        ],
        references=[],
        members={},
    )
    assert fp.conflicts == []
    # Both fold into the household's authoritative picks (no false fight).
    assert ("kitchen counter", "granite") in fp.selection_pairs or (
        "Kitchen counter", "quartz"
    ) in fp.selection_pairs


def test_two_owners_diverge_is_a_conflict_never_auto_resolved():
    a = MemberInfo(id=uuid4(), sub_role=HomeownerSubRole.primary_owner, display_name="Priya")
    b = MemberInfo(id=uuid4(), sub_role=HomeownerSubRole.co_owner, display_name="Rahul")
    fp = build_fingerprint(
        selections=[
            SelectionInput(item="Worktop", choice="matte quartz", actor_member_id=a.id),
            SelectionInput(item="Worktop", choice="glossy granite", actor_member_id=b.id),
        ],
        references=[],
        members=_members(a, b),
    )
    assert len(fp.conflicts) == 1
    conflict = fp.conflicts[0]
    assert conflict["item"] == "Worktop"
    assert {o["choice"] for o in conflict["options"]} == {"matte quartz", "glossy granite"}
    assert {o["by"] for o in conflict["options"]} == {"Priya", "Rahul"}
    # The reducer NEVER picks a winner: a conflicted item is excluded from picks.
    assert ("Worktop", "matte quartz") not in fp.selection_pairs
    assert ("Worktop", "glossy granite") not in fp.selection_pairs


def test_two_owners_agree_is_fingerprint_material_not_conflict():
    a = MemberInfo(id=uuid4(), sub_role=HomeownerSubRole.primary_owner)
    b = MemberInfo(id=uuid4(), sub_role=HomeownerSubRole.co_owner)
    fp = build_fingerprint(
        selections=[
            SelectionInput(item="Floor", choice="oak", actor_member_id=a.id),
            SelectionInput(item="floor", choice="OAK", actor_member_id=b.id),
        ],
        references=[],
        members=_members(a, b),
    )
    assert fp.conflicts == []
    assert ("Floor", "oak") in fp.selection_pairs


def test_advisor_is_never_authoritative_even_with_can_design():
    owner = MemberInfo(id=uuid4(), sub_role=HomeownerSubRole.primary_owner)
    # An advisor mistakenly granted can_design must stay advisory (authority guard).
    advisor = MemberInfo(
        id=uuid4(), sub_role=HomeownerSubRole.advisor, can_design=True, display_name="Neha"
    )
    fp = build_fingerprint(
        selections=[
            SelectionInput(item="Lighting", choice="warm pendant", actor_member_id=owner.id),
            SelectionInput(item="Lighting", choice="cool track", actor_member_id=advisor.id),
        ],
        references=[],
        members=_members(owner, advisor),
    )
    # Advisor divergence is NOT a conflict — owner's pick is the authoritative one.
    assert fp.conflicts == []
    assert ("Lighting", "warm pendant") in fp.selection_pairs
    # The advisor remains a surfaced contributor, just non-authoritative.
    advisor_row = next(c for c in fp.contributors if c["name"] == "Neha")
    assert advisor_row["authoritative"] is False


def test_family_advisory_unless_granted_in_scope():
    owner = MemberInfo(id=uuid4(), sub_role=HomeownerSubRole.primary_owner)
    room = uuid4()
    other = uuid4()
    # Family granted a say ONLY in `room`.
    fam = MemberInfo(
        id=uuid4(), sub_role=HomeownerSubRole.family, can_design=True, design_space_id=room
    )
    fp = build_fingerprint(
        selections=[
            # In-scope: family is authoritative here → diverges with owner → conflict.
            SelectionInput(item="Tiles", choice="white", actor_member_id=owner.id, space_id=room),
            SelectionInput(item="Tiles", choice="blue", actor_member_id=fam.id, space_id=room),
            # Out-of-scope: family is advisory → no conflict with owner.
            SelectionInput(item="Paint", choice="cream", actor_member_id=owner.id, space_id=other),
            SelectionInput(item="Paint", choice="teal", actor_member_id=fam.id, space_id=other),
        ],
        references=[],
        members=_members(owner, fam),
    )
    # Exactly one conflict, in the granted room only.
    assert len(fp.conflicts) == 1
    assert fp.conflicts[0]["item"] == "Tiles"
    assert str(fp.conflicts[0]["room"]) == str(room)
    # The out-of-scope room keeps the owner's authoritative paint, no conflict.
    assert ("Paint", "cream") in fp.selection_pairs


def test_decided_status_resolves_a_conflict():
    a = MemberInfo(id=uuid4(), sub_role=HomeownerSubRole.primary_owner)
    b = MemberInfo(id=uuid4(), sub_role=HomeownerSubRole.co_owner)
    fp = build_fingerprint(
        selections=[
            SelectionInput(item="Worktop", choice="quartz", actor_member_id=a.id),
            SelectionInput(item="Worktop", choice="granite", actor_member_id=b.id),
            # A human resolution: a decided pick settles the (item, room) group.
            SelectionInput(
                item="Worktop", choice="quartz", actor_member_id=a.id, status="selected"
            ),
        ],
        references=[],
        members=_members(a, b),
    )
    assert fp.conflicts == []
    assert ("Worktop", "quartz") in fp.selection_pairs


def test_reference_authors_become_contributors():
    owner = MemberInfo(id=uuid4(), sub_role=HomeownerSubRole.primary_owner, display_name="Priya")
    fp = build_fingerprint(
        selections=[],
        references=[ReferenceInput(actor_member_id=owner.id, room_tag="kitchen")],
        members=_members(owner),
    )
    assert "kitchen" in fp.reference_tags
    assert any(c["name"] == "Priya" for c in fp.contributors)
