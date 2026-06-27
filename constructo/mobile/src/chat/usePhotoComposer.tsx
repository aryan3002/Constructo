/**
 * usePhotoComposer — a WhatsApp-style "preview before send" sheet for chat photos,
 * shared across chat screens. After the screen picks an image (camera/gallery) it
 * calls `open(uri)`, which shows a full-screen preview with an optional caption and
 * (when `enableMarkup`) a Markup button that reuses the existing markup screen and
 * swaps the annotated image back in. `onSend` is provided by the screen so the send
 * stays on that thread's durable outbox. Render `sheet` somewhere in the screen.
 *
 * Markup round-trip uses `markupHandoff` (the markup screen writes the flattened
 * URI and pops back; we pick it up on focus) so no Expo Router param plumbing.
 */
import { useCallback, useState, type ReactNode } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE, TAP } from '../theme/tokens'
import { BodyStrong } from '../ui'
import { takeMarkupResult } from './markupHandoff'

export interface PhotoComposer {
  /** Open the preview sheet for a picked image. */
  open: (uri: string, mime?: string) => void
  /** Render this in the screen so the sheet can appear. */
  sheet: ReactNode
  /** Whether the preview is currently showing. */
  isOpen: boolean
}

export function usePhotoComposer(opts: {
  onSend: (input: { uri: string; mime: string; caption: string }) => Promise<void> | void
  /** Show the Markup button (reuses /(homeowner)/markup). Default false. */
  enableMarkup?: boolean
  placeholder?: string
  markupLabel?: string
}): PhotoComposer {
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const [uri, setUri] = useState<string | null>(null)
  const [mime, setMime] = useState('image/jpeg')
  const [caption, setCaption] = useState('')
  const [sending, setSending] = useState(false)

  const open = useCallback((u: string, m = 'image/jpeg') => {
    setUri(u)
    setMime(m)
    setCaption('')
    setSending(false)
  }, [])
  const close = useCallback(() => {
    setUri(null)
    setCaption('')
    setSending(false)
  }, [])

  // Returning from the markup screen → swap in the annotated image (always jpg).
  useFocusEffect(
    useCallback(() => {
      const r = takeMarkupResult()
      if (r) {
        setUri(r.uri)
        setMime('image/jpeg')
      }
    }, []),
  )

  const onMarkup = useCallback(() => {
    if (!uri) return
    router.push({ pathname: '/(homeowner)/markup', params: { uri, returnTo: 'thread' } })
  }, [uri, router])

  const onSend = useCallback(async () => {
    if (!uri || sending) return
    setSending(true)
    try {
      await opts.onSend({ uri, mime, caption: caption.trim() })
      close()
    } catch {
      setSending(false) // keep the sheet open so they can retry
    }
  }, [uri, mime, caption, sending, opts, close])

  const sheet = (
    <Modal visible={!!uri} animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {/* Top bar: close + (optional) Markup */}
        <View
          style={{
            paddingTop: insets.top + 6,
            paddingHorizontal: SPACE.gutter,
            paddingBottom: SPACE.sm,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Pressable
            onPress={close}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="x" size={26} color={c.text} />
          </Pressable>
          {opts.enableMarkup ? (
            <Pressable
              onPress={onMarkup}
              hitSlop={10}
              accessibilityRole="button"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: SPACE.md,
                height: 40,
                borderRadius: theme.radii.pill,
                borderWidth: 1,
                borderColor: c.line,
                backgroundColor: c.card,
              }}
            >
              <Feather name="edit-2" size={16} color={c.accentDeep} />
              <BodyStrong color={c.accentDeep}>{opts.markupLabel ?? 'Markup'}</BodyStrong>
            </Pressable>
          ) : null}
        </View>

        {/* Image preview */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {uri ? (
            <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          ) : null}
        </View>

        {/* Caption + send */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: SPACE.sm,
              paddingHorizontal: SPACE.gutter,
              paddingTop: SPACE.sm,
              paddingBottom: insets.bottom + SPACE.sm,
              borderTopWidth: 1,
              borderTopColor: c.line,
              backgroundColor: c.card,
            }}
          >
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder={opts.placeholder ?? 'Add a caption…'}
              placeholderTextColor={c.textMute}
              multiline
              style={{
                flex: 1,
                minHeight: TAP,
                maxHeight: 120,
                color: c.text,
                fontSize: 16,
                paddingHorizontal: SPACE.md,
                paddingVertical: SPACE.sm,
                borderRadius: theme.radii.control,
                borderWidth: 1,
                borderColor: c.line,
                backgroundColor: c.bg,
              }}
            />
            <Pressable
              onPress={() => void onSend()}
              disabled={sending}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={{
                width: TAP,
                height: TAP,
                borderRadius: TAP / 2,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.accent,
                opacity: sending ? 0.6 : 1,
              }}
            >
              <Feather name="arrow-up" size={22} color={c.onAccent} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )

  return { open, sheet, isOpen: !!uri }
}
