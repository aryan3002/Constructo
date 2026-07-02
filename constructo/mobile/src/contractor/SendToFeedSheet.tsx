/**
 * SendToFeedSheet — the quick "Send to feed" sheet for the contractor in-chat
 * photo-share flow (the deferred half of the photo-share hybrid; Phase 1 shipped
 * the dedicated Share screen).
 *
 * The contractor long-presses a photo bubble in a site/homeowner chat → this
 * bottom-sheet opens with a preview of that photo, an optional caption, and the
 * `ROOM_PRESETS` room chips. On Send it calls the server-authoritative
 * `contractor.sendChatPhotoToFeed(messageId, …)` — the backend reuses the chat
 * message's existing R2 attachment (never re-uploads) and publishes it to the
 * homeowner feed + contractor Album. Honest-AI gate: the caption is blank unless
 * the contractor types one — we never auto-copy the chat body.
 *
 * On success → `onSent(messageId, photo)` (the parent flips the bubble to
 * "✓ In feed") + a toast, then close. On failure → keep the sheet open + error
 * toast so the contractor can retry.
 *
 * RN `Image` (not expo-image, which crashes in Expo Go). Neev theme, English-first
 * with Hindi copy following the app's `STR` pattern.
 */
import { useEffect, useState } from 'react'
import {
  Image,
  Modal,
  Pressable,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'

import { useT } from '../i18n/I18nProvider'
import { useTheme } from '../theme/ThemeProvider'
import { SPACE, TAP } from '../theme/tokens'
import { BodyStrong, Button, Chip, Small, useToast } from '../ui'
import { contractor, type ContractorPhoto } from '../api/contractor'
import { ROOM_PRESETS } from '../../app/_requests.util'

type Lang = 'en' | 'hi'

interface Strings {
  title: string
  subtitle: string
  captionLabel: string
  captionPlaceholder: string
  roomLabel: string
  send: string
  sending: string
  cancel: string
  success: string
  error: string
}

const STR: Record<Lang, Strings> = {
  en: {
    title: 'Send to feed',
    subtitle: "This photo will appear in the homeowner's feed and your album.",
    captionLabel: 'Add a caption (optional)',
    captionPlaceholder: 'What does this photo show?',
    roomLabel: 'Which room? (optional)',
    send: 'Send to feed',
    sending: 'Sending…',
    cancel: 'Cancel',
    success: 'Shared to the homeowner feed.',
    error: "Couldn't send that just now. Please try again.",
  },
  hi: {
    title: 'फ़ीड में भेजें',
    subtitle: 'यह फ़ोटो गृहस्वामी की फ़ीड और आपके एल्बम में दिखेगी।',
    captionLabel: 'कैप्शन जोड़ें (वैकल्पिक)',
    captionPlaceholder: 'यह फ़ोटो क्या दिखाती है?',
    roomLabel: 'कौन-सा कमरा? (वैकल्पिक)',
    send: 'फ़ीड में भेजें',
    sending: 'भेज रहे हैं…',
    cancel: 'रद्द करें',
    success: 'गृहस्वामी की फ़ीड में साझा किया गया।',
    error: 'अभी नहीं भेज सके। कृपया फिर कोशिश करें।',
  },
}

export interface SendToFeedSheetProps {
  visible: boolean
  /** Presigned GET URL of the chat photo — shown as the preview. */
  photoUri: string | null
  /** The chat MESSAGE id (server reuses its attachment as the feed photo). */
  messageId: string | null
  onClose: () => void
  /** Called after a successful publish so the parent can flip the bubble to
   *  "✓ In feed" and refresh any feed queries. */
  onSent: (messageId: string, photo: ContractorPhoto) => void
}

export function SendToFeedSheet({
  visible,
  photoUri,
  messageId,
  onClose,
  onSent,
}: SendToFeedSheetProps) {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const t = STR[lang]
  const insets = useSafeAreaInsets()
  const toast = useToast()

  const [caption, setCaption] = useState('')
  const [roomKey, setRoomKey] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // Reset the form each time a fresh photo opens the sheet (so a prior caption /
  // room selection never leaks onto the next photo).
  useEffect(() => {
    if (visible) {
      setCaption('')
      setRoomKey(null)
      setSending(false)
    }
  }, [visible, messageId])

  const onSend = async () => {
    if (!messageId || sending) return
    setSending(true)
    try {
      const trimmed = caption.trim()
      // "other" is a UI catch-all, not a real room tag — send it as no room.
      const roomTag = roomKey && roomKey !== 'other' ? roomKey : undefined
      const photo = await contractor.sendChatPhotoToFeed(messageId, {
        caption: trimmed || undefined,
        roomTag,
      })
      onSent(messageId, photo)
      toast(t.success, 'check-circle')
      onClose()
    } catch {
      // Keep the sheet open so the contractor can retry; surface an honest error.
      setSending(false)
      toast(t.error, 'alert-circle')
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={sending ? undefined : onClose}
    >
      {/* Scrim — tap outside to dismiss (disabled while sending). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.cancel}
        onPress={sending ? undefined : onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
      >
        {/* Stop the sheet body from bubbling the scrim's dismiss press. */}
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: c.bg,
            borderTopLeftRadius: theme.radii.card,
            borderTopRightRadius: theme.radii.card,
            paddingHorizontal: SPACE.lg,
            paddingTop: SPACE.md,
            paddingBottom: Math.max(insets.bottom, SPACE.lg),
            gap: SPACE.lg,
          }}
        >
          {/* Grab handle */}
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 9999,
              backgroundColor: c.line,
            }}
          />

          {/* Header */}
          <View style={{ gap: SPACE.xs }}>
            <BodyStrong>{t.title}</BodyStrong>
            <Small muted>{t.subtitle}</Small>
          </View>

          {/* Photo preview */}
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={{
                width: '100%',
                height: 200,
                borderRadius: theme.radii.control,
                backgroundColor: c.paper,
              }}
              resizeMode="cover"
            />
          ) : null}

          {/* Optional caption */}
          <View style={{ gap: SPACE.xs }}>
            <BodyStrong>{t.captionLabel}</BodyStrong>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder={t.captionPlaceholder}
              placeholderTextColor={c.textMute}
              multiline
              editable={!sending}
              style={{
                minHeight: 56,
                borderWidth: 1,
                borderColor: c.line,
                borderRadius: theme.radii.control,
                paddingHorizontal: SPACE.md,
                paddingVertical: SPACE.sm,
                color: c.text,
                fontSize: 16,
                textAlignVertical: 'top',
                backgroundColor: c.card,
              }}
            />
          </View>

          {/* Room chips */}
          <View style={{ gap: SPACE.xs }}>
            <BodyStrong>{t.roomLabel}</BodyStrong>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
              {ROOM_PRESETS.map((r) => (
                <Chip
                  key={r.key}
                  label={lang === 'hi' ? r.hi : r.en}
                  active={roomKey === r.key}
                  onPress={() => setRoomKey(roomKey === r.key ? null : r.key)}
                />
              ))}
            </View>
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            <Button
              title={t.cancel}
              variant="secondary"
              onPress={onClose}
              disabled={sending}
              style={{ flex: 1, minHeight: TAP }}
            />
            <Button
              title={sending ? t.sending : t.send}
              variant="accent"
              onPress={onSend}
              loading={sending}
              disabled={sending}
              style={{ flex: 1, minHeight: TAP }}
              leading={sending ? undefined : <Feather name="send" size={16} color={c.onAccent} />}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
