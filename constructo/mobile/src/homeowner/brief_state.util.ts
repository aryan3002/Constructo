/**
 * Brief-state copy map — the single source of truth for "whose move it is"
 * on the design brief lifecycle. Pure function, no React: drives both the
 * DPHub state-aware banner (design.tsx) and the post-action confirmation
 * toast on the brief screen (design/brief.tsx), so the same honest sentence
 * appears in both places instead of two copies drifting apart.
 *
 * Calm Cockpit rule: never a scary red — tones are 'ok' | 'info' | 'warn' |
 * 'quiet' only (StatusPill's 'risk' is not used here). Every state names the
 * next actor by name (you / your designer / your contractor) rather than a
 * bare lifecycle keyword.
 */

export type BriefCardTone = 'ok' | 'info' | 'warn' | 'quiet'
export type BriefCardCta = 'view_brief' | 'regenerate'

export interface BriefStateCard {
  title: string
  titleHi: string
  body: string
  bodyHi: string
  tone: BriefCardTone
  cta?: BriefCardCta
}

export interface BriefStateCardOpts {
  /** Homeowner's note from a "request changes" action (revision_requested only). */
  note?: string
  /** A pre-formatted " · since 3 Jul" suffix — appended as-is, omitted when absent. */
  sinceLabel?: string
}

/**
 * Map a brief lifecycle state to homeowner-facing copy naming the next actor.
 * Returns null for an empty/unknown state (forward-compat + "no brief yet") —
 * callers render no banner rather than guessing at unrecognised copy.
 */
export function briefStateCard(
  state: string,
  opts: BriefStateCardOpts = {},
): BriefStateCard | null {
  const since = opts.sinceLabel ?? ''

  switch (state) {
    case 'homeowner_review':
      return {
        title: 'Your brief is ready — review and send it',
        titleHi: 'आपका ब्रीफ़ तैयार है — देखें और भेजें',
        body: 'Read through your whole-house brief, then send it to your designer when you’re happy.',
        bodyHi: 'अपना पूरा घर ब्रीफ़ पढ़ें, फिर संतुष्ट होने पर अपने डिज़ाइनर को भेजें।',
        tone: 'ok',
        cta: 'view_brief',
      }

    case 'architect_review':
      return {
        title: `With your designer${since}`,
        titleHi: `आपके डिज़ाइनर के पास${since}`,
        body: 'Your designer is reviewing the brief. We’ll let you know the moment they respond.',
        bodyHi: 'आपके डिज़ाइनर ब्रीफ़ देख रहे हैं। जवाब मिलते ही हम आपको बताएँगे।',
        tone: 'info',
        cta: 'view_brief',
      }

    case 'revision_requested': {
      const note = opts.note?.trim()
      return {
        title: note ? `Changes asked: ${note}` : 'Changes asked',
        titleHi: note ? `बदलाव के लिए कहा गया: ${note}` : 'बदलाव के लिए कहा गया',
        body: 'Your designer asked for a few changes. Regenerate the brief once you’re ready to send it again.',
        bodyHi: 'आपके डिज़ाइनर ने कुछ बदलाव माँगे हैं। दोबारा भेजने से पहले ब्रीफ़ फिर से बनाएँ।',
        tone: 'warn',
        cta: 'regenerate',
      }
    }

    case 'contractor_brief_ready':
      return {
        title: 'Designer signed off — your approval unlocks pricing',
        titleHi: 'डिज़ाइनर ने मंज़ूरी दी — आपकी स्वीकृति से लागत तय होगी',
        body: 'Your designer has signed off on this brief. Approve it so your contractor can start pricing.',
        bodyHi: 'आपके डिज़ाइनर ने इस ब्रीफ़ को मंज़ूरी दे दी है। स्वीकृत करें ताकि आपका ठेकेदार लागत तय कर सके।',
        tone: 'ok',
        cta: 'view_brief',
      }

    case 'approved':
      return {
        title: 'Being priced by your contractor',
        titleHi: 'आपका ठेकेदार लागत तय कर रहा है',
        body: 'You’ve approved this brief. Your contractor is working out material and labour pricing.',
        bodyHi: 'आपने यह ब्रीफ़ स्वीकृत कर दिया है। आपका ठेकेदार सामग्री और श्रम की लागत तय कर रहा है।',
        tone: 'quiet',
      }

    case 'locked':
      return {
        title: 'Locked in — materials are being finalised',
        titleHi: 'तय हो गया — सामग्री अंतिम रूप ले रही है',
        body: 'This brief is locked in. Your team is finalising materials against it.',
        bodyHi: 'यह ब्रीफ़ तय हो चुका है। आपकी टीम इसके अनुसार सामग्री अंतिम कर रही है।',
        tone: 'quiet',
      }

    default:
      return null
  }
}
