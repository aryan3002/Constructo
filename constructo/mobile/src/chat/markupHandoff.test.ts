import { setMarkupResult, takeMarkupResult } from './markupHandoff'

describe('markupHandoff', () => {
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
