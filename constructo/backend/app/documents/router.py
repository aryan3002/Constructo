"""Company document CRUD + presign (W5 Slice 2b).

Documents cover company-level artefacts with optional expiry: contracts, BOQ,
NOC, insurance, licences, and other.  They are editable + archivable (unlike
drawings which are append-only versioned).

GET  /api/v1/documents            — any member; company-scoped; resolves URLs
POST /api/v1/documents            — owner / pm / architect only
PATCH /api/v1/documents/{doc_id} — owner / pm / architect only
POST /api/v1/documents/presign    — any member
"""
from __future__ import annotations

from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.common.errors import AppError
from app.db import get_session
from app.documents.schemas import (
    DocPresignIn,
    DocPresignOut,
    DocumentCreateIn,
    DocumentOut,
    DocumentUpdateIn,
)
from app.models import User, UserRole
from app.models.company_document import CompanyDocument
from app.storage import get_storage

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])


def _resolve(doc: CompanyDocument) -> DocumentOut:
    storage = get_storage()
    resolved_url = storage.url_for(doc.file_url) or doc.file_url
    return DocumentOut(
        id=doc.id,
        company_id=doc.company_id,
        site_id=doc.site_id,
        doc_type=doc.doc_type,
        title=doc.title,
        file_url=resolved_url,
        expiry_on=doc.expiry_on,
        notes=doc.notes,
        is_active=doc.is_active,
        created_by=doc.created_by,
        created_at=doc.created_at,
    )


@router.get("", response_model=list[DocumentOut])
async def list_documents(
    include_archived: bool = Query(False),
    site_id: UUID | None = Query(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[DocumentOut]:
    """List company documents, newest first.

    Optionally filter by site_id (caller must be able to see that site).
    Archived documents (is_active=false) are excluded unless include_archived=true.
    file_url is resolved to a presigned GET URL via the process-wide storage backend.
    """
    if site_id is not None:
        from app.sites.router import effective_visible_site_ids

        visible = await effective_visible_site_ids(session, user)
        if site_id not in visible:
            raise AppError(403, "forbidden", "Site not in scope")

    stmt = select(CompanyDocument).where(CompanyDocument.company_id == user.company_id)
    if not include_archived:
        stmt = stmt.where(CompanyDocument.is_active.is_(True))
    if site_id is not None:
        stmt = stmt.where(CompanyDocument.site_id == site_id)
    stmt = stmt.order_by(CompanyDocument.created_at.desc())

    rows = (await session.execute(stmt)).scalars().all()
    return [_resolve(r) for r in rows]


@router.post("/presign", response_model=DocPresignOut)
async def presign_document(
    body: DocPresignIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DocPresignOut:
    """Mint a short-lived direct-to-R2 upload ticket for a new document.

    When the storage backend is local (dev / tests) presigned_put raises
    NotImplementedError; we return mode="unavailable" with put_url=None and
    status 200 so the web app can fall back to the server-side upload path.
    """
    suffix = Path(body.filename).suffix
    key = f"documents/{user.company_id}/{uuid4().hex}{suffix}"
    storage = get_storage()
    try:
        ticket = storage.presigned_put(key, body.content_type)
        return DocPresignOut(key=ticket["key"], put_url=ticket["url"], mode="presigned")
    except NotImplementedError:
        return DocPresignOut(key=key, put_url=None, mode="unavailable")


@router.post("", response_model=DocumentOut, status_code=201)
async def create_document(
    body: DocumentCreateIn,
    user: User = Depends(require_role(UserRole.owner, UserRole.pm, UserRole.architect)),
    session: AsyncSession = Depends(get_session),
) -> DocumentOut:
    """Create a company document (owner / pm / architect)."""
    if body.site_id is not None:
        from app.sites.router import effective_visible_site_ids

        visible = await effective_visible_site_ids(session, user)
        if body.site_id not in visible:
            raise AppError(403, "forbidden", "Site not in scope")

    doc = CompanyDocument(
        company_id=user.company_id,
        created_by=user.id,
        **body.model_dump(),
    )
    session.add(doc)
    await session.commit()
    await session.refresh(doc)
    return _resolve(doc)


@router.patch("/{doc_id}", response_model=DocumentOut)
async def update_document(
    doc_id: UUID,
    body: DocumentUpdateIn,
    user: User = Depends(require_role(UserRole.owner, UserRole.pm, UserRole.architect)),
    session: AsyncSession = Depends(get_session),
) -> DocumentOut:
    """Partial edit of a company document (owner / pm / architect).

    Cross-company access returns 404 to avoid leaking IDs.
    """
    doc = await session.get(CompanyDocument, doc_id)
    if doc is None or doc.company_id != user.company_id:
        raise AppError(404, "not_found", "Document not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)
    await session.commit()
    await session.refresh(doc)
    return _resolve(doc)
