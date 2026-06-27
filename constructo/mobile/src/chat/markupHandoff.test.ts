import { setPhotoSend, takePhotoSend } from './markupHandoff'

describe('markupHandoff — photo send payload', () => {
  it('returns null when nothing is pending', () => {
    expect(takePhotoSend()).toBeNull()
  })

  it('hands back the send payload once, then clears (no double-send)', () => {
    setPhotoSend({ uri: 'file://p.jpg', mime: 'image/jpeg', caption: 'Is it good?' })
    expect(takePhotoSend()).toEqual({ uri: 'file://p.jpg', mime: 'image/jpeg', caption: 'Is it good?' })
    expect(takePhotoSend()).toBeNull()
  })

  it('keeps only the latest payload', () => {
    setPhotoSend({ uri: 'a', mime: 'image/jpeg', caption: '' })
    setPhotoSend({ uri: 'b', mime: 'image/jpeg', caption: '' })
    expect(takePhotoSend()?.uri).toBe('b')
  })
})
