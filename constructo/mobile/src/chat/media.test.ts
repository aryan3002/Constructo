import { signedMediaContentType, effectiveMediaKind } from './media'

// These MUST mirror the backend `_MEDIA_CONTENT_TYPE`
// (backend/app/chat/router.py). If the backend mapping changes, update both —
// a mismatch makes R2 reject the presigned PUT with SignatureDoesNotMatch (403)
// and photo sends stick on "Send…" forever.
describe('signedMediaContentType (mirror of backend _MEDIA_CONTENT_TYPE)', () => {
  it('image → image/jpeg', () => expect(signedMediaContentType('image')).toBe('image/jpeg'))
  it('document → application/pdf', () =>
    expect(signedMediaContentType('document')).toBe('application/pdf'))
  it('voice → audio/m4a', () => expect(signedMediaContentType('voice')).toBe('audio/m4a'))
})

describe('effectiveMediaKind', () => {
  it('corrects a JPEG queued as document → image (the stuck-send bug)', () =>
    expect(effectiveMediaKind('document', 'image/jpeg')).toBe('image'))
  it('corrects a HEIC queued as document → image', () =>
    expect(effectiveMediaKind('document', 'image/heic')).toBe('image'))
  it('corrects a PNG queued as document → image', () =>
    expect(effectiveMediaKind('document', 'image/png')).toBe('image'))
  it('keeps a real PDF document', () =>
    expect(effectiveMediaKind('document', 'application/pdf')).toBe('document'))
  it('keeps a document with no mime', () =>
    expect(effectiveMediaKind('document', undefined)).toBe('document'))
  it('keeps image', () => expect(effectiveMediaKind('image', 'image/jpeg')).toBe('image'))
  it('keeps voice', () => expect(effectiveMediaKind('voice', 'audio/m4a')).toBe('voice'))
  it('defaults undefined kind to document', () =>
    expect(effectiveMediaKind(undefined, undefined)).toBe('document'))
})
