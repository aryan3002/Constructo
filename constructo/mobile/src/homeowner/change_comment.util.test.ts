// The change-comment Send button sends (T6). Under src/ only.
import {
  CHANGE_COMMENT_TITLE_MAX,
  changeCommentRequest,
} from '../screens/homeowner/change_comment.util'

describe('changeCommentRequest', () => {
  it('titles the request after the change and trims the note', () => {
    expect(changeCommentRequest('Upgrade bathroom tiles', '  Can we see a sample?  ', 'en')).toEqual({
      title: 'About a change: Upgrade bathroom tiles',
      detail: 'Can we see a sample?',
    })
  })

  it('is null for an empty or blank note', () => {
    expect(changeCommentRequest('Tiles', '', 'en')).toBeNull()
    expect(changeCommentRequest('Tiles', '   \n ', 'en')).toBeNull()
  })

  it('speaks Hindi', () => {
    expect(changeCommentRequest('टाइल बदलें', 'नमूना दिखाएँ', 'hi')?.title).toBe(
      'बदलाव के बारे में: टाइल बदलें',
    )
  })

  it('cuts a long title to the limit with an ellipsis', () => {
    const long = 'Move the kitchen sink to the window wall and add a second tap '.repeat(3)
    const out = changeCommentRequest(long, 'ok', 'en')!
    expect(Array.from(out.title)).toHaveLength(CHANGE_COMMENT_TITLE_MAX)
    expect(out.title.endsWith('…')).toBe(true)
    expect(out.title.startsWith('About a change: Move the kitchen sink')).toBe(true)
  })

  it('leaves a title at exactly the limit alone', () => {
    const desc = 'x'.repeat(CHANGE_COMMENT_TITLE_MAX - 'About a change: '.length)
    const out = changeCommentRequest(desc, 'ok', 'en')!
    expect(out.title).toHaveLength(CHANGE_COMMENT_TITLE_MAX)
    expect(out.title.endsWith('…')).toBe(false)
  })
})
