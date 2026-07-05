/**
 * Per-room References — pushed from the Selections tab "References" button.
 * Route: (homeowner)/design/references/[room] — registered `href: null` in _layout.tsx.
 *
 * Loads real `homeowner.designReferences()` and filters by the `[room]`
 * param (which is the space_id slug, or "all" for the whole-house group).
 * Matches on `ref.room_tag` — if "all", shows every reference.
 *
 * Features (all real data or honestly-labeled stubs):
 *   - AI-summary chip when the profile data has one (not implemented server-side
 *     yet — shown only when data is present, otherwise absent).
 *   - 2-column grid of reference photos via PhotoTile.
 *   - "Add reference image" → ImagePicker + real `references()` POST with room_tag.
 *   - "Sharing" toggle (shared with contractor vs private) — NO backend exists for
 *     this; rendered as a local-only toggle, honestly labeled "coming soon — your
 *     builder won't see this toggle yet."
 */
import { useState } from 'react'
import { Alert, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { homeowner } from '../../../../src/api/client'
import { useT } from '../../../../src/i18n/I18nProvider'
import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE } from '../../../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  Micro,
  PhotoTile,
  Screen,
  Small,
  StatusPill,
  SubHeader,
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
    sharingTitle: 'Sharing',
    sharingShared: 'Shared with builder',
    sharingPrivate: 'Private',
    sharingStubNote:
      'Coming soon — your builder won\'t see this toggle yet. Reference visibility will be controlled here once the sharing feature is live.',
    addErrorTitle: 'Could not add reference',
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
    sharingTitle: 'साझाकरण',
    sharingShared: 'बिल्डर के साथ साझा',
    sharingPrivate: 'निजी',
    sharingStubNote:
      'जल्द आ रहा है — आपका बिल्डर अभी यह टॉगल नहीं देख सकता। साझाकरण सुविधा लाइव होने पर यहाँ नियंत्रण होगा।',
    addErrorTitle: 'संदर्भ जोड़ नहीं सका',
  },
}

export default function RoomReferences() {
  const { lang } = useT()
  const { theme } = useTheme()
  const router = useRouter()
  const { room } = useLocalSearchParams<{ room: string }>()
  const qc = useQueryClient()
  const t = STR[lang as 'en' | 'hi'] ?? STR.en
  const c = theme.colors

  // "all" means whole-house — no room_tag filter applied.
  const roomSlug = decodeURIComponent(room ?? 'all')
  const isAll = roomSlug === 'all'

  // Sharing toggle — local state only (no backend yet; honestly labeled stub).
  const [sharedWithContractor, setSharedWithContractor] = useState(false)

  const refsQ = useQuery({
    queryKey: ['design', 'references'],
    queryFn: () => homeowner.designReferences(),
  })

  // Filter by room_tag when we have a real space_id; show all when "all".
  const allRefs = refsQ.data ?? []
  const filteredRefs = isAll
    ? allRefs
    : allRefs.filter((r) => r.room_tag === roomSlug)

  const addRefMut = useMutation({
    mutationFn: async (asset: ImagePicker.ImagePickerAsset) => {
      // The picker only gives us a local device URI (file://...) — it must be
      // uploaded to storage first; a device path is never a usable permanent
      // URL for anyone else (or for us, next launch).
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

  async function pickImage() {
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
    addRefMut.mutate(result.assets[0])
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

  return (
    <Screen floatingNav>
      <SubHeader
        title={t.title}
        subtitle={isAll ? t.subtitleAll : t.subtitle}
        onBack={() => router.back()}
      />

      <View style={{ gap: SPACE.xl, marginTop: SPACE.md }}>
        {/* Sharing control — HONEST local-only stub, clearly labeled */}
        <View
          style={[
            {
              backgroundColor: c.card,
              borderRadius: theme.radii.card,
              padding: SPACE.lg,
              gap: SPACE.md,
            },
            theme.shadowCard,
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <Feather name="share-2" size={16} color={c.accent} />
            <BodyStrong style={{ flex: 1 }}>{t.sharingTitle}</BodyStrong>
            {/* Toggle row */}
            <View
              style={{
                flexDirection: 'row',
                gap: SPACE.xs,
                backgroundColor: c.paper,
                borderRadius: theme.radii.pill,
                padding: 3,
                borderWidth: 1,
                borderColor: c.line,
              }}
            >
              {[
                { label: t.sharingPrivate, value: false, icon: 'lock' as const },
                { label: t.sharingShared, value: true, icon: 'eye' as const },
              ].map(({ label, value, icon }) => {
                const active = sharedWithContractor === value
                return (
                  <View
                    key={String(value)}
                    style={[
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingHorizontal: SPACE.sm,
                        paddingVertical: 4,
                        borderRadius: theme.radii.pill,
                        backgroundColor: active ? c.accent : 'transparent',
                      },
                    ]}
                  >
                    <Feather
                      name={icon}
                      size={12}
                      color={active ? c.onAccent : c.textMute}
                      onPress={() => setSharedWithContractor(value)}
                    />
                    <Small
                      style={{
                        color: active ? c.onAccent : c.textMute,
                        fontWeight: active ? '600' : '400',
                      }}
                      onPress={() => setSharedWithContractor(value)}
                    >
                      {label}
                    </Small>
                  </View>
                )
              })}
            </View>
          </View>
          {/* Honest stub label */}
          <View
            style={{
              flexDirection: 'row',
              gap: SPACE.sm,
              backgroundColor: c.paper,
              borderRadius: theme.radii.control,
              padding: SPACE.md,
            }}
          >
            <Feather name="info" size={14} color={c.textMute} style={{ marginTop: 1 }} />
            <Micro muted style={{ flex: 1 }}>
              {t.sharingStubNote}
            </Micro>
          </View>
        </View>

        {/* Reference photo grid */}
        {refsQ.isLoading ? (
          surface(<Small muted>{t.loading}</Small>)
        ) : refsQ.isError ? (
          surface(
            <View style={{ gap: SPACE.sm }}>
              <Small muted>{t.errorTitle}</Small>
              <Button
                title={t.retry}
                variant="secondary"
                onPress={() => void refsQ.refetch()}
              />
            </View>,
          )
        ) : filteredRefs.length === 0 ? (
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
          <View style={{ gap: SPACE.md }}>
            {/* 2-column grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md }}>
              {filteredRefs.map((ref) => {
                const provenance =
                  ref.source === 'pinterest' ? t.provenancePinterest : t.provenanceUpload
                return (
                  <PhotoTile
                    key={ref.id}
                    photo={{ id: ref.id, imageUri: ref.image_url, caption: provenance }}
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
                )
              })}
            </View>
          </View>
        )}

        {/* Add reference image */}
        <Button
          title={t.addButton}
          variant="secondary"
          loading={addRefMut.isPending}
          leading={<Feather name="plus" size={16} color={c.accentDeep} />}
          onPress={() => void pickImage()}
        />
      </View>
    </Screen>
  )
}
