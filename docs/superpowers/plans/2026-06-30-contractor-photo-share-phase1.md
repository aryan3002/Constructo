# Contractor Photo Share — Phase 1 (Core Bridge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any crew member share a site photo through a deliberate "Share with owner" surface so the homeowner sees it immediately, with the photo decoupled from its (optional, AI-drafted) caption, a one-tap room tag, and a contractor album to view + edit what's been shared.

**Architecture:** Reuse the existing `POST /api/v1/publish/photo` (already creates a `PublishedPhoto`, honours the honest-AI caption gate, and is open to any in-scope crew member) and the existing chat presign upload path. Add three small backend endpoints (edit, contractor list, advisory enrich). On mobile, add a contractor API module, an upload helper, a "Share with owner" capture screen, and an "Album" management screen, registered as off-tab screens in the contractor owner subtree.

**Tech Stack:** Backend — FastAPI, SQLAlchemy (async), pytest (`pytest-asyncio`). Mobile — Expo Router, React Native, TypeScript, React Query, Jest (`jest-expo`).

## Global Constraints

- **Honest-AI gate (load-bearing — never break):** raw AI/vision text is NEVER auto-written to the homeowner-visible `caption`. AI output is only ever a *draft* the contractor confirms with an explicit tap. A photo published with `caption=None` is correct and renders fine.
- **Vision is a Fake today:** `get_llm_client("vision")` returns `FakeLLMClient` when no creds are set (`app/extraction/llm.py:402`). Treat caption/room suggestions as *advisory pre-fill only* — never a gate, never blind-applied.
- **NO unshare in Phase 1:** there is no soft-delete and no delete endpoint. Once shared, a photo stays in the feed; only its caption/room/pin can be edited. (An owner-only delete is a deliberate later add if the pilot needs it.)
- **Any crew role may share:** `publish_photo` is gated only by `get_current_user` + site scope — no role narrowing. Do not add a role gate to sharing.
- **Manage RBAC (edit only):** editing caption/room/pin is allowed only when `user.role == UserRole.owner` OR `photo.published_by == user.id` (owner-any / crew-own).
- **Site scoping:** every contractor endpoint calls `await _assert_site(session, user, site_id)` (`app/publish/router.py:85`).
- **R2 key reuse:** Door-A uploads reuse the chat presign endpoint (`POST /api/v1/chat/media/presign`, `kind="image"`); the canonical PUT content-type is `image/jpeg`.
- **Mobile tests live in `src/`, NEVER under `app/`** (Expo Router evaluates every `app/` module at startup).
- **Backend test fixtures:** `client`, `ctx` (`.company/.owner/.site/.homeowner/.member`), `auth(user)`, `fake_llm`, `factory`, `db_session` — from `constructo/backend/tests/homeowner/conftest.py`.
- Run backend tests from `constructo/backend` with `uv run pytest`. Run `uv run ruff check` before every commit. Run mobile tests from `constructo/mobile` with `npm test`.

---

## File Structure

**Backend (`constructo/backend`):**
- Modify: `app/publish/router.py` — add `edit_photo`, `list_published_photos`, `enrich_photo`, and `_assert_can_manage`.
- Modify: `app/publish/schemas.py` — add `PhotoPatchIn`, `ContractorPhotoOut`, `EnrichIn`, `EnrichOut`.
- Test: `tests/publish/test_contractor_album.py`.

**Mobile (`constructo/mobile`):**
- Create: `src/api/contractor.ts` (+ `src/api/contractor.test.ts`).
- Create: `src/contractor/photoShare.ts` (+ `src/contractor/photoShare.test.ts`).
- Create: `app/(contractor)/owner/share.tsx`, `app/(contractor)/owner/album.tsx`.
- Modify: `app/(contractor)/owner/_layout.tsx` — register `share` + `album` off-tab.

---

### Task 1: `PATCH /api/v1/publish/photo/{id}` — edit caption / room / pin (manage RBAC)

**Files:**
- Modify: `constructo/backend/app/publish/schemas.py`, `constructo/backend/app/publish/router.py`
- Test: `constructo/backend/tests/publish/test_contractor_album.py`

**Interfaces:**
- Produces: `PhotoPatchIn {caption?, room_tag?, is_starred?}`; `_assert_can_manage(photo, user) -> None`; `PATCH /api/v1/publish/photo/{photo_id}` → `PhotoOut`.

- [ ] **Step 1: Write the failing tests**

Create `constructo/backend/tests/publish/test_contractor_album.py`:

