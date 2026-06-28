"""Audit endpoints (Labs) — AI-assisted site quality inspection.

An owner requests a quality audit of a site; a site engineer inspects per
work-section; the result is a deterministically scored report with actionable
findings.

Determinism Doctrine: every numeric score is computed by pure Python from the
inspection items/sections — never by an LLM. The injected LLM may only draft a
one-line note for a finding that has none (during finalize). Visibility mirrors
sites; all access is company-scoped.
"""
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.schemas import (
    AuditCreate,
    AuditDetailOut,
    AuditOut,
    AuditUpdate,
    FindingCreate,
    FindingOut,
    FindingUpdate,
    SectionOut,
    SectionUpsert,
)
from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.common.pagination import DEFAULT_LIMIT, MAX_LIMIT, Page, decode_cursor, encode_cursor
from app.db import get_session
from app.extraction.llm import LLMClient, get_llm_client
from app.models import (
    Audit,
    AuditFinding,
    AuditSection,
    AuditStatus,
    FindingStatus,
    Site,
    User,
)
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1/audits", tags=["audits"])

_FINDING_NOTE_SYSTEM = (
    "You write a single short note (max one sentence) for a site quality-audit "
    "finding, so an engineer knows what to fix. You are given the finding title, "
    "severity, room and location. Be concrete and terse. Never invent facts beyond "
    "what is given. Return strict JSON {\"note\": \"<text>\"}."
)
_FINDING_NOTE_SCHEMA = {
    "type": "object",
    "properties": {"note": {"type": "string"}},
    "required": ["note"],
}


def get_llm() -> LLMClient:
    """Injectable LLM client (overridden in tests with a FakeLLMClient)."""
    return get_llm_client()


def _parse_limit(limit: int) -> int:
    if limit <= 0:
        return DEFAULT_LIMIT
    return min(limit, MAX_LIMIT)


def _decode(cursor: str | None) -> str | None:
    try:
        return decode_cursor(cursor)
    except ValueError as exc:
        raise AppError(400, "invalid_cursor", "Malformed pagination cursor") from exc


async def _assert_site_visible(session: AsyncSession, user: User, site_id: UUID) -> None:
    visible = await effective_visible_site_ids(session, user)
    if site_id in visible:
        return
    site = await session.get(Site, site_id)
    if site is None or site.company_id != user.company_id:
        raise AppError(404, "not_found", "Site not found")
    raise AppError(403, "forbidden", "Site not in scope")


async def _scoped_audit_or_error(session: AsyncSession, user: User, audit_id: UUID) -> Audit:
    audit = await session.get(Audit, audit_id)
    if audit is None or audit.company_id != user.company_id:
        raise AppError(404, "not_found", "Audit not found")
    visible = await effective_visible_site_ids(session, user)
    if audit.site_id not in visible:
        raise AppError(403, "forbidden", "Audit not in scope")
    return audit


async def _scoped_finding_or_error(
    session: AsyncSession, user: User, finding_id: UUID
) -> AuditFinding:
    finding = await session.get(AuditFinding, finding_id)
    if finding is None or finding.company_id != user.company_id:
        raise AppError(404, "not_found", "Finding not found")
    visible = await effective_visible_site_ids(session, user)
    if finding.site_id not in visible:
        raise AppError(403, "forbidden", "Finding not in scope")
    return finding


# ---- deterministic scoring -------------------------------------------------


def _section_counts(items: list[dict]) -> tuple[int, int, int]:
    """Pure: (pass, obs, fail) counts from inspection items."""
    p = sum(1 for i in items if i.get("status") == "ok")
    o = sum(1 for i in items if i.get("status") == "obs")
    f = sum(1 for i in items if i.get("status") == "fail")
    return p, o, f


def _section_score(p: int, o: int, f: int) -> int | None:
    """Pure: round(100 * (pass + 0.5*obs) / total); None when no items."""
    total = p + o + f
    if total == 0:
        return None
    return round(100 * (p + 0.5 * o) / total)


# ---- mappers ---------------------------------------------------------------


def _audit_out(a: Audit) -> AuditOut:
    return AuditOut(
        id=a.id,
        company_id=a.company_id,
        site_id=a.site_id,
        status=a.status,
        score=a.score,
        requested_by=a.requested_by,
        conducted_by=a.conducted_by,
        scheduled_for=a.scheduled_for,
        requested_at=a.requested_at,
        conducted_at=a.conducted_at,
        created_at=a.created_at,
    )


