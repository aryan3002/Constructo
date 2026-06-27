import {
  setMarkupResult,
  takeMarkupResult,
  setPhotoSend,
  takePhotoSend,
} from './markupHandoff'

describe('markupHandoff — markup result', () => {
  it('returns null when nothing is pending', () => {
    expect(takeMarkupResult()).toBeNull()
  })

  it('hands back a set result once, then clears (consume-once)', () => {
    setMarkupResult('file://marked.jpg')
    expect(takeMarkupResult()).toEqual({ uri: 'file://marked.jpg' })
    expect(takeMarkupResult()).toBeNull()
  })

  it('keeps only the latest set result', () => {
    setMarkupResult('file://a.jpg')
    setMarkupResult('file://b.jpg')
    expect(takeMarkupResult()).toEqual({ uri: 'file://b.jpg' })
  })
})

describe('markupHandoff — send payload', () => {
  it('returns null when nothing is pending', () => {
    expect(takePhotoSend()).toBeNull()
  })

  it('hands back the send payload once, then clears (no double-send)', () => {
    setPhotoSend({ uri: 'file://p.jpg', mime: 'image/jpeg', caption: 'Is it good?' })
    expect(takePhotoSend()).toEqual({ uri: 'file://p.jpg', mime: 'image/jpeg', caption: 'Is it good?' })
    expect(takePhotoSend()).toBeNull()
  })
})