```python
import pytest

from app.auth.tokens import create_access_token
from app.models.user import UserRole

pytestmark = pytest.mark.asyncio


def _auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def _publish(client, ctx, by, image="chat/x/a.jpg"):
    res = await client.post(
        "/api/v1/publish/photo",
        json={"site_id": str(ctx.site.id), "image_url": image, "caption": "x"},
        headers=_auth(by),
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


async def test_owner_edits_caption_and_pin(client, ctx, fake_llm):
    pid = await _publish(client, ctx, ctx.owner)
    res = await client.patch(
        f"/api/v1/publish/photo/{pid}",
        json={"caption": "Kitchen plaster done", "is_starred": True},
        headers=_auth(ctx.owner),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["caption"] == "Kitchen plaster done"
    assert body["is_starred"] is True
    feed = await client.get("/api/v1/homeowner/photos", headers=_auth(ctx.homeowner))
    item = next(i for i in feed.json()["items"] if i["id"] == pid)
    assert item["caption"] == "Kitchen plaster done"


async def test_crew_cannot_edit_others_photo(client, ctx, factory, fake_llm):
    crew = await factory.user(company=ctx.company, role=UserRole.supervisor)
    pid = await _publish(client, ctx, ctx.owner)
    res = await client.patch(
        f"/api/v1/publish/photo/{pid}", json={"caption": "hi"}, headers=_auth(crew)
    )
    assert res.status_code == 403, res.text


async def test_crew_can_edit_own_photo(client, ctx, factory, fake_llm):
    crew = await factory.user(company=ctx.company, role=UserRole.supervisor)
    pid = await _publish(client, ctx, crew)
    res = await client.patch(
        f"/api/v1/publish/photo/{pid}", json={"room_tag": "kitchen"}, headers=_auth(crew)
    )
    assert res.status_code == 200, res.text
    assert res.json()["room_tag"] == "kitchen"
```

> If `app.auth.tokens.create_access_token` import path differs, reuse the `auth` helper already exported by `tests/homeowner/conftest.py`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd constructo/backend && uv run pytest tests/publish/test_contractor_album.py -v`
Expected: FAIL — 405/404 (route not defined).

- [ ] **Step 3: Add the request schema**

In `app/publish/schemas.py`, add:

```python
class PhotoPatchIn(BaseModel):
    """Partial edit of a published photo. Only provided fields change. A
    contractor-supplied caption is a reviewed, homeowner-visible fact."""

    caption: str | None = None
    room_tag: str | None = None
    is_starred: bool | None = None
```

- [ ] **Step 4: Implement the helper + endpoint**

In `app/publish/router.py`, add imports if absent:

```python
from app.models.user import User, UserRole
from app.publish.schemas import PhotoPatchIn
```

Add the helper just below `_assert_site`:

```python
def _assert_can_manage(photo: PublishedPhoto, user: User) -> None:
    """Owner manages any shared photo; a crew member manages only their own."""
    if user.role == UserRole.owner or photo.published_by == user.id:
        return
    raise AppError(403, "forbidden", "Only the owner or the original sharer can change this photo")
