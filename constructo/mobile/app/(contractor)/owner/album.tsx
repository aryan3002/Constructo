/** Contractor Album — the contractor's view of the homeowner feed for a site,
 *  with attribution ("shared by") and per-photo pin/edit. Segments: Feed / By
 *  Room / By Milestone. No unshare in v1 — once shared, a photo stays. */
import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { contractor, type ContractorPhoto } from '../../../src/api/contractor'
import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../../src/theme/tokens'

type AlbumView = 'all' | 'room' | 'milestone'

export default function ContractorAlbum() {
  const { theme } = useTheme()
  const c = theme.colors
  const { lang } = useT()
  const { siteId } = useLocalSearchParams<{ siteId: string }>()
  const [view, setView] = useState<AlbumView>('all')
  const qc = useQueryClient()
  const insets = useSafeAreaInsets()

  const query = useQuery({
    queryKey: ['contractor-photos', siteId, view],
    queryFn: () => contractor.publishedPhotos(siteId!, view),
    enabled: !!siteId,
  })
  const photos: ContractorPhoto[] = query.data ?? []

  if (!siteId) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: c.textMute }}>{lang === 'hi' ? 'कोई साइट नहीं चुनी' : 'No site selected'}</Text>
      </View>
    )
  }

  const togglePin = async (p: ContractorPhoto) => {
    await contractor.editPhoto(p.id, { is_starred: !p.is_starred })
    qc.invalidateQueries({ queryKey: ['contractor-photos', siteId] })
  }

  const removePhoto = (p: ContractorPhoto) =>
    Alert.alert(
      lang === 'hi' ? 'फ़ीड से हटाएँ?' : 'Remove from feed?',
      lang === 'hi' ? 'घर वाले को अब यह फ़ोटो नहीं दिखेगी।' : 'The homeowner will no longer see this photo.',
      [
        { text: lang === 'hi' ? 'रद्द' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'hi' ? 'हटाएँ' : 'Remove',
          style: 'destructive',
          onPress: async () => {
            await contractor.deletePhoto(p.id)
            qc.invalidateQueries({ queryKey: ['contractor-photos', siteId] })
          },
        },
      ],
    )

  const tabs: { k: AlbumView; label: string }[] = [
    { k: 'all', label: lang === 'hi' ? 'फ़ीड' : 'Feed' },
    { k: 'room', label: lang === 'hi' ? 'कमरे' : 'By room' },
    { k: 'milestone', label: lang === 'hi' ? 'चरण' : 'By milestone' },
  ]

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: SPACE.md, paddingTop: insets.top + SPACE.sm }}>
      <View style={{ flexDirection: 'row', marginBottom: SPACE.md }}>
        {tabs.map((t) => (
          <Pressable key={t.k} onPress={() => setView(t.k)} style={{ paddingHorizontal: 12, paddingVertical: 8, marginRight: 6, borderRadius: 999, backgroundColor: view === t.k ? c.accent : c.paper }}>
            <Text style={{ color: view === t.k ? c.onAccent : c.text }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={() => router.push({ pathname: '/(contractor)/owner/share', params: { siteId } })} style={{ minHeight: TAP, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: c.accent, marginBottom: SPACE.md }}>
        <Text style={{ color: c.onAccent, fontWeight: '700' }}>＋ {lang === 'hi' ? 'फ़ोटो भेजें' : 'Add site photo'}</Text>
      </Pressable>

      {query.isLoading && <ActivityIndicator color={c.accent} />}
      {photos.map((p) => (
        <View key={p.id} style={{ backgroundColor: c.card, borderRadius: 14, marginBottom: SPACE.md, overflow: 'hidden' }}>
          <Image source={{ uri: p.image_url }} style={{ width: '100%', height: 200 }} contentFit="cover" cachePolicy="memory-disk" transition={150} />
          <View style={{ padding: SPACE.sm }}>
            {p.caption ? <Text style={{ color: c.text }}>{p.caption}</Text> : <Text style={{ color: c.textMute, fontStyle: 'italic' }}>{lang === 'hi' ? 'कोई कैप्शन नहीं' : 'No caption'}</Text>}
            <Text style={{ color: c.textMute, fontSize: 12, marginTop: 4 }}>
              {p.room_tag ?? (lang === 'hi' ? 'बिना कमरा' : 'Unsorted')} · {lang === 'hi' ? `${p.shared_by_name ?? '—'} द्वारा भेजा` : `shared by ${p.shared_by_name ?? '—'}`}
            </Text>
            <View style={{ flexDirection: 'row', marginTop: SPACE.sm }}>
              <Pressable onPress={() => togglePin(p)} style={{ minHeight: TAP, justifyContent: 'center', paddingRight: SPACE.lg }}>
                <Text style={{ color: p.is_starred ? c.accentDeep : c.textMute }}>{p.is_starred ? '★ ' : '☆ '}{lang === 'hi' ? 'पिन' : 'Pin'}</Text>
              </Pressable>
              <Pressable onPress={() => removePhoto(p)} style={{ minHeight: TAP, justifyContent: 'center' }}>
                <Text style={{ color: c.risk }}>{lang === 'hi' ? 'हटाएँ' : 'Remove'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  )
}
