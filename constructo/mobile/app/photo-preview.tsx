/**
 * Photo preview — a WhatsApp-style "confirm before send" screen for chat photos.
 *
 * A real pushed ROUTE (not a Modal): the camera/gallery picker hands it an image
 * `uri`; the user can add a caption and (when `markup=1`) tap Markup to annotate
 * IN PLACE (the shared PhotoMarkupCanvas, no navigation). On Send it writes the
 * {uri, mime, caption} to the send hand-off and pops back to the chat thread,
 * which runs its own durable send on focus.
 *
 * Why a route + inline markup (not a Modal + pushed markup screen): a RN <Modal>
 * doesn't compose with navigation (glitch, dropped keyboard, double-send), and a
 * top-level preview pushing the grouped markup route sent `back` to the home tab.
 * Inline markup avoids all of it. Theme-independent (dark) so it works at the top
 * level, outside the per-group themes.
 */
import { useCallback, useState } from 'react'
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useT } from '../src/i18n/I18nProvider'
import { PhotoMarkupCanvas } from '../src/chat/PhotoMarkupCanvas'
import { setPhotoSend } from '../src/chat/markupHandoff'

const BG = '#111'
const SURFACE = '#1f1f1f'
const LINE = '#333'
const TEXT = '#f5f5f5'
const MUTE = '#9a9a9a'
const ACCENT = '#3e7a66' // homeowner sage (brand), readable on dark

const MARKUP_STR = {
  en: { markup: 'Mark up', use: 'Use this' },
  hi: { markup: 'मार्क करें', use: 'इसे भेजें' },
} as const

export default function PhotoPreview() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { lang } = useT()
  const m = MARKUP_STR[lang === 'hi' ? 'hi' : 'en']
  const params = useLocalSearchParams<{
    uri?: string
    mime?: string
    markup?: string
    placeholder?: string
    markupLabel?: string
  }>()

  const [uri, setUri] = useState<string | undefined>(params.uri)
  const [caption, setCaption] = useState('')
  const [markupMode, setMarkupMode] = useState(false)
  const mime = params.mime ?? 'image/jpeg'
  const canMarkup = params.markup === '1'

  const onSend = useCallback(() => {
    if (!uri) return
    setPhotoSend({ uri, mime, caption: caption.trim() })
    router.back()
  }, [uri, mime, caption, router])

  // Inline markup mode — full-screen annotation, no navigation.
  if (markupMode && uri) {
    return (
      <PhotoMarkupCanvas
        uri={uri}
        title={params.markupLabel ?? m.markup}
        useLabel={m.use}
        onCancel={() => setMarkupMode(false)}
        onDone={(out) => {
          setUri(out)
          setMarkupMode(false)
        }}
      />
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Top bar: close + (optional) Markup */}
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingHorizontal: 12,
          paddingBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Feather name="x" size={26} color={TEXT} />
        </Pressable>
        {canMarkup ? (
          <Pressable
            onPress={() => {
              Keyboard.dismiss()
              setMarkupMode(true)
            }}
            hitSlop={10}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              height: 40,
              borderRadius: 999,
              backgroundColor: '#fff',
            }}
          >
            <Feather name="edit-2" size={16} color={ACCENT} />
            <Text style={{ color: ACCENT, fontSize: 15, fontWeight: '600' }}>
              {params.markupLabel ?? m.markup}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Image — tapping it dismisses the keyboard. */}
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {uri ? (
            <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      {/* Caption + send */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 10,
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: insets.bottom + 8,
            borderTopWidth: 1,
            borderTopColor: LINE,
            backgroundColor: BG,
          }}
        >
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder={params.placeholder ?? 'Add a caption…'}
            placeholderTextColor={MUTE}
            multiline
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 120,
              color: TEXT,
              fontSize: 16,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 22,
              backgroundColor: SURFACE,
            }}
          />
          <Pressable
            onPress={onSend}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: ACCENT,
            }}
          >
            <Feather name="arrow-up" size={22} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}