```

Add the endpoint after `publish_photo` (`_photo_out` is already used by `publish_photo`; if it lives in `homeowner.router`, import it: `from app.homeowner.router import _photo_out`):

```python
@router.patch("/photo/{photo_id}", response_model=PhotoOut)
async def edit_photo(
    photo_id: UUID,
    body: PhotoPatchIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PhotoOut:
    """Edit caption / room / pin on a shared photo (owner-any, crew-own)."""
    photo = await session.get(PublishedPhoto, photo_id)
    if photo is None:
        raise AppError(404, "not_found", "Photo not found")
    await _assert_site(session, user, photo.site_id)
    _assert_can_manage(photo, user)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(photo, key, value)
    await session.commit()
    await session.refresh(photo)
    return _photo_out(photo)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd constructo/backend && uv run pytest tests/publish/test_contractor_album.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Lint + commit**

```bash
cd constructo/backend && uv run ruff check app/publish/
git add app/publish/router.py app/publish/schemas.py tests/publish/test_contractor_album.py
git commit -m "feat(publish): PATCH edit caption/room/pin with owner-any/crew-own RBAC"
```

---

### Task 2: `GET /api/v1/publish/photos` — contractor album list with attribution

**Files:**
- Modify: `constructo/backend/app/publish/schemas.py`, `constructo/backend/app/publish/router.py`
- Test: `constructo/backend/tests/publish/test_contractor_album.py`

**Interfaces:**
- Produces: `ContractorPhotoOut` (= `PhotoOut` + `shared_by_name: str | None`); `GET /api/v1/publish/photos?site_id&view` → `list[ContractorPhotoOut]`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/publish/test_contractor_album.py`:

```python
async def test_contractor_album_lists_with_attribution(client, ctx, fake_llm):
    pid = await _publish(client, ctx, ctx.owner)
    res = await client.get(
        f"/api/v1/publish/photos?site_id={ctx.site.id}", headers=_auth(ctx.owner)
    )
    assert res.status_code == 200, res.text
    row = next(i for i in res.json() if i["id"] == pid)
    assert "shared_by_name" in row


async def test_album_requires_site_scope(client, ctx, factory, fake_llm):
    other_company = await factory.company()
    outsider = await factory.user(company=other_company, role=UserRole.owner)
    res = await client.get(
        f"/api/v1/publish/photos?site_id={ctx.site.id}", headers=_auth(outsider)
    )
    assert res.status_code in (403, 404), res.text
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd constructo/backend && uv run pytest tests/publish/test_contractor_album.py -k album -v`
Expected: FAIL — route not defined.

- [ ] **Step 3: Add the response schema**

In `app/publish/schemas.py` (ensure `from app.homeowner.schemas import PhotoOut` is imported):

```python
class ContractorPhotoOut(PhotoOut):
    """A published photo as the CONTRACTOR sees it — adds the audit attribution
    the homeowner-facing PhotoOut deliberately omits."""

    shared_by_name: str | None = None
```

- [ ] **Step 4: Implement the endpoint**

In `app/publish/router.py` add `from sqlalchemy import select` (if absent) and `from app.homeowner.router import _photo_out, _bucket_photos_by_milestone`, then:

```python
@router.get("/photos", response_model=list[ContractorPhotoOut])
async def list_published_photos(
    site_id: UUID,
    view: str = "all",
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ContractorPhotoOut]:
    """The contractor's view of the homeowner feed for a site, with attribution,
    for the album/management screen."""
    await _assert_site(session, user, site_id)
    stmt = (
        select(PublishedPhoto, User.name)
        .join(User, PublishedPhoto.published_by == User.id, isouter=True)
        .where(PublishedPhoto.site_id == site_id)
    )
    if view == "room":
        stmt = stmt.order_by(PublishedPhoto.room_tag, PublishedPhoto.published_at.desc())
    elif view == "milestone":
        stmt = stmt.order_by(PublishedPhoto.milestone_id, PublishedPhoto.published_at.desc())
    else:
        stmt = stmt.order_by(PublishedPhoto.published_at.desc())
    rows = (await session.execute(stmt)).all()
    base = await _bucket_photos_by_milestone(
        session, site_id, [_photo_out(p) for p, _ in rows]
    )
    return [
        ContractorPhotoOut(**out.model_dump(), shared_by_name=name)
        for (_, name), out in zip(rows, base, strict=True)
    ]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd constructo/backend && uv run pytest tests/publish/test_contractor_album.py -k album -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Lint + commit**

```bash
cd constructo/backend && uv run ruff check app/publish/
git add app/publish/router.py app/publish/schemas.py tests/publish/test_contractor_album.py
git commit -m "feat(publish): contractor album list with shared-by attribution"
```

---

### Task 3: `POST /api/v1/publish/photo/enrich` — advisory caption/room pre-fill

**Files:**
- Modify: `constructo/backend/app/publish/schemas.py`, `constructo/backend/app/publish/router.py`
- Test: `constructo/backend/tests/publish/test_contractor_album.py`

**Interfaces:**
- Produces: `EnrichIn {site_id, image_url, room_tag?}`, `EnrichOut {caption_draft, room_hint}`; `POST /api/v1/publish/photo/enrich` → `EnrichOut`. Persists nothing.

- [ ] **Step 1: Write the failing test**

Append to `tests/publish/test_contractor_album.py` (add `from sqlalchemy import select` and `from app.models.homeowner_feed import PublishedPhoto` to the imports):

```python
async def test_enrich_returns_advisory_draft_and_persists_nothing(client, ctx, db_session, fake_llm):
    before = len((await db_session.execute(select(PublishedPhoto))).all())
    res = await client.post(
        "/api/v1/publish/photo/enrich",
        json={"site_id": str(ctx.site.id), "image_url": "chat/x/a.jpg"},
        headers=_auth(ctx.owner),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert "caption_draft" in body and "room_hint" in body
    after = len((await db_session.execute(select(PublishedPhoto))).all())
    assert after == before
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/publish/test_contractor_album.py -k enrich -v`
Expected: FAIL — route not defined.

- [ ] **Step 3: Add the schemas**

In `app/publish/schemas.py`:

```python
class EnrichIn(BaseModel):
    site_id: UUID
    image_url: str = Field(min_length=1)
    room_tag: str | None = None


class EnrichOut(BaseModel):
    caption_draft: str | None = None
    room_hint: str | None = None
```

- [ ] **Step 4: Implement the endpoint**

In `app/publish/router.py` (import `from app.extraction.vision import caption_photo` and the new schemas):

```python
@router.post("/photo/enrich", response_model=EnrichOut)
async def enrich_photo(
    body: EnrichIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> EnrichOut:
    """Advisory pre-fill for the Share sheet: a caption DRAFT + a room hint from
    the image. Persists nothing; the contractor confirms with a tap. Vision is a
    Fake today, so this is a suggestion only — never auto-applied."""
    await _assert_site(session, user, body.site_id)
    try:
        result = await caption_photo(body.image_url, llm=llm, user_hint=body.room_tag or "")
    except Exception:
        return EnrichOut(caption_draft=None, room_hint=None)
    return EnrichOut(
        caption_draft=(result.get("caption") or None),
        room_hint=(result.get("room_hint") or None),
    )
```

- [ ] **Step 5: Run the whole backend test file + lint + commit**

Run: `cd constructo/backend && uv run pytest tests/publish/test_contractor_album.py -v && uv run ruff check app/publish/`
Expected: PASS (all), no lint errors.

```bash
git add app/publish/router.py app/publish/schemas.py tests/publish/test_contractor_album.py
git commit -m "feat(publish): advisory enrich endpoint (caption draft + room hint, persists nothing)"
```

---

### Task 4: Mobile contractor API module

**Files:**
- Create: `constructo/mobile/src/api/contractor.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: `request<T>` from `./client`; `Photo`, `Paginated` from `./types`.
- Produces: `contractor.presignPhoto/enrichPhoto/publishPhoto/publishedPhotos/editPhoto`; types `ContractorPhoto`, `EnrichResult`, `PhotoPresign`.

- [ ] **Step 1: Write the failing test**

Create `constructo/mobile/src/api/contractor.test.ts`:

```typescript
import { contractor } from './contractor'

const okJson = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response)