def _section_out(s: AuditSection) -> SectionOut:
    return SectionOut(
        id=s.id,
        audit_id=s.audit_id,
        name=s.name,
        position=s.position,
        score=s.score,
        pass_count=s.pass_count,
        obs_count=s.obs_count,
        fail_count=s.fail_count,
        items=list(s.items or []),
    )


def _finding_out(f: AuditFinding) -> FindingOut:
    return FindingOut(
        id=f.id,
        audit_id=f.audit_id,
        company_id=f.company_id,
        site_id=f.site_id,
        title=f.title,
        severity=f.severity,
        room=f.room,
        location=f.location,
        status=f.status,
        assignee_id=f.assignee_id,
        note=f.note,
        photo_url=f.photo_url,
        created_at=f.created_at,
    )


async def _sections_for(session: AsyncSession, audit_id: UUID) -> list[AuditSection]:
    rows = await session.execute(
        select(AuditSection)
        .where(AuditSection.audit_id == audit_id)
        .order_by(AuditSection.position, AuditSection.id)
    )
    return list(rows.scalars().all())


async def _findings_for(session: AsyncSession, audit_id: UUID) -> list[AuditFinding]:
    rows = await session.execute(
        select(AuditFinding)
        .where(AuditFinding.audit_id == audit_id)
        .order_by(AuditFinding.created_at, AuditFinding.id)
    )
    return list(rows.scalars().all())


# ---- endpoints -------------------------------------------------------------


