import { drawingDraft, photoQuestionDraft } from './builderDrafts'

describe('drawingDraft', () => {
  it('names the drawing in each kind of message', () => {
    expect(drawingDraft('approve', 'Ground floor plan v2', 'en')).toBe(
      'I\'ve reviewed "Ground floor plan v2" and I approve it.',
    )
    expect(drawingDraft('changes', 'Ground floor plan v2', 'en')).toMatch(/^I'd like these changes to "Ground floor plan v2": $/)
    expect(drawingDraft('comment', 'Ground floor plan v2', 'en')).toBe('About "Ground floor plan v2": ')
  })

  it('has Hindi text and a fallback name', () => {
    expect(drawingDraft('approve', '', 'hi')).toContain('यह नक्शा')
    expect(drawingDraft('comment', '', 'en')).toBe('About "this drawing": ')
  })
})

describe('photoQuestionDraft', () => {
  it('quotes the caption when there is one', () => {
    expect(photoQuestionDraft('Slab casting', 'en')).toBe('Could you explain what this photo ("Slab casting") shows?')
    expect(photoQuestionDraft(null, 'en')).toBe('Could you explain what this photo shows?')
    expect(photoQuestionDraft(' ', 'hi')).toBe('इस फ़ोटो में क्या दिख रहा है, क्या आप समझा सकते हैं?')
  })
})