beforeEach(() => jest.restoreAllMocks())

test('publishPhoto POSTs to /api/v1/publish/photo with the body', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockReturnValue(okJson({ id: 'p1' }) as never)
  await contractor.publishPhoto({ site_id: 's1', image_url: 'chat/s1/a.jpg', room_tag: 'kitchen' })
  const [url, init] = fetchMock.mock.calls[0]
  expect(String(url)).toContain('/api/v1/publish/photo')
  expect(init?.method).toBe('POST')
  expect(JSON.parse(init?.body as string)).toMatchObject({ site_id: 's1', room_tag: 'kitchen' })
})

test('publishedPhotos GETs with site_id + view query', async () => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockReturnValue(okJson([]) as never)
  await contractor.publishedPhotos('s1', 'room')
  const url = String(fetchMock.mock.calls[0][0])
  expect(url).toContain('site_id=s1')
  expect(url).toContain('view=room')
})

test('editPhoto PATCHes the photo id', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockReturnValue(okJson({ id: 'p9' }) as never)
  await contractor.editPhoto('p9', { is_starred: true })
  const [url, init] = fetchMock.mock.calls[0]
  expect(String(url)).toContain('/api/v1/publish/photo/p9')
  expect(init?.method).toBe('PATCH')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd constructo/mobile && npm test -- contractor`
Expected: FAIL — `Cannot find module './contractor'`.

- [ ] **Step 3: Implement the module**

Create `constructo/mobile/src/api/contractor.ts`:

```typescript
import { request } from './client'
import type { Photo } from './types'

export interface ContractorPhoto extends Photo {
  shared_by_name: string | null
}

export interface EnrichResult {
  caption_draft: string | null
  room_hint: string | null
}

export interface PhotoPresign {
  key: string
  put_url: string | null
  upload_mode: 'presigned' | 'multipart'
}

const q = (params: Record<string, string | undefined>): string => {
  const entries = Object.entries(params).filter(([, v]) => v != null) as [string, string][]
  return entries.length ? '?' + new URLSearchParams(entries).toString() : ''
}

export const contractor = {
  presignPhoto: (siteId: string) =>
    request<PhotoPresign>('/api/v1/chat/media/presign', {
      method: 'POST',
      body: JSON.stringify({ site_id: siteId, kind: 'image' }),
    }),

  enrichPhoto: (input: { site_id: string; image_url: string; room_tag?: string }) =>
    request<EnrichResult>('/api/v1/publish/photo/enrich', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  publishPhoto: (input: {
    site_id: string
    image_url: string
    caption?: string
    room_tag?: string
    milestone_id?: string
  }) => request<Photo>('/api/v1/publish/photo', { method: 'POST', body: JSON.stringify(input) }),

  publishedPhotos: (siteId: string, view: 'all' | 'room' | 'milestone' = 'all') =>
    request<ContractorPhoto[]>(`/api/v1/publish/photos${q({ site_id: siteId, view })}`),

  editPhoto: (id: string, patch: { caption?: string; room_tag?: string; is_starred?: boolean }) =>
    request<Photo>(`/api/v1/publish/photo/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd constructo/mobile && npm test -- contractor`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd constructo/mobile && git add src/api/contractor.ts src/api/contractor.test.ts
git commit -m "feat(mobile): contractor photo API module (publish/list/edit/enrich/presign)"
```

---

### Task 5: Mobile upload helper + room mapping

**Files:**
- Create: `constructo/mobile/src/contractor/photoShare.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: `contractor.presignPhoto`; `uploadMultipart`, `UploadFile` from `../api/client`.
- Produces: `defaultRoomFor(hint, spaces): string | undefined`; `uploadSitePhoto(siteId, localUri): Promise<string>`.

- [ ] **Step 1: Write the failing test**

Create `constructo/mobile/src/contractor/photoShare.test.ts`:

```typescript
import { defaultRoomFor } from './photoShare'

test('defaultRoomFor matches an AI hint to a site space (case-insensitive)', () => {
  expect(defaultRoomFor('Kitchen', ['Kitchen', 'Master Bedroom'])).toBe('Kitchen')
  expect(defaultRoomFor('kitchen', ['Kitchen', 'Master Bedroom'])).toBe('Kitchen')
})

test('defaultRoomFor returns undefined when no space matches (forces a one-tap choice)', () => {
  expect(defaultRoomFor('Staircase', ['Kitchen'])).toBeUndefined()
  expect(defaultRoomFor(null, ['Kitchen'])).toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd constructo/mobile && npm test -- photoShare`
Expected: FAIL — `Cannot find module './photoShare'`.

- [ ] **Step 3: Implement the helper**

Create `constructo/mobile/src/contractor/photoShare.ts`:

```typescript
import { uploadMultipart, type UploadFile } from '../api/client'
import { contractor } from '../api/contractor'

const IMAGE_CONTENT_TYPE = 'image/jpeg'

/** Map an advisory AI room hint onto one of THIS site's spaces; undefined when
 *  there's no confident match, so the UI forces a deliberate one-tap choice. */
export function defaultRoomFor(hint: string | null | undefined, spaces: string[]): string | undefined {
  if (!hint) return undefined
  return spaces.find((s) => s.toLowerCase() === hint.toLowerCase())
}

/** Upload one local image to R2 via the presign path (multipart fallback) and
 *  return the stored bare key to pass as `image_url` to publishPhoto. */
export async function uploadSitePhoto(siteId: string, localUri: string): Promise<string> {
  const presign = await contractor.presignPhoto(siteId)
  const file: UploadFile = { uri: localUri, name: presign.key.split('/').pop() ?? 'photo.jpg', type: IMAGE_CONTENT_TYPE }
  if (presign.upload_mode === 'presigned' && presign.put_url) {
    const blob = await (await fetch(file.uri)).blob()
    const res = await fetch(presign.put_url, {
      method: 'PUT',
      headers: { 'Content-Type': IMAGE_CONTENT_TYPE },
      body: blob,
    })
    if (res.ok) return presign.key
  }
  const form = new FormData()
  form.append('file', file as unknown as Blob)
  form.append('site_id', siteId)
  form.append('kind', 'image')
  const uploaded = await uploadMultipart<{ key: string; sha256: string }>('/api/v1/chat/media', form)
  return uploaded.key
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd constructo/mobile && npm test -- photoShare`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd constructo/mobile && git add src/contractor/photoShare.ts src/contractor/photoShare.test.ts
git commit -m "feat(mobile): site-photo upload helper + AI-room-hint → site-space mapping"
```

---

### Task 6: "Share with owner" capture screen

**Files:**
- Create: `constructo/mobile/app/(contractor)/owner/share.tsx`

**Interfaces:**
- Consumes: `uploadSitePhoto`, `defaultRoomFor` (Task 5); `contractor.publishPhoto`, `contractor.enrichPhoto`, `contractor.editPhoto` (Task 4); `useTheme`, `SPACE`, `TAP`, `useT`.
- Produces: route `/(contractor)/owner/share`.

**Design:** Use the constructo-contractor-design (Neev) skill — marigold `accent` for the single affirmative "Share", warm paper `bg`, `card` sheets.

- [ ] **Step 1: Implement the screen**

Create `constructo/mobile/app/(contractor)/owner/share.tsx`:

```typescript
/** Share with owner — the deliberate v1 door. Pick/capture a burst, one-tap a
 *  room per shot, tap Share once: each photo publishes instantly (caption=None);
 *  the AI caption appears as a pending suggestion to confirm/ignore. */
import { useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { router, useLocalSearchParams } from 'expo-router'

import { contractor } from '../../../src/api/contractor'
import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../../src/theme/tokens'
import { defaultRoomFor, uploadSitePhoto } from '../../../src/contractor/photoShare'

interface Draft {
  uri: string
  room?: string
  captionDraft?: string | null
  captionSent: boolean
  state: 'new' | 'uploading' | 'shared' | 'error'
  photoId?: string
}

const SPACES = ['Kitchen', 'Living room', 'Master bedroom', 'Bathroom', 'Staircase', 'Exterior']

export default function ShareWithOwner() {
  const { theme } = useTheme()
  const c = theme.colors
  const { lang } = useT()
  const { siteId } = useLocalSearchParams<{ siteId: string }>()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [busy, setBusy] = useState(false)

  const pick = async () => {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!lib.granted) return
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      allowsMultipleSelection: true,
      selectionLimit: 12,
    })
    if (result.canceled) return
    setDrafts((d) => [...d, ...result.assets.map((a) => ({ uri: a.uri, captionSent: false, state: 'new' as const }))])
  }

  const setRoom = (i: number, room: string) =>
    setDrafts((d) => d.map((x, j) => (j === i ? { ...x, room } : x)))

  const shareAll = async () => {
    if (!siteId) return
    setBusy(true)
    for (let i = 0; i < drafts.length; i++) {
      if (drafts[i].state === 'shared') continue
      try {
        setDrafts((s) => s.map((x, j) => (j === i ? { ...x, state: 'uploading' } : x)))
        const key = await uploadSitePhoto(siteId, drafts[i].uri)
        const enrich = await contractor.enrichPhoto({ site_id: siteId, image_url: key, room_tag: drafts[i].room })
        const room = drafts[i].room ?? defaultRoomFor(enrich.room_hint, SPACES)
        const photo = await contractor.publishPhoto({ site_id: siteId, image_url: key, room_tag: room })
        setDrafts((s) =>
          s.map((x, j) =>
            j === i ? { ...x, room, photoId: photo.id, captionDraft: enrich.caption_draft, state: 'shared' } : x,
          ),
        )
      } catch {
        setDrafts((s) => s.map((x, j) => (j === i ? { ...x, state: 'error' } : x)))
      }
    }
    setBusy(false)
  }

  const sendCaption = async (i: number) => {
    const d = drafts[i]
    if (!d.photoId || !d.captionDraft) return
    await contractor.editPhoto(d.photoId, { caption: d.captionDraft })
    setDrafts((s) => s.map((x, j) => (j === i ? { ...x, captionSent: true } : x)))
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: SPACE.md }}>
      <Text style={{ color: c.text, fontSize: 22, fontWeight: '700', marginBottom: SPACE.sm }}>
        {lang === 'hi' ? 'घर वाले को भेजें' : 'Share with owner'}
      </Text>

      {drafts.map((d, i) => (
        <View key={i} style={{ backgroundColor: c.card, borderRadius: 14, marginBottom: SPACE.md, overflow: 'hidden' }}>
          <Image source={{ uri: d.uri }} style={{ width: '100%', height: 200 }} />
          <View style={{ padding: SPACE.sm }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {SPACES.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setRoom(i, s)}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, marginRight: 6, borderRadius: 999, backgroundColor: d.room === s ? c.accent : c.paper }}
                >
                  <Text style={{ color: d.room === s ? c.onAccent : c.text }}>{s}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {d.state === 'shared' && d.captionDraft && !d.captionSent && (
              <Pressable
                onPress={() => sendCaption(i)}
                style={{ marginTop: SPACE.sm, padding: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: c.accent }}
              >
                <Text style={{ color: c.textMute, fontStyle: 'italic' }}>{d.captionDraft}</Text>
                <Text style={{ color: c.accentDeep, marginTop: 4 }}>✓ {lang === 'hi' ? 'कैप्शन भेजें' : 'Send caption'}</Text>
              </Pressable>
            )}
            {d.state === 'shared' && <Text style={{ color: c.ok, marginTop: 6 }}>✓ {lang === 'hi' ? 'भेज दिया' : 'Shared'}</Text>}
            {d.state === 'error' && <Text style={{ color: c.risk, marginTop: 6 }}>{lang === 'hi' ? 'फिर से' : 'Failed — tap Share to retry'}</Text>}
          </View>
        </View>
      ))}

      <Pressable onPress={pick} style={{ minHeight: TAP, justifyContent: 'center', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: c.line, marginBottom: SPACE.md }}>
        <Text style={{ color: c.text }}>＋ {lang === 'hi' ? 'फ़ोटो जोड़ें' : 'Add photos'}</Text>
      </Pressable>

      {drafts.length > 0 && (
        <Pressable onPress={shareAll} disabled={busy} style={{ minHeight: TAP, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: c.accent }}>
          {busy ? <ActivityIndicator color={c.onAccent} /> : <Text style={{ color: c.onAccent, fontWeight: '700' }}>{lang === 'hi' ? `${drafts.length} भेजें` : `Share ${drafts.length}`}</Text>}
        </Pressable>
      )}

      <Pressable onPress={() => router.back()} style={{ minHeight: TAP, justifyContent: 'center', alignItems: 'center', marginTop: SPACE.sm }}>
        <Text style={{ color: c.textMute }}>{lang === 'hi' ? 'बंद करें' : 'Done'}</Text>
      </Pressable>
    </ScrollView>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd constructo/mobile && npx tsc --noEmit`
Expected: no errors in `app/(contractor)/owner/share.tsx`.

- [ ] **Step 3: Commit**

```bash
cd constructo/mobile && git add "app/(contractor)/owner/share.tsx"
git commit -m "feat(mobile): Share-with-owner capture screen (burst + one-tap room + pending caption)"
```

---

### Task 7: Contractor Album management screen

**Files:**
- Create: `constructo/mobile/app/(contractor)/owner/album.tsx`

**Interfaces:**
- Consumes: `contractor.publishedPhotos/editPhoto` (Task 4); `useQuery`/`useQueryClient`; `useTheme`, `SPACE`, `TAP`.
- Produces: route `/(contractor)/owner/album`.

- [ ] **Step 1: Implement the screen**

Create `constructo/mobile/app/(contractor)/owner/album.tsx`:

```typescript
/** Contractor Album — the contractor's view of the homeowner feed for a site,
 *  with attribution ("shared by") and per-photo pin/edit. Segments: Feed / By
 *  Room / By Milestone. No unshare in v1 — once shared, a photo stays. */
import { useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { contractor, type ContractorPhoto } from '../../../src/api/contractor'
import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../../src/theme/tokens'

type View = 'all' | 'room' | 'milestone'

export default function ContractorAlbum() {
  const { theme } = useTheme()
  const c = theme.colors
  const { lang } = useT()
  const { siteId } = useLocalSearchParams<{ siteId: string }>()
  const [view, setView] = useState<View>('all')
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['contractor-photos', siteId, view],
    queryFn: () => contractor.publishedPhotos(siteId!, view),
    enabled: !!siteId,
  })
  const photos: ContractorPhoto[] = query.data ?? []

  const togglePin = async (p: ContractorPhoto) => {
    await contractor.editPhoto(p.id, { is_starred: !p.is_starred })
    qc.invalidateQueries({ queryKey: ['contractor-photos', siteId] })
  }

  const tabs: { k: View; label: string }[] = [
    { k: 'all', label: lang === 'hi' ? 'फ़ीड' : 'Feed' },
    { k: 'room', label: lang === 'hi' ? 'कमरे' : 'By room' },
    { k: 'milestone', label: lang === 'hi' ? 'चरण' : 'By milestone' },
  ]

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: SPACE.md }}>
      <View style={{ flexDirection: 'row', marginBottom: SPACE.md }}>
        {tabs.map((t) => (
          <Pressable key={t.k} onPress={() => setView(t.k)} style={{ paddingHorizontal: 12, paddingVertical: 8, marginRight: 6, borderRadius: 999, backgroundColor: view === t.k ? c.accent : c.paper }}>
            <Text style={{ color: view === t.k ? c.onAccent : c.text }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={() => router.push({ pathname: '/(contractor)/owner/share', params: { siteId } })} style={{ minHeight: TAP, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: c.accent, marginBottom: SPACE.md }}>
        <Text style={{ color: c.onAccent, fontWeight: '700' }}>＋ {lang === 'hi' ? 'फ़ोटो भेजें' : 'Add site photo'}</Text>
      </Pressable>

      {query.isLoading && <ActivityIndicator color={c.accent} />}
      {photos.map((p) => (
        <View key={p.id} style={{ backgroundColor: c.card, borderRadius: 14, marginBottom: SPACE.md, overflow: 'hidden' }}>
          <Image source={{ uri: p.image_url }} style={{ width: '100%', height: 200 }} />
          <View style={{ padding: SPACE.sm }}>
            {p.caption ? <Text style={{ color: c.text }}>{p.caption}</Text> : <Text style={{ color: c.textMute, fontStyle: 'italic' }}>{lang === 'hi' ? 'कोई कैप्शन नहीं' : 'No caption'}</Text>}
            <Text style={{ color: c.textMute, fontSize: 12, marginTop: 4 }}>
              {p.room_tag ?? (lang === 'hi' ? 'बिना कमरा' : 'Unsorted')} · {lang === 'hi' ? 'भेजा' : 'shared by'} {p.shared_by_name ?? '—'}
            </Text>
            <Pressable onPress={() => togglePin(p)} style={{ minHeight: TAP, justifyContent: 'center', marginTop: SPACE.sm }}>
              <Text style={{ color: p.is_starred ? c.accentDeep : c.textMute }}>{p.is_starred ? '★ ' : '☆ '}{lang === 'hi' ? 'पिन' : 'Pin'}</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd constructo/mobile && npx tsc --noEmit`
Expected: no errors in `app/(contractor)/owner/album.tsx`.

- [ ] **Step 3: Commit**

```bash
cd constructo/mobile && git add "app/(contractor)/owner/album.tsx"
git commit -m "feat(mobile): contractor album screen (feed/room/milestone, pin, attribution)"
```

---

### Task 8: Register the new screens + verify end-to-end

**Files:**
- Modify: `constructo/mobile/app/(contractor)/owner/_layout.tsx:32-85`

**Interfaces:**
- Consumes: the `share` and `album` route files (Tasks 6, 7).

- [ ] **Step 1: Register the off-tab screens**

In `app/(contractor)/owner/_layout.tsx`, inside `<Tabs>` next to the other `href: null` screens, add:

```tsx
      <Tabs.Screen name="album" options={{ href: null }} />
      <Tabs.Screen name="share" options={{ href: null }} />
```

- [ ] **Step 2: Type-check the app**

Run: `cd constructo/mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the full test suites**

Run: `cd constructo/mobile && npm test`
Expected: PASS (incl. `contractor` + `photoShare`).
Run: `cd constructo/backend && uv run pytest tests/publish/ -v && uv run ruff check`
Expected: PASS, no lint errors.

- [ ] **Step 4: Manual end-to-end verification (preview)**

Log in as a contractor (any crew role), open the album for a site, tap **Add site photo**, select 2 images, one-tap a room on each, tap **Share**. Confirm: (a) both appear instantly in the album, (b) a pending AI caption suggestion shows and "✓ Send caption" promotes it, (c) the same photos appear in the homeowner Photos feed.

- [ ] **Step 5: Commit**

```bash
cd constructo/mobile && git add "app/(contractor)/owner/_layout.tsx"
git commit -m "feat(mobile): register share + album contractor screens"
```

---

## Self-Review

**Spec coverage (Phase 1, per the user's locked set):**
- Full contractor Album tab (Feed/By Room/By Milestone + add/manage) → Tasks 2 + 7.
- Any crew role can share → no role gate added (publish endpoint already permits any in-scope user); Task 1 tests crew sharing.
- Enrich endpoint (sheet opens pre-filled) → Task 3 + used in Task 6.
- No draft tray (capture → review → publish) → Task 6.
- Manage = owner-all / crew-own (edit) → Task 1 (`_assert_can_manage`), reused in Task 7's pin.
- Photo/caption decouple keystone → Task 6 (publish `caption=None`, separate "Send caption").
- **Unshare: intentionally OUT** — no `deleted_at`, no soft-delete, no DELETE endpoint. Consequence: a shared photo can't be removed in v1 (only caption/room/pin edited). Owner-only delete is a deliberate later add.
- **Deferred to later phases:** chat "Show owner?" chip + dedup; homeowner "State of your home", heartbeat, "Request a photo of [room]"; v2 delight.

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `ContractorPhoto`/`ContractorPhotoOut` carry `shared_by_name` consistently (Tasks 2/4/7). `EnrichOut {caption_draft, room_hint}` matches `EnrichResult` (Task 4) and its use in Task 6. `_assert_can_manage` defined in Task 1, reused via the PATCH path in Task 7's pin. `defaultRoomFor` consistent across Tasks 5/6.

**Implementer notes:** confirm `_photo_out`/`_bucket_photos_by_milestone` import origin (`app.homeowner.router`) when wiring Tasks 1–2; if `create_access_token` import path differs, reuse the `auth` helper from `tests/homeowner/conftest.py`.
