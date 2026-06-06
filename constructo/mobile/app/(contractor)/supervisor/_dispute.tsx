/**
 * DisputeSheet — the contested-truth affordance (Safety rail 1.7) as a bottom
 * sheet over the crew chat. Two modes:
 *
 *  - **raise**: anyone on the site contests a card — a short reason, one tap →
 *    POST /events/{id}/disputes. The card flips to "Disputed" (no silent
 *    overwrite; the dispute trail is the receipt).
 *  - **resolve** (owner/PM only): settles the OPEN dispute on a card. The owner
 *    can "Keep as recorded" (the original stands) or "Accept correction" when the
 *    raiser proposed corrected fields — which writes a NEW superseding version,
 *    append-only and attributed. Never a silent overwrite.
 *
 * Blueprint theme, ≥48px targets, Hindi-first. Honest-AI: a human commits; the
 * proposed correction is shown verbatim so the resolver decides on evidence.
 */
import { useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, TextInput, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, STATUS, TAP } from '../../../src/theme/tokens'
import { Body, BodyStrong, Mono, Small } from '../../../src/ui'
import { disputesApi, type Dispute } from '../../../src/api/disputes'
import type { ChatEvent } from '../../../src/api/chat'

type Lang = 'en' | 'hi'

const STR = {
  en: {
    raiseTitle: 'Contest this',
    raiseHint: 'Tell the team what looks wrong. This marks the card disputed — nothing is overwritten.',
    reasonPlaceholder: 'What’s wrong? e.g. "45 nahi, 54 bori thi"',
    raise: 'Mark disputed',
    resolveTitle: 'Resolve dispute',
    raisedBy: 'Raised by',
    proposed: 'Proposed correction',
    notePlaceholder: 'Note on how you settled it (optional)',
    keep: 'Keep as recorded',
    accept: 'Accept correction',
    noOpen: 'No open dispute on this card.',
    cancel: 'Cancel',
    failed: 'Could not save — try again.',
    already: 'You already have an open dispute on this card.',
  },
  hi: {
    raiseTitle: 'इस पर आपत्ति',
    raiseHint: 'टीम को बताएँ क्या ग़लत लग रहा है। इससे कार्ड विवादित हो जाएगा — कुछ भी मिटाया नहीं जाता।',
    reasonPlaceholder: 'क्या ग़लत है? जैसे "45 नहीं, 54 बोरी थी"',
    raise: 'विवादित करें',
    resolveTitle: 'विवाद सुलझाएँ',
    raisedBy: 'उठाया',
    proposed: 'प्रस्तावित सुधार',
    notePlaceholder: 'कैसे सुलझाया, उसका नोट (वैकल्पिक)',
    keep: 'जैसा दर्ज है वैसा रखें',
    accept: 'सुधार स्वीकारें',
    noOpen: 'इस कार्ड पर कोई खुला विवाद नहीं।',
    cancel: 'रद्द करें',
    failed: 'सेव नहीं हुआ — फिर कोशिश करें।',
    already: 'इस कार्ड पर आपका विवाद पहले से खुला है।',
  },
} as const

export interface DisputeSheetProps {
  visible: boolean
  mode: 'raise' | 'resolve'
  event: ChatEvent | null
  /** A human gist of the card for the sheet header. */
  eventSummary: string
  lang: Lang
  onClose: () => void
  /** Success → the caller refetches messages so the contested flag flips. */
  onDone: () => void
}

function fieldLines(fields: Record<string, unknown> | null): [string, string][] {
  if (!fields) return []
  return Object.entries(fields)
    .filter(([, v]) => v != null && typeof v !== 'object')
    .map(([k, v]) => [k.replace(/_/g, ' '), String(v)])
}

