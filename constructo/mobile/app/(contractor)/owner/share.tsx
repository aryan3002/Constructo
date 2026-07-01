/** Share with owner — the deliberate v1 door. Pick/capture a burst, one-tap a
 *  room per shot, tap Share once: each photo publishes instantly (caption=None);
 *  the AI caption appears as a pending suggestion to confirm/ignore. */
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { contractor } from '../../../src/api/contractor'
import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../../src/theme/tokens'
import { uploadSitePhoto } from '../../../src/contractor/photoShare'

interface Draft {
  uri: string
  room?: string
  captionDraft?: string | null
  captionSent: boolean
  state: 'new' | 'uploading' | 'shared' | 'error'
  photoId?: string
}

const SPACES = ['Kitchen', 'Living room', 'Master bedroom', 'Bathroom', 'Staircase', 'Exterior']

export default function ShareWithOwner() {
  const { theme } = useTheme()
  const c = theme.colors
  const { lang } = useT()
  const { siteId } = useLocalSearchParams<{ siteId: string }>()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [busy, setBusy] = useState(false)

  const pick = async () => {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!lib.granted) return
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.4,
      allowsMultipleSelection: true,
      selectionLimit: 12,
    })
    if (result.canceled) return
    setDrafts((d) => [...d, ...result.assets.map((a) => ({ uri: a.uri, captionSent: false, state: 'new' as const }))])
  }

  const insets = useSafeAreaInsets()

  const setRoom = (i: number, room: string) =>
    setDrafts((d) => d.map((x, j) => (j === i ? { ...x, room } : x)))

  const shareAll = async () => {
    if (!siteId) return
    setBusy(true)
    for (let i = 0; i < drafts.length; i++) {
      if (drafts[i].state === 'shared') continue
      try {
        setDrafts((s) => s.map((x, j) => (j === i ? { ...x, state: 'uploading' } : x)))
        const key = await uploadSitePhoto(siteId, drafts[i].uri)
        const room = drafts[i].room
        // Publish FAST (draft:false -> no vision in the critical path) and mark
        // Shared immediately; the AI caption is fetched async below, never blocking.
        const photo = await contractor.publishPhoto(
          { site_id: siteId, image_url: key, room_tag: room },
          { draft: false },
        )
        setDrafts((s) => s.map((x, j) => (j === i ? { ...x, room, photoId: photo.id, state: 'shared' } : x)))
        contractor
          .enrichPhoto({ site_id: siteId, image_url: key, room_tag: room })
          .then((e) =>
            setDrafts((s) => s.map((x, j) => (j === i ? { ...x, captionDraft: e.caption_draft } : x))),
          )
          .catch(() => {})
      } catch {
        setDrafts((s) => s.map((x, j) => (j === i ? { ...x, state: 'error' } : x)))
      }
    }
    setBusy(false)
  }

  const sendCaption = async (i: number) => {
    const d = drafts[i]
    if (!d.photoId || !d.captionDraft) return
    await contractor.editPhoto(d.photoId, { caption: d.captionDraft })
    setDrafts((s) => s.map((x, j) => (j === i ? { ...x, captionSent: true } : x)))
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: SPACE.md, paddingTop: insets.top + SPACE.sm }}>
      <Text style={{ color: c.text, fontSize: 22, fontWeight: '700', marginBottom: SPACE.sm }}>
        {lang === 'hi' ? 'घर वाले को भेजें' : 'Share with owner'}
      </Text>

      {drafts.map((d, i) => (
        <View key={i} style={{ backgroundColor: c.card, borderRadius: 14, marginBottom: SPACE.md, overflow: 'hidden' }}>
          <Image source={{ uri: d.uri }} style={{ width: '100%', height: 200 }} contentFit="cover" />
          <View style={{ padding: SPACE.sm }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {SPACES.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setRoom(i, s)}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, marginRight: 6, borderRadius: 999, backgroundColor: d.room === s ? c.accent : c.paper }}
                >
                  <Text style={{ color: d.room === s ? c.onAccent : c.text }}>{s}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {d.state === 'shared' && d.captionDraft && !d.captionSent && (
              <Pressable
                onPress={() => sendCaption(i)}
                style={{ marginTop: SPACE.sm, padding: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: c.accent }}
              >
                <Text style={{ color: c.textMute, fontStyle: 'italic' }}>{d.captionDraft}</Text>
                <Text style={{ color: c.accentDeep, marginTop: 4 }}>✓ {lang === 'hi' ? 'कैप्शन भेजें' : 'Send caption'}</Text>
              </Pressable>
            )}
            {d.state === 'shared' && <Text style={{ color: c.ok, marginTop: 6 }}>✓ {lang === 'hi' ? 'भेज दिया' : 'Shared'}</Text>}
            {d.state === 'error' && <Text style={{ color: c.risk, marginTop: 6 }}>{lang === 'hi' ? 'फिर से' : 'Failed — tap Share to retry'}</Text>}
          </View>
        </View>
      ))}

      <Pressable onPress={pick} style={{ minHeight: TAP, justifyContent: 'center', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: c.line, marginBottom: SPACE.md }}>
        <Text style={{ color: c.text }}>＋ {lang === 'hi' ? 'फ़ोटो जोड़ें' : 'Add photos'}</Text>
      </Pressable>

      {drafts.length > 0 && (
        <Pressable onPress={shareAll} disabled={busy} style={{ minHeight: TAP, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: c.accent }}>
          {busy ? <ActivityIndicator color={c.onAccent} /> : <Text style={{ color: c.onAccent, fontWeight: '700' }}>{lang === 'hi' ? `${drafts.length} भेजें` : `Share ${drafts.length}`}</Text>}
        </Pressable>
      )}

      <Pressable onPress={() => router.back()} style={{ minHeight: TAP, justifyContent: 'center', alignItems: 'center', marginTop: SPACE.sm }}>
        <Text style={{ color: c.textMute }}>{lang === 'hi' ? 'बंद करें' : 'Done'}</Text>
      </Pressable>
    </ScrollView>
  )
}
