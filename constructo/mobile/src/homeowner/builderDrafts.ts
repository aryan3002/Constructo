/**
 * Pre-typed messages to the builder (they open the builder chat — see
 * useBuilderChat). Plain text the homeowner can edit before sending.
 */
import type { Language } from '../api/types'

export type DrawingAsk = 'approve' | 'comment' | 'changes'

export function drawingDraft(kind: DrawingAsk, drawing: string, lang: Language): string {
  const name = drawing.trim() || (lang === 'hi' ? 'यह नक्शा' : 'this drawing')
  if (lang === 'hi') {
    if (kind === 'approve') return `मैंने "${name}" देख लिया है, यह मुझे मंज़ूर है।`
    if (kind === 'changes') return `"${name}" में मुझे ये बदलाव चाहिए: `
    return `"${name}" के बारे में: `
  }
  if (kind === 'approve') return `I've reviewed "${name}" and I approve it.`
  if (kind === 'changes') return `I'd like these changes to "${name}": `
  return `About "${name}": `
}

export function photoQuestionDraft(caption: string | null | undefined, lang: Language): string {
  const c = (caption ?? '').trim()
  if (lang === 'hi') {
    return c ? `इस फ़ोटो ("${c}") में क्या दिख रहा है, क्या आप समझा सकते हैं?` : 'इस फ़ोटो में क्या दिख रहा है, क्या आप समझा सकते हैं?'
  }
  return c ? `Could you explain what this photo ("${c}") shows?` : 'Could you explain what this photo shows?'
}
