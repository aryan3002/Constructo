"""Survey endpoints (Labs) — SiteSync first-visit intake.

A first site visit captured as a structured intake. The risk score and
filled_pct are computed deterministically in Python (Determinism Doctrine); the
injected LLM may only draft the ``ai_analysis`` prose. A survey can pre-date its
Site, so it carries its own company_id and an optional site_id; onboarding
creates+links a Site. All access is company-scoped.
"""
import json
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.common.pagination import DEFAULT_LIMIT, MAX_LIMIT, Page, decode_cursor, encode_cursor
from app.db import get_session
from app.extraction.llm import LLMClient, get_llm_client
from app.models import Site, Survey, SurveyStatus, User, UserRole
from app.survey.schemas import SurveyCreate, SurveyOut, SurveyUpdate

router = APIRouter(prefix="/api/v1/surveys", tags=["surveys"])

_RISK_WEIGHTS = {"Low": 10, "Medium": 30, "High": 60}

# Core intake fields that count toward filled_pct (deterministic completeness).
_CORE_FIELDS = (
    "area",
    "client_name",
    "architect_name",
    "project_type",
    "address",
    "gps",
    "plot",
    "approvals",
    "risks",
    "requirement",
)

_ANALYSIS_SYSTEM = (
    "You are a site-survey analyst for a construction firm. Given a structured "
    "first-visit intake (plot, approvals, risks, requirement), write a short "
    "plain-language analysis (2-4 sentences) for the project team. Never invent "
    "facts beyond the intake. Return strict JSON {\"analysis\": \"<text>\"}."
)
_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {"analysis": {"type": "string"}},
    "required": ["analysis"],
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


async def _scoped_survey_or_error(
    session: AsyncSession, user: User, survey_id: UUID
) -> Survey:
    survey = await session.get(Survey, survey_id)
    if survey is None or survey.company_id != user.company_id:
        raise AppError(404, "not_found", "Survey not found")
    return survey


# ---- deterministic computation ---------------------------------------------


def _risk_score(risks: list) -> int | None:
    """Pure: mean of per-risk weights (Low=10/Medium=30/High=60); None if empty."""
    weights = [
        _RISK_WEIGHTS[r["level"]]
        for r in (risks or [])
        if isinstance(r, dict) and r.get("level") in _RISK_WEIGHTS
    ]
    if not weights:
        return None
    return round(sum(weights) / len(weights))


def _is_filled(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list | dict):
        return len(value) > 0
    return True


def _filled_pct(survey: Survey) -> int:
    """Pure: percentage of core intake fields that are non-empty."""
    filled = sum(1 for f in _CORE_FIELDS if _is_filled(getattr(survey, f)))
    return round(100 * filled / len(_CORE_FIELDS))


def _survey_out(s: Survey) -> SurveyOut:
    return SurveyOut(
        id=s.id,
        company_id=s.company_id,
        site_id=s.site_id,
        name=s.name,
        code=s.code,
        status=s.status,
        risk_score=s.risk_score,
        filled_pct=s.filled_pct,
        photo_count=s.photo_count,
        area=s.area,
        client_name=s.client_name,
        engineer_id=s.engineer_id,
        architect_name=s.architect_name,
        project_type=s.project_type,
        address=s.address,
        gps=s.gps,
        plot=dict(s.plot or {}),
        approvals=list(s.approvals or []),
        approval_status=s.approval_status,
        conditions=list(s.conditions or []),
        risks=list(s.risks or []),
        requirement=s.requirement,
        ai_analysis=s.ai_analysis,
        created_by=s.created_by,
        created_at=s.created_at,
        submitted_at=s.submitted_at,
    )


# ---- endpoints -------------------------------------------------------------


