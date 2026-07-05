/**
 * Per-room References — pushed from the Selections tab "References" chip.
 * Route: (homeowner)/design/references/[room] — registered `href: null` in _layout.tsx.
 *
 * One inspiration surface (Phase 5 unify): this screen now resolves whether
 * the room maps onto a profiler area (via `areaForRoom`) and, when it does,
 * reads and writes through the SAME profiler engine `[area].tsx`'s Inspiration
 * tab uses — `design.references(pid, areaId)` for the grid, and the identical
 * presign/multipart upload path for "Add reference photo". A "Rank these"
 * button routes straight into that area's Ranking tab.
 *
 * When no area matches (a custom room, or no profiler profile yet) the screen
 * falls back to the legacy `homeowner.designReferences()` behavior, plus a
 * quiet hint pointing at the self-serve profiler start.
 *
 * Any legacy rows that already exist for this room (from before the profiler
 * existed, or from the no-profile fallback) are shown read-only in a
 * collapsed "Earlier saves" section — they are never a second live surface.
 */
import { useState } from 'react'
import { Alert, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { design, homeowner } from '../../../../src/api/client'
import { useT } from '../../../../src/i18n/I18nProvider'
import { useTheme } from '../../../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../../../src/theme/tokens'
import { areaForRoom, roomLabelForArea } from '../../../../src/homeowner/design_area_map.util'
import {
  BlurUpImage,
  Button,
  Micro,
  PhotoTile,
  Screen,
  Small,
  SubHeader,
  useToast,
} from '../../../../src/ui'

// ---- strings -----------------------------------------------------------------
const STR = {
  en: {
    title: 'References',
    subtitle: 'Photos that capture the look for this room.',
    subtitleAll: 'All your inspiration references.',
    loading: 'Loading references…',
    empty: 'No references for this room yet. Add one below.',
    addButton: 'Add reference photo',
    addedToast: 'Added to your references.',
    permissionDenied: 'Photo access is needed to add a reference.',
    errorTitle: 'Could not load references',
    retry: 'Try again',
    provenanceUpload: 'You added this',
    provenancePinterest: 'From Pinterest',
    caption: 'Reference photo',
    sharedCaption: 'Your design team sees this board.',
    addErrorTitle: 'Could not add reference',
    rankThese: 'Rank these',
    startProfileHint: 'Start your style profile to get AI suggestions from these photos.',
    startProfileCta: 'Start your style profile',
    earlierSaves: 'Earlier saves',
    earlierSavesHint: 'Saved before your design profile — kept here for reference.',
  },
  hi: {
    title: 'संदर्भ',
    subtitle: 'इस कमरे के लुक को दर्शाने वाली तस्वीरें।',
    subtitleAll: 'आपके सभी प्रेरणा संदर्भ।',
    loading: 'संदर्भ लोड हो रहे हैं…',
    empty: 'इस कमरे के लिए अभी कोई संदर्भ नहीं। नीचे एक जोड़ें।',
    addButton: 'संदर्भ तस्वीर जोड़ें',
    addedToast: 'आपके संदर्भों में जोड़ा गया।',
    permissionDenied: 'संदर्भ जोड़ने के लिए फ़ोटो की अनुमति आवश्यक है।',
    errorTitle: 'संदर्भ लोड नहीं हो सके',
    retry: 'पुनः प्रयास करें',
    provenanceUpload: 'आपने जोड़ा',
    provenancePinterest: 'Pinterest से',
    caption: 'संदर्भ तस्वीर',
    sharedCaption: 'आपकी डिज़ाइन टीम यह बोर्ड देखती है।',
    addErrorTitle: 'संदर्भ जोड़ नहीं सका',
    rankThese: 'इन्हें रैंक करें',
    startProfileHint: 'इन तस्वीरों से AI सुझाव पाने के लिए अपनी शैली प्रोफ़ाइल शुरू करें।',
    startProfileCta: 'अपनी शैली प्रोफ़ाइल शुरू करें',
    earlierSaves: 'पहले की बचतें',
    earlierSavesHint: 'आपकी डिज़ाइन प्रोफ़ाइल से पहले सहेजी गईं — संदर्भ के लिए यहाँ रखी गई हैं।',
  },
}

function sourceLabel(t: typeof STR.en, source: string): string {
  return source === 'pinterest' ? t.provenancePinterest : t.provenanceUpload
}

export default function RoomReferences() {
  const { lang } = useT()
  const { theme } = useTheme()
  const router = useRouter()
  const toast = useToast()
  const { room } = useLocalSearchParams<{ room: string }>()
  const qc = useQueryClient()
  const t = STR[lang as 'en' | 'hi'] ?? STR.en
  const c = theme.colors

  // "all" means whole-house — no room_tag filter applied, and never maps to a
  // single profiler area (the caller shows the whole-house hub instead).
  const roomSlug = decodeURIComponent(room ?? 'all')
  const isAll = roomSlug === 'all'

  // ---- resolve site → profiler profile → matching area -------------------
  const propQ = useQuery({
    queryKey: ['homeowner', 'property'],
    queryFn: () => homeowner.property(),
  })
  const siteId = propQ.data?.site_id

  const profileQ = useQuery({
    queryKey: ['design', 'profiler', 'by-site', siteId],
    queryFn: () => design.profileBySite(siteId as string),
    enabled: !!siteId,
    retry: false,
  })
  const profile = profileQ.data
  const pid = profile?.id
  const area = !isAll && profile ? areaForRoom(roomSlug, profile.areas) : null

  // ---- profiler-backed references (only fetched once an area is resolved) --
  const profilerRefsQ = useQuery({
    queryKey: ['design', 'profiler', 'refs', pid, area?.id],
    queryFn: () => design.references(pid as string, area!.id),
    enabled: !!pid && !!area,
  })

  const addByUpload = useMutation({
    mutationFn: async (localUri: string) => {
      const presign = await design.presignMedia(pid as string)
      let imageKey: string
      if (presign.upload_mode === 'presigned' && presign.put_url) {
        const blob = await (await fetch(localUri)).blob()
        const put = await fetch(presign.put_url, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: blob,
        })
        if (!put.ok) throw new Error('Upload failed — please try again.')
        imageKey = presign.key
      } else {
        const up = await design.uploadMedia(pid as string, {
          uri: localUri,
          name: 'inspiration.jpg',
          type: 'image/jpeg',
        })
        imageKey = up.key
      }
      return design.addReference({
        area_id: area!.id,
        contributor_id: profile?.my_contributor_id ?? undefined,
        source_type: 'upload',
        image_r2_key: imageKey,
      })
    },
    onSuccess: () => {
      toast(t.addedToast, 'check')
      void qc.invalidateQueries({ queryKey: ['design', 'profiler', 'refs', pid, area?.id] })
      void qc.invalidateQueries({ queryKey: ['design', 'profiler'] })
    },
    onError: (e: Error) => Alert.alert(t.addErrorTitle, e.message),
  })

  // ---- legacy fallback (no area resolved yet) -----------------------------
  const legacyRefsQ = useQuery({
    queryKey: ['design', 'references'],
    queryFn: () => homeowner.designReferences(),
  })
  const allLegacyRefs = legacyRefsQ.data ?? []
  const roomLegacyRefs = isAll
    ? allLegacyRefs
    : allLegacyRefs.filter((r) => r.room_tag === roomSlug)

  const addLegacyMut = useMutation({
    mutationFn: async (asset: ImagePicker.ImagePickerAsset) => {
      const { image_url } = await homeowner.uploadReferenceImage({
        uri: asset.uri,
        name: asset.fileName ?? `reference-${Date.now()}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      })
      return homeowner.references({
        image_url,
        room_tag: isAll ? undefined : roomSlug,
        source: 'upload',
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['design', 'references'] })
      Alert.alert(t.title, t.addedToast)
    },
    onError: (err: Error) => Alert.alert(t.addErrorTitle, err.message),
  })

  const [earlierOpen, setEarlierOpen] = useState(false)

  async function pickImage(mode: 'profiler' | 'legacy') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(t.title, t.permissionDenied)
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
    })
    if (result.canceled || !result.assets?.length) return
    if (mode === 'profiler') {
      addByUpload.mutate(result.assets[0].uri)
    } else {
      addLegacyMut.mutate(result.assets[0])
    }
  }

  const surface = (children: React.ReactNode) => (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: theme.radii.card,
          padding: SPACE.lg,
        },
        theme.shadowCard,
      ]}
    >
      {children}
    </View>
  )

  const isLoadingContext = propQ.isLoading || profileQ.isLoading
  const profilerRefs = profilerRefsQ.data ?? []

  return (
    <Screen floatingNav>
      <SubHeader
        title={t.title}
        subtitle={isAll ? t.subtitleAll : area ? roomLabelForArea(area) : t.subtitle}
        onBack={() => router.back()}
      />

      <View style={{ gap: SPACE.xl, marginTop: SPACE.md }}>
        {/* Honest sharing caption — the profiler board is shared with the
            design team by construction; no stub toggle needed. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Feather name="users" size={14} color={c.textMute} />
          <Small muted>{t.sharedCaption}</Small>
        </View>

        {isLoadingContext ? (
          surface(<Small muted>{t.loading}</Small>)
        ) : area && pid ? (
          <>
            {/* Profiler-backed grid */}
            {profilerRefsQ.isLoading ? (
              surface(<Small muted>{t.loading}</Small>)
            ) : profilerRefsQ.isError ? (
              surface(
                <View style={{ gap: SPACE.sm }}>
                  <Small muted>{t.errorTitle}</Small>
                  <Button
                    title={t.retry}
                    variant="secondary"
                    onPress={() => void profilerRefsQ.refetch()}
                  />
                </View>,
              )
            ) : profilerRefs.length === 0 ? (
              <View
                style={{
                  borderRadius: theme.radii.card,
                  borderWidth: 1,
                  borderColor: c.line,
                  borderStyle: 'dashed',
                  backgroundColor: c.paper,
                  padding: SPACE.xl,
                  alignItems: 'center',
                  gap: SPACE.xs,
                }}
              >
                <Feather name="image" size={24} color={c.textMute} />
                <Small muted style={{ textAlign: 'center' }}>
                  {t.empty}
                </Small>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md }}>
                {profilerRefs.map((ref) => (
                  <PhotoTile
                    key={ref.id}
                    photo={{
                      id: ref.id,
                      imageUri: ref.image_url ?? '',
                      caption: sourceLabel(t, ref.source_type),
                    }}
                    variant="grid"
                    size={156}
                    style={{ width: 156 }}
                    labels={{
                      caption: t.caption,
                      translate: '',
                      save: '',
                      share: '',
                      hide: '',
                      video: '',
                      starred: '',
                    }}
                  />
                ))}
              </View>
            )}

            {/* Add + Rank these */}
            <View style={{ gap: SPACE.sm }}>
              <Button
                title={t.addButton}
                variant="secondary"
                loading={addByUpload.isPending}
                leading={<Feather name="plus" size={16} color={c.accentDeep} />}
                onPress={() => void pickImage('profiler')}
              />
              {profilerRefs.length > 0 ? (
                <Button
                  title={t.rankThese}
                  variant="primary"
                  leading={<Feather name="star" size={16} color={c.onAccent} />}
                  onPress={() =>
                    router.push({
                      pathname: '/(homeowner)/design/profiler/[area]',
                      params: { area: area.id, pid, key: area.area_key, tab: 'ranking' },
                    })
                  }
                />
              ) : null}
            </View>
          </>
        ) : (
          <>
            {/* Legacy behavior — no area resolved (custom room, or no profile yet) */}
            {legacyRefsQ.isLoading ? (
              surface(<Small muted>{t.loading}</Small>)
            ) : legacyRefsQ.isError ? (
              surface(
                <View style={{ gap: SPACE.sm }}>
                  <Small muted>{t.errorTitle}</Small>
                  <Button
                    title={t.retry}
                    variant="secondary"
                    onPress={() => void legacyRefsQ.refetch()}
                  />
                </View>,
              )
            ) : roomLegacyRefs.length === 0 ? (
              <View
                style={{
                  borderRadius: theme.radii.card,
                  borderWidth: 1,
                  borderColor: c.line,
                  borderStyle: 'dashed',
                  backgroundColor: c.paper,
                  padding: SPACE.xl,
                  alignItems: 'center',
                  gap: SPACE.xs,
                }}
              >
                <Feather name="image" size={24} color={c.textMute} />
                <Small muted style={{ textAlign: 'center' }}>
                  {t.empty}
                </Small>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md }}>
                {roomLegacyRefs.map((ref) => (
                  <PhotoTile
                    key={ref.id}
                    photo={{ id: ref.id, imageUri: ref.image_url, caption: sourceLabel(t, ref.source) }}
                    variant="grid"
                    size={156}
                    style={{ width: 156 }}
                    labels={{
                      caption: t.caption,
                      translate: '',
                      save: '',
                      share: '',
                      hide: '',
                      video: '',
                      starred: '',
                    }}
                  />
                ))}
              </View>
            )}

            <Button
              title={t.addButton}
              variant="secondary"
              loading={addLegacyMut.isPending}
              leading={<Feather name="plus" size={16} color={c.accentDeep} />}
              onPress={() => void pickImage('legacy')}
            />

            {/* Quiet hint → self-serve style profile start */}
            <View
              style={{
                flexDirection: 'row',
                gap: SPACE.sm,
                backgroundColor: c.paper,
                borderRadius: theme.radii.control,
                padding: SPACE.md,
                alignItems: 'flex-start',
              }}
            >
              <Feather name="feather" size={14} color={c.accent} style={{ marginTop: 1 }} />
              <View style={{ flex: 1, gap: SPACE.xs }}>
                <Micro muted>{t.startProfileHint}</Micro>
                <Button
                  title={t.startProfileCta}
                  variant="ghost"
                  onPress={() => router.push('/(homeowner)/design/profiler')}
                />
              </View>
            </View>
          </>
        )}

        {/* Earlier saves — legacy rows for this room, read-only, collapsed.
            Shown whenever legacy rows exist for the room, even once the
            profiler board is the live surface, so nothing already saved is
            silently lost. */}
        {area && roomLegacyRefs.length > 0 ? (
          <View style={{ gap: SPACE.sm }}>
            <Button
              title={`${t.earlierSaves} (${roomLegacyRefs.length})`}
              variant="ghost"
              leading={
                <Feather
                  name={earlierOpen ? 'chevron-down' : 'chevron-right'}
                  size={14}
                  color={c.textMute}
                />
              }
              onPress={() => setEarlierOpen((o) => !o)}
            />
            {earlierOpen ? (
              <View style={{ gap: SPACE.sm }}>
                <Micro muted>{t.earlierSavesHint}</Micro>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md }}>
                  {roomLegacyRefs.map((ref) => (
                    <View key={ref.id} style={{ width: 110, opacity: 0.85 }}>
                      <BlurUpImage
                        uri={ref.image_url}
                        style={{ width: 110, height: 110, borderRadius: theme.radii.chip }}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Screen>
  )
}
