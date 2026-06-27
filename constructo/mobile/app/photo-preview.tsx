/**
 * Photo preview — a WhatsApp-style "confirm before send" screen for chat photos.
 *
 * A real pushed ROUTE (not a Modal): the camera/gallery picker hands it an image
 * `uri`; the user can add a caption and (when `markup=1`) tap Markup to annotate
 * (reuses the markup screen, which returns here via the markup hand-off). On Send
 * it writes the {uri, mime, caption} to the send hand-off and pops back to the
 * chat thread, which runs its own durable send on focus.
 *
 * Why a route, not a Modal: pushing the markup screen from inside a RN <Modal>
 * glitched (separate native window), dropped the keyboard, and double-fired the
 * send. A route composes cleanly with navigation. Theme-independent (dark, like
 * the markup screen) so it works at the top level, outside the per-group themes.
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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { setPhotoSend, takeMarkupResult } from '../src/chat/markupHandoff'

const BG = '#111'
const SURFACE = '#1f1f1f'
const LINE = '#333'
const TEXT = '#f5f5f5'
const MUTE = '#9a9a9a'
const ACCENT = '#3e7a66' // homeowner sage (brand), readable on dark

export default function PhotoPreview() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{
    uri?: string
    mime?: string
    markup?: string
    placeholder?: string
    markupLabel?: string
  }>()

  const [uri, setUri] = useState<string | undefined>(params.uri)
  const [caption, setCaption] = useState('')
  const mime = params.mime ?? 'image/jpeg'
  const canMarkup = params.markup === '1'

  // Returning from the markup screen → swap in the annotated image (jpg).
  useFocusEffect(
    useCallback(() => {
      const r = takeMarkupResult()
      if (r) setUri(r.uri)
    }, []),
  )

  const onMarkup = () => {
    if (!uri) return
    Keyboard.dismiss()
    router.push({ pathname: '/(homeowner)/markup', params: { uri, returnTo: 'thread' } })
  }

  const onSend = () => {
    if (!uri) return
    setPhotoSend({ uri, mime, caption: caption.trim() })
    router.back()
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
            onPress={onMarkup}
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
              {params.markupLabel ?? 'Markup'}
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