@router.post("", response_model=SurveyOut, status_code=201)
async def create_survey(
    body: SurveyCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SurveyOut:
    survey = Survey(
        company_id=user.company_id,
        site_id=body.site_id,
        name=body.name,
        code=body.code,
        status=SurveyStatus.draft,
        area=body.area,
        client_name=body.client_name,
        engineer_id=body.engineer_id,
        architect_name=body.architect_name,
        project_type=body.project_type,
        address=body.address,
        gps=body.gps,
        plot=body.plot or {},
        approvals=body.approvals or [],
        approval_status=body.approval_status,
        conditions=body.conditions or [],
        risks=body.risks or [],
        requirement=body.requirement,
        photo_count=body.photo_count or 0,
        created_by=user.id,
    )
    session.add(survey)
    await session.commit()
    return _survey_out(survey)


@router.get("", response_model=Page[SurveyOut])
async def list_surveys(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
    status: SurveyStatus | None = Query(None),
    limit: int = Query(DEFAULT_LIMIT),
    cursor: str | None = Query(None),
) -> Page[SurveyOut]:
    stmt = select(Survey).where(Survey.company_id == user.company_id)
    if site_id is not None:
        stmt = stmt.where(Survey.site_id == site_id)
    if status is not None:
        stmt = stmt.where(Survey.status == status)

    page_size = _parse_limit(limit)
    after = _decode(cursor)
    stmt = stmt.order_by(Survey.created_at.desc(), Survey.id)
    if after is not None:
        stmt = stmt.where(Survey.id > UUID(after))
    stmt = stmt.limit(page_size + 1)

    rows = list((await session.execute(stmt)).scalars().all())
    next_cursor = None
    if len(rows) > page_size:
        rows = rows[:page_size]
        next_cursor = encode_cursor(str(rows[-1].id))
    return Page[SurveyOut](items=[_survey_out(s) for s in rows], next_cursor=next_cursor)


@router.get("/{survey_id}", response_model=SurveyOut)
async def get_survey(
    survey_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SurveyOut:
    survey = await _scoped_survey_or_error(session, user, survey_id)
    return _survey_out(survey)


@router.patch("/{survey_id}", response_model=SurveyOut)
async def update_survey(
    survey_id: UUID,
    body: SurveyUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SurveyOut:
    survey = await _scoped_survey_or_error(session, user, survey_id)
    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(survey, field, value)
    await session.commit()
    return _survey_out(survey)


@router.post("/{survey_id}/analyze", response_model=SurveyOut)
async def analyze_survey(
    survey_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> SurveyOut:
    survey = await _scoped_survey_or_error(session, user, survey_id)

    # DETERMINISTIC: risk_score + filled_pct are pure Python.
    survey.risk_score = _risk_score(list(survey.risks or []))
    survey.filled_pct = _filled_pct(survey)

    # The LLM may ONLY draft the prose analysis.
    payload = {
        "name": survey.name,
        "area": survey.area,
        "project_type": survey.project_type,
        "plot": dict(survey.plot or {}),
        "approvals": list(survey.approvals or []),
        "risks": list(survey.risks or []),
        "requirement": survey.requirement,
    }
    try:
        result = await llm.complete(
            _ANALYSIS_SYSTEM, json.dumps(payload, ensure_ascii=False), _ANALYSIS_SCHEMA
        )
        # FakeLLMClient returns a generic structured payload; prefer an
        # "analysis" key, else fall back to its "summary".
        text = None
        if isinstance(result, dict):
            text = result.get("analysis") or result.get("summary")
        if isinstance(text, str) and text.strip():
            survey.ai_analysis = text.strip()
    except Exception:  # noqa: BLE001 - LLM is best-effort; scores stay pure Python
        pass

    survey.status = SurveyStatus.submitted
    survey.submitted_at = datetime.now(UTC)
    await session.commit()
    return _survey_out(survey)


@router.post("/{survey_id}/onboard", response_model=SurveyOut)
async def onboard_survey(
    survey_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SurveyOut:
    if user.role not in (UserRole.owner, UserRole.pm):
        raise AppError(403, "forbidden", "Only owner/pm can onboard a survey")
    survey = await _scoped_survey_or_error(session, user, survey_id)

    if survey.site_id is None:
        site = Site(company_id=user.company_id, name=survey.name)
        session.add(site)
        await session.flush()
        survey.site_id = site.id
    survey.status = SurveyStatus.onboarded
    await session.commit()
    return _survey_out(survey)
