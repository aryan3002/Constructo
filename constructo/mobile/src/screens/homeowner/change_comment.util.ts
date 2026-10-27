// Updates → Changes: a homeowner's note on a change is sent to the builder as
// a request (T6), so it lands in My Requests and the builder's inbox.

type Lang = 'en' | 'hi'

/** Longest title we send; longer ones are cut with an ellipsis. */
export const CHANGE_COMMENT_TITLE_MAX = 100

const PREFIX: Record<Lang, string> = {
  en: 'About a change: ',
  hi: 'बदलाव के बारे में: ',
}

/** The request body for a comment on a change, or null when the note is empty. */
export function changeCommentRequest(
  description: string,
  note: string,
  lang: Lang,
): { title: string; detail: string } | null {
  const detail = note.trim()
  if (!detail) return null
  const full = `${PREFIX[lang]}${description.trim().replace(/\s+/g, ' ')}`
  const chars = Array.from(full) // count characters, not UTF-16 units (Hindi)
  const title =
    chars.length > CHANGE_COMMENT_TITLE_MAX
      ? `${chars.slice(0, CHANGE_COMMENT_TITLE_MAX - 1).join('').trimEnd()}…`
      : full
  return { title, detail }
}