export function DisputeSheet({
  visible,
  mode,
  event,
  eventSummary,
  lang,
  onClose,
  onDone,
}: DisputeSheetProps) {
  const { theme } = useTheme()
  const c = theme.colors
  const t = STR[lang]

  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // resolve mode: find the OPEN dispute on this event.
  const disputesQ = useQuery({
    queryKey: ['disputes', event?.id],
    queryFn: () => disputesApi.list(event!.id),
    enabled: visible && mode === 'resolve' && !!event,
  })
  const open: Dispute | undefined = (disputesQ.data ?? []).find((d) => d.status === 'open')

  const reset = () => {
    setReason('')
    setNote('')
    setBusy(false)
    setError(null)
  }
  const close = () => {
    reset()
    onClose()
  }
  const done = () => {
    reset()
    onDone()
  }

  async function onRaise() {
    if (!event || !reason.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await disputesApi.raise(event.id, reason.trim())
      done()
    } catch (e) {
      const code = (e as { code?: string })?.code
      setError(code === 'already_open' ? t.already : t.failed)
      setBusy(false)
    }
  }

  async function onResolve(accept: boolean) {
    if (!open || busy) return
    setBusy(true)
    setError(null)
    try {
      await disputesApi.resolve(open.id, {
        resolution_note: note.trim() || undefined,
        resolved_fields: accept ? open.proposed_fields ?? undefined : undefined,
      })
      done()
    } catch {
      setError(t.failed)
      setBusy(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(21,23,28,0.45)', justifyContent: 'flex-end' }}
        onPress={close}
      >
        <Pressable
          // Stop taps inside the sheet from closing it.
          onPress={() => {}}
          style={{
            backgroundColor: c.card,
            borderTopLeftRadius: theme.radii.sheet,
            borderTopRightRadius: theme.radii.sheet,
            padding: SPACE.lg,
            paddingBottom: SPACE.xl,
            gap: SPACE.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <Feather
              name={mode === 'raise' ? 'flag' : 'check-circle'}
              size={18}
              color={mode === 'raise' ? STATUS.risk : STATUS.ok}
            />
            <BodyStrong style={{ flex: 1 }}>
              {mode === 'raise' ? t.raiseTitle : t.resolveTitle}
            </BodyStrong>
            <Pressable accessibilityRole="button" accessibilityLabel={t.cancel} hitSlop={10} onPress={close}>
              <Feather name="x" size={22} color={c.textMute} />
            </Pressable>
          </View>

          {eventSummary ? (
            <Small muted numberOfLines={2}>
              {eventSummary}
            </Small>
          ) : null}

          {mode === 'raise' ? (
            <>
              <Small muted>{t.raiseHint}</Small>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder={t.reasonPlaceholder}
                placeholderTextColor={c.textMute}
                multiline
                style={{
                  minHeight: 80,
                  borderWidth: 1,
                  borderColor: c.line,
                  borderRadius: theme.radii.control,
                  backgroundColor: c.paper,
                  padding: SPACE.md,
                  color: c.text,
                  fontSize: 16,
                  textAlignVertical: 'top',
                }}
              />
              {error ? <Small color={STATUS.risk}>{error}</Small> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.raise}
                accessibilityState={{ disabled: !reason.trim() || busy }}
                disabled={!reason.trim() || busy}
                onPress={onRaise}
                style={({ pressed }) => ({
                  minHeight: TAP,
                  borderRadius: theme.radii.control,
                  backgroundColor: STATUS.risk,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: !reason.trim() || busy ? 0.5 : pressed ? 0.9 : 1,
                })}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <BodyStrong color="#fff">{t.raise}</BodyStrong>}
              </Pressable>
            </>
          ) : disputesQ.isLoading ? (
            <View style={{ paddingVertical: SPACE.lg, alignItems: 'center' }}>
              <ActivityIndicator color={c.accent} />
            </View>
          ) : !open ? (
            <Small muted>{t.noOpen}</Small>
          ) : (
            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              <View style={{ gap: SPACE.md }}>
                <View
                  style={{
                    borderRadius: theme.radii.control,
                    borderWidth: 1,
                    borderColor: c.line,
                    backgroundColor: c.paper,
                    padding: SPACE.md,
                    gap: 4,
                  }}
                >
                  <Small muted style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {`${t.raisedBy}: ${open.raised_by_role ?? '—'}`}
                  </Small>
                  <Body style={{ color: c.text }}>{open.reason}</Body>
                </View>

                {fieldLines(open.proposed_fields).length ? (
                  <View style={{ gap: 4 }}>
                    <Small muted style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {t.proposed}
                    </Small>
                    {fieldLines(open.proposed_fields).map(([k, v]) => (
                      <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.md }}>
                        <Small muted>{k}</Small>
                        <Mono style={{ color: c.text }}>{v}</Mono>
                      </View>
                    ))}
                  </View>
                ) : null}

                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder={t.notePlaceholder}
                  placeholderTextColor={c.textMute}
                  multiline
                  style={{
                    minHeight: 56,
                    borderWidth: 1,
                    borderColor: c.line,
                    borderRadius: theme.radii.control,
                    backgroundColor: c.paper,
                    padding: SPACE.md,
                    color: c.text,
                    fontSize: 16,
                    textAlignVertical: 'top',
                  }}
                />
                {error ? <Small color={STATUS.risk}>{error}</Small> : null}

                <View style={{ gap: SPACE.sm }}>
                  {open.proposed_fields && fieldLines(open.proposed_fields).length ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t.accept}
                      disabled={busy}
                      onPress={() => onResolve(true)}
                      style={({ pressed }) => ({
                        minHeight: TAP,
                        borderRadius: theme.radii.control,
                        backgroundColor: STATUS.ok,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: busy ? 0.5 : pressed ? 0.9 : 1,
                      })}
                    >
                      {busy ? <ActivityIndicator color="#fff" /> : <BodyStrong color="#fff">{t.accept}</BodyStrong>}
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t.keep}
                    disabled={busy}
                    onPress={() => onResolve(false)}
                    style={({ pressed }) => ({
                      minHeight: TAP,
                      borderRadius: theme.radii.control,
                      borderWidth: 1,
                      borderColor: c.line,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: busy ? 0.5 : pressed ? 0.9 : 1,
                    })}
                  >
                    <BodyStrong>{t.keep}</BodyStrong>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}