@router.post("", response_model=AuditOut, status_code=201)
async def create_audit(
    body: AuditCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AuditOut:
    await _assert_site_visible(session, user, body.site_id)
    audit = Audit(
        company_id=user.company_id,
        site_id=body.site_id,
        status=AuditStatus.requested,
        requested_by=user.id,
        conducted_by=body.conducted_by,
        scheduled_for=body.scheduled_for,
    )
    session.add(audit)
    await session.flush()
    for pos, name in enumerate(body.sections):
        session.add(
            AuditSection(
                audit_id=audit.id,
                name=name,
                position=pos,
                items=[],
                pass_count=0,
                obs_count=0,
                fail_count=0,
            )
        )
    await session.commit()
    return _audit_out(audit)


@router.get("", response_model=Page[AuditOut])
async def list_audits(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
    status: AuditStatus | None = Query(None),
    limit: int = Query(DEFAULT_LIMIT),
    cursor: str | None = Query(None),
) -> Page[AuditOut]:
    visible = await effective_visible_site_ids(session, user)
    if not visible:
        return Page[AuditOut](items=[], next_cursor=None)

    stmt = select(Audit).where(
        Audit.company_id == user.company_id, Audit.site_id.in_(visible)
    )
    if site_id is not None:
        stmt = stmt.where(Audit.site_id == site_id)
    if status is not None:
        stmt = stmt.where(Audit.status == status)

    page_size = _parse_limit(limit)
    after = _decode(cursor)
    stmt = stmt.order_by(Audit.requested_at.desc(), Audit.id)
    if after is not None:
        stmt = stmt.where(Audit.id > UUID(after))
    stmt = stmt.limit(page_size + 1)

    rows = list((await session.execute(stmt)).scalars().all())
    next_cursor = None
    if len(rows) > page_size:
        rows = rows[:page_size]
        next_cursor = encode_cursor(str(rows[-1].id))
    return Page[AuditOut](items=[_audit_out(a) for a in rows], next_cursor=next_cursor)


@router.get("/{audit_id}", response_model=AuditDetailOut)
async def get_audit(
    audit_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AuditDetailOut:
    audit = await _scoped_audit_or_error(session, user, audit_id)
    sections = await _sections_for(session, audit.id)
    findings = await _findings_for(session, audit.id)
    base = _audit_out(audit)
    return AuditDetailOut(
        **base.model_dump(),
        sections=[_section_out(s) for s in sections],
        findings=[_finding_out(f) for f in findings],
    )


@router.patch("/{audit_id}", response_model=AuditOut)
async def update_audit(
    audit_id: UUID,
    body: AuditUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AuditOut:
    audit = await _scoped_audit_or_error(session, user, audit_id)
    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(audit, field, value)
    await session.commit()
    return _audit_out(audit)


@router.post("/{audit_id}/sections", response_model=SectionOut)
async def upsert_section(
    audit_id: UUID,
    body: SectionUpsert,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SectionOut:
    audit = await _scoped_audit_or_error(session, user, audit_id)
    items = [{"label": i.label, "status": i.status} for i in body.items]
    p, o, f = _section_counts(items)
    score = _section_score(p, o, f)

    existing = (
        await session.execute(
            select(AuditSection).where(
                AuditSection.audit_id == audit.id, AuditSection.name == body.name
            )
        )
    ).scalars().first()

    if existing is None:
        # Append after the current max position.
        sections = await _sections_for(session, audit.id)
        next_pos = (max((s.position for s in sections), default=-1)) + 1
        existing = AuditSection(audit_id=audit.id, name=body.name, position=next_pos)
        session.add(existing)

    existing.items = items
    existing.pass_count = p
    existing.obs_count = o
    existing.fail_count = f
    existing.score = score
    await session.commit()
    return _section_out(existing)


@router.post("/{audit_id}/score", response_model=AuditDetailOut)
async def finalize_audit(
    audit_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> AuditDetailOut:
    audit = await _scoped_audit_or_error(session, user, audit_id)
    sections = await _sections_for(session, audit.id)

    # DETERMINISTIC overall: round(mean of section scores that are not None).
    scored = [s.score for s in sections if s.score is not None]
    if scored:
        audit.score = round(sum(scored) / len(scored))
    audit.status = AuditStatus.completed
    audit.conducted_at = datetime.now(UTC)

    # The LLM may ONLY draft a one-line note for a finding that has none.
    findings = await _findings_for(session, audit.id)
    for finding in findings:
        if finding.note and finding.note.strip():
            continue
        user_prompt = (
            f"Finding: {finding.title}. Severity: {finding.severity.value}. "
            f"Room: {finding.room or '-'}. Location: {finding.location or '-'}."
        )
        try:
            result = await llm.complete(
                _FINDING_NOTE_SYSTEM, user_prompt, _FINDING_NOTE_SCHEMA
            )
            note = result.get("note") if isinstance(result, dict) else None
            if isinstance(note, str) and note.strip():
                finding.note = note.strip()
        except Exception:  # noqa: BLE001 - LLM is best-effort; score stays pure Python
            pass

    await session.commit()
    sections = await _sections_for(session, audit.id)
    findings = await _findings_for(session, audit.id)
    base = _audit_out(audit)
    return AuditDetailOut(
        **base.model_dump(),
        sections=[_section_out(s) for s in sections],
        findings=[_finding_out(f) for f in findings],
    )


@router.post("/{audit_id}/findings", response_model=FindingOut, status_code=201)
async def add_finding(
    audit_id: UUID,
    body: FindingCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FindingOut:
    audit = await _scoped_audit_or_error(session, user, audit_id)
    # Idempotent: a retry / double-tap of the same defect (a non-transactional
    # submit loop re-runs every addFinding) must not duplicate an owner-visible
    # finding. Reuse an existing OPEN finding with the same (title, location).
    existing = (
        await session.execute(
            select(AuditFinding).where(
                AuditFinding.audit_id == audit.id,
                AuditFinding.title == body.title,
                AuditFinding.location == body.location,
                AuditFinding.status == FindingStatus.open,
            )
        )
    ).scalars().first()
    if existing is not None:
        return _finding_out(existing)
    finding = AuditFinding(
        audit_id=audit.id,
        company_id=audit.company_id,
        site_id=audit.site_id,
        title=body.title,
        severity=body.severity,
        room=body.room,
        location=body.location,
        status=FindingStatus.open,
        note=body.note,
        photo_url=body.photo_url,
    )
    session.add(finding)
    await session.commit()
    return _finding_out(finding)


@router.patch("/findings/{finding_id}", response_model=FindingOut)
async def update_finding(
    finding_id: UUID,
    body: FindingUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FindingOut:
    finding = await _scoped_finding_or_error(session, user, finding_id)
    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(finding, field, value)
    await session.commit()
    return _finding_out(finding)
