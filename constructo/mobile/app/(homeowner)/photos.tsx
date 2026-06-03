/**
 * Photos (H2) — the homeowner "Calm Cockpit" photos surface (handoff §5).
 *
 * Layout: an AI search bar (text + 🎤 mic), a "Latest" hero tile, a segmented
 * filter [All · By Room · By Milestone · My visits], a grouped grid (by
 * date / room / milestone) built from the reusable {@link PhotoTile}, a `+` FAB
 * for her own uploads, a quiet tile when the site is sparse, and a calm empty
 * state. Captions render as-is in the active language. A full-screen viewer is
 * pushed inline (no separate route yet) with caption · date · room · ⓘ
 * translate and Save / Share / Hide (Hide is per-member + reversible).
 *
 * Save: expo-media-library (download-then-save two-step).
 * Share: React Native built-in Share.share.
 * Free up space: FileSystem.deleteAsync on cacheDirectory.
 * Upload: intent capture only (noted to "My visits" locally) — no upload
 * endpoint yet. "Hide" is local-only, per-member, reversible.
 *
 * NOTE: this screen keeps its own `STR` string table (en/hi) by design — the
 * founder is migrating per-screen strings to the i18n catalog separately.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Feather } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImagePicker from 'expo-image-picker'
import * as MediaLibrary from 'expo-media-library'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { homeowner } from '../../src/api/client'
import type { Photo, QuietPeriod } from '../../src/api/types'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE, TAP } from '../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  CalmCard,
  Card,
  Display,
  H2,
  MonoSm,
  Screen,
  Small,
  PhotoTile,
  type PhotoTileData,
  FLOATING_NAV_CLEARANCE,
} from '../../src/ui'

/** Backend grouping view (drives the query); "My visits" is a client filter. */
type ViewMode = 'all' | 'room' | 'milestone'
/** The segmented filter tabs (UI). */
type FilterTab = 'all' | 'room' | 'milestone' | 'mine'
type RetentionDays = 7 | 30 | 90

const POLICY_KEY = 'constructo.photoPolicy'
/** Locally-noted uploads (intent capture only — no real upload endpoint yet). */

interface PhotoPolicy {
  keepStarredAndMilestone: boolean
  retentionDays: RetentionDays
}

const DEFAULT_POLICY: PhotoPolicy = { keepStarredAndMilestone: true, retentionDays: 30 }

const STR = {
  en: {
    title: 'Photos',
    subtitle: 'Curated by your builder',
    searchPlaceholder: 'Ask about a room, stage, or date…',
    mic: 'Search by voice',
    voiceTitle: 'Voice search',
    voiceBody: 'Voice search is coming soon — type a room, stage, or date for now.',
    latest: 'Latest from site',
    all: 'All',
    room: 'By Room',
    milestone: 'By Milestone',
    mine: 'My visits',
    unsorted: 'Unsorted',
    general: 'General',
    milestoneHeader: 'Milestone',
    loading: 'Loading photos…',
    empty: 'No photos yet — your builder will start sharing soon.',
    emptyMine: 'Nothing here yet. Tap + to add a photo from your visit.',
    noResults: 'No photos match that. Try another room, stage, or date.',
    quietTitle: 'Quiet on site right now',
    quietNextPrefix: 'Next photos expected around',
    error: 'Could not load photos. Pull to refresh in a moment.',
    retry: 'Try again',
    caption: 'No caption yet',
    starred: 'Kept',
    video: 'Video',
    translate: 'What does this mean?',
    translateBody:
      'A plain-language explanation is coming soon. For now you can ask your builder.',
    save: 'Save',
    share: 'Share',
    hide: 'Hide',
    close: 'Close',
    yourPhoto: 'Your photo',
    storageTitle: 'Storage',
    storageNote:
      'These photos live on the server and stay curated for you — nothing is really deleted from your account.',
    keepLabel: 'Keep kept + milestone photos',
    autoManage: 'Auto-manage cached photos older than',
    days7: '7 days',
    days30: '30 days',
    days90: '90 days',
    freeUp: 'Free up space',
    addPhoto: 'Add a photo',
    addNote: 'Share a photo from your own site visit.',
    takePhoto: 'Take a photo',
    chooseLibrary: 'Choose from library',
    cancel: 'Cancel',
    permTitle: 'Permission needed',
    permCamera: 'Allow camera access to take a photo.',
    permLibrary: 'Allow photo library access to choose a photo.',
    pickedTitle: 'Photo added',
    pickedBody: 'Your photo is saved under "My visits".',
    uploadFailed: 'Could not upload your photo. Please try again.',
    freedTitle: 'Cache cleared',
    freedBody: 'Local cache was cleared. Your curated photos stay on the server.',
    savedTitle: 'Saved',
    savedBody: 'Photo saved to your gallery.',
    saveErrorTitle: 'Could not save',
    saveErrorBody: 'Please try again.',
  },
  hi: {
    title: 'तस्वीरें',
    subtitle: 'आपके बिल्डर द्वारा चुनी गई',
    searchPlaceholder: 'कमरा, चरण या तारीख़ पूछें…',
    mic: 'आवाज़ से खोजें',
    voiceTitle: 'आवाज़ से खोज',
    voiceBody: 'आवाज़ से खोज जल्द आ रही है — अभी कमरा, चरण या तारीख़ टाइप करें।',
    latest: 'साइट से नवीनतम',
    all: 'सभी',
    room: 'कमरे अनुसार',
    milestone: 'चरण अनुसार',
    mine: 'मेरी तस्वीरें',
    unsorted: 'बिना श्रेणी',
    general: 'सामान्य',
    milestoneHeader: 'चरण',
    loading: 'तस्वीरें लोड हो रही हैं…',
    empty: 'अभी कोई तस्वीर नहीं — आपका बिल्डर जल्द साझा करना शुरू करेगा।',
    emptyMine: 'अभी यहाँ कुछ नहीं। अपनी विज़िट की तस्वीर जोड़ने के लिए + दबाएँ।',
    noResults: 'इससे कोई तस्वीर मेल नहीं खाई। कोई और कमरा, चरण या तारीख़ आज़माएँ।',
    quietTitle: 'अभी साइट पर शांति है',
    quietNextPrefix: 'अगली तस्वीरें लगभग',
    error: 'तस्वीरें लोड नहीं हो सकीं। थोड़ी देर में फिर कोशिश करें।',
    retry: 'फिर कोशिश करें',
    caption: 'अभी कोई कैप्शन नहीं',
    starred: 'सहेजी',
    video: 'वीडियो',
    translate: 'इसका क्या मतलब है?',
    translateBody: 'आसान भाषा में समझ जल्द आ रही है। अभी आप अपने बिल्डर से पूछ सकते हैं।',
    save: 'सहेजें',
    share: 'साझा करें',
    hide: 'छिपाएँ',
    close: 'बंद करें',
    yourPhoto: 'आपकी तस्वीर',
    storageTitle: 'स्टोरेज',
    storageNote:
      'ये तस्वीरें सर्वर पर रहती हैं और आपके लिए सुरक्षित हैं — आपके खाते से कुछ भी वास्तव में हटाया नहीं जाता।',
    keepLabel: 'सहेजी + चरण तस्वीरें रखें',
    autoManage: 'इससे पुरानी कैश तस्वीरें स्वतः प्रबंधित करें',
    days7: '7 दिन',
    days30: '30 दिन',
    days90: '90 दिन',
    freeUp: 'जगह खाली करें',
    addPhoto: 'तस्वीर जोड़ें',
    addNote: 'अपनी साइट विज़िट की तस्वीर साझा करें।',
    takePhoto: 'तस्वीर लें',
    chooseLibrary: 'लाइब्रेरी से चुनें',
    cancel: 'रद्द करें',
    permTitle: 'अनुमति आवश्यक',
    permCamera: 'तस्वीर लेने के लिए कैमरा एक्सेस की अनुमति दें।',
    permLibrary: 'तस्वीर चुनने के लिए लाइब्रेरी एक्सेस की अनुमति दें।',
    pickedTitle: 'तस्वीर जोड़ी गई',
    pickedBody: 'आपकी तस्वीर "मेरी तस्वीरें" में सहेजी गई है।',
    uploadFailed: 'तस्वीर अपलोड नहीं हो सकी। कृपया फिर कोशिश करें।',
    freedTitle: 'कैश साफ़ किया गया',
    freedBody: 'लोकल कैश साफ़ हो गया। आपकी तस्वीरें सर्वर पर सुरक्षित रहती हैं।',
    savedTitle: 'सहेजा गया',
    savedBody: 'तस्वीर आपकी गैलरी में सहेजी गई।',
    saveErrorTitle: 'सहेजा नहीं जा सका',
    saveErrorBody: 'कृपया फिर कोशिश करें।',
  },
} as const

/** Short date — "6 Jun" — for tiles + quiet-card next-expected display. */
function shortDate(iso: string | null, lang: 'en' | 'hi'): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
  })
}

/** Long date header — "6 June 2026" — for the "All" date-group headings. */
function formatDate(iso: string, lang: 'en' | 'hi'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

interface Group {
  key: string
  label: string
  items: Photo[]
}

function groupPhotos(
  photos: Photo[],
  view: ViewMode,
  lang: 'en' | 'hi',
  s: { unsorted: string; general: string; milestoneHeader: string },
): Group[] {
  const map = new Map<string, Group>()
  const order: string[] = []

  for (const p of photos) {
    let key: string
    let label: string
    if (view === 'room') {
      key = p.room_tag ?? '__unsorted__'
      label = p.room_tag ?? s.unsorted
    } else if (view === 'milestone') {
      key = p.milestone_id ?? '__general__'
      label = p.milestone_id ? `${s.milestoneHeader} ${p.milestone_id}` : s.general
    } else {
      // "all" — group by the date (day) of publication.
      const day = (p.published_at ?? '').slice(0, 10)
      key = day || '__undated__'
      label = day ? formatDate(p.published_at, lang) : ''
    }
    let group = map.get(key)
    if (!group) {
      group = { key, label, items: [] }
      map.set(key, group)
      order.push(key)
    }
    group.items.push(p)
  }
  return order.map((k) => map.get(k)!)
}

/** Below this count the grid feels "sparse" → show a calm quiet tile alongside. */
const SPARSE_THRESHOLD = 3

export default function Photos() {
  const { theme } = useTheme()
  const c = theme.colors
  const { lang } = useT()
  const s = STR[lang]
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()

  const [tab, setTab] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [active, setActive] = useState<Photo | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [policy, setPolicy] = useState<PhotoPolicy>(DEFAULT_POLICY)
  const queryClient = useQueryClient()

  // Grouping mode for the curated tabs ("My visits" has no grouping — its grid
  // is a flat, newest-first list of her own uploads).
  const view: ViewMode = tab === 'mine' ? 'all' : tab

  // Load persisted storage policy + locally-noted "my visit" photos.
  useEffect(() => {
    void AsyncStorage.getItem(POLICY_KEY).then((raw) => {
      if (!raw) return
      try {
        const parsed = JSON.parse(raw) as Partial<PhotoPolicy>
        setPolicy({
          keepStarredAndMilestone:
            parsed.keepStarredAndMilestone ?? DEFAULT_POLICY.keepStarredAndMilestone,
          retentionDays: (parsed.retentionDays ?? DEFAULT_POLICY.retentionDays) as RetentionDays,
        })
      } catch {
        /* corrupt value — keep defaults */
      }
    })
  }, [])

  const savePolicy = useCallback((next: PhotoPolicy) => {
    setPolicy(next)
    void AsyncStorage.setItem(POLICY_KEY, JSON.stringify(next))
  }, [])

  const query = useQuery({
    queryKey: ['photos', tab],
    queryFn: () => homeowner.photos(undefined, tab),
  })

  const quietQ = useQuery({
    queryKey: ['homeowner', 'quietPeriods'],
    queryFn: () => homeowner.quietPeriods(),
  })
  // Most-recent confirmed quiet period — the endpoint orders detected_at DESC.
  const activeQuiet: QuietPeriod | null = quietQ.data?.[0] ?? null

  // Visible site photos: not hidden + matching the search query (caption/room).
  const q = search.trim().toLowerCase()
  const sitePhotos = useMemo(() => {
    let items = (query.data?.items ?? []).filter((p) => !hidden.has(p.id))
    if (q) {
      items = items.filter(
        (p) =>
          (p.caption ?? '').toLowerCase().includes(q) ||
          (p.room_tag ?? '').toLowerCase().includes(q),
      )
    }
    return items
  }, [query.data, hidden, q])

  // The newest published photo → the "Latest from site" hero (only on "All",
  // with no active search, so the hero stays a true "most-recent" cue).
  const latest = useMemo(() => {
    if (tab !== 'all' || q) return null
    const all = (query.data?.items ?? []).filter((p) => !hidden.has(p.id))
    return all.length ? all[0] : null
  }, [query.data, hidden, tab, q])

  // Grid groups: site photos for all/room/milestone, minus the hero on "All".
  const groups = useMemo(() => {
    if (tab === 'mine') return []
    const forGrid = latest ? sitePhotos.filter((p) => p.id !== latest.id) : sitePhotos
    return groupPhotos(forGrid, view, lang, s)
  }, [sitePhotos, latest, view, lang, s, tab])

  const hide = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    setActive(null)
  }, [])

  // ---- Upload (permission + picker → POST to R2-backed endpoint → refresh) ----
  const doUpload = useCallback(
    async (asset: ImagePicker.ImagePickerAsset) => {
      setUploading(true)
      try {
        await homeowner.uploadVisitPhoto({
          uri: asset.uri,
          name: asset.fileName ?? `visit-${Date.now()}.jpg`,
          type: asset.mimeType ?? 'image/jpeg',
        })
        await queryClient.invalidateQueries({ queryKey: ['photos', 'mine'] })
        setTab('mine')
        Alert.alert(s.pickedTitle, s.pickedBody)
      } catch {
        Alert.alert(s.error, s.uploadFailed)
      } finally {
        setUploading(false)
      }
    },
    [queryClient, s],
  )

  const onTakePhoto = useCallback(async () => {
    setUploadOpen(false)
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(s.permTitle, s.permCamera)
      return
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 })
    if (!result.canceled && result.assets[0]) await doUpload(result.assets[0])
  }, [s, doUpload])

  const onChooseLibrary = useCallback(async () => {
    setUploadOpen(false)
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(s.permTitle, s.permLibrary)
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 })
    if (!result.canceled && result.assets[0]) await doUpload(result.assets[0])
  }, [s, doUpload])

  const onFreeUpSpace = useCallback(async () => {
    try {
      await FileSystem.deleteAsync(FileSystem.cacheDirectory ?? '', { idempotent: true })
    } catch {
      // Non-fatal — server data is unaffected.
    }
    Alert.alert(s.freedTitle, s.freedBody)
  }, [s])

  const onSavePhoto = useCallback(
    async (url?: string, id?: string) => {
      if (!url) return
      const { status } = await MediaLibrary.requestPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(s.permTitle, s.permLibrary)
        return
      }
      try {
        const localUri = await FileSystem.downloadAsync(
          url,
          (FileSystem.cacheDirectory ?? '') + (id ?? 'photo') + '.jpg',
        )
        await MediaLibrary.saveToLibraryAsync(localUri.uri)
        Alert.alert(s.savedTitle, s.savedBody)
      } catch {
        Alert.alert(s.saveErrorTitle, s.saveErrorBody)
      }
    },
    [s],
  )

  const onSharePhoto = useCallback(
    async (url?: string, caption?: string | null) => {
      if (!url) return
      await Share.share({ message: caption ?? s.caption, url })
    },
    [s],
  )

  const onTranslate = useCallback(() => {
    // ⓘ jargon-translate — honest "coming soon + ask your builder" (§0 rule 5).
    Alert.alert(s.translate, s.translateBody)
  }, [s])

  // 2-column square grid sizing (Screen pads SPACE.lg each side).
  const gridGap = SPACE.sm
  const contentWidth = width - SPACE.lg * 2
  const cellSize = Math.floor((contentWidth - gridGap) / 2)

  // The homeowner layout's `sceneStyle` already reserves room for the floating
  // bar + Ask pill (FLOATING_NAV_CLEARANCE); keep only a small breathing pad.
  const navClearance = insets.bottom + FLOATING_NAV_CLEARANCE

  // Shared PhotoTile action labels.
  const tileLabels = {
    caption: s.caption,
    translate: s.translate,
    save: s.save,
    share: s.share,
    hide: s.hide,
    video: s.video,
    starred: s.starred,
  }

  /** Adapt a backend Photo → the PhotoTile data shape (active-language date). */
  const toTile = useCallback(
    (p: Photo): PhotoTileData => ({
      id: p.id,
      imageUri: p.image_url,
      caption: p.caption,
      date: shortDate(p.published_at, lang),
      room: p.room_tag,
      starred: p.is_starred,
    }),
    [lang],
  )

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: s.all },
    { id: 'room', label: s.room },
    { id: 'milestone', label: s.milestone },
    { id: 'mine', label: s.mine },
  ]

  return (
    <Screen style={{ paddingBottom: navClearance }}>
      <View style={{ gap: 2 }}>
        <Display>{s.title}</Display>
        <Small muted>{s.subtitle}</Small>
      </View>

      {/* AI search bar (text + 🎤 mic) */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
          backgroundColor: AP.surfaceLow,
          borderRadius: theme.radii.control,
          borderWidth: 1,
          borderColor: c.line,
          paddingHorizontal: SPACE.md,
          minHeight: TAP,
        }}
      >
        <Feather name="search" size={18} color={c.textMute} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={s.searchPlaceholder}
          placeholderTextColor={c.textMute}
          returnKeyType="search"
          accessibilityLabel={s.searchPlaceholder}
          style={{ flex: 1, color: c.text, fontSize: 16, paddingVertical: SPACE.sm }}
        />
        {search ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={s.close}
            onPress={() => setSearch('')}
            hitSlop={8}
          >
            <Feather name="x" size={18} color={c.textMute} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={s.mic}
          onPress={() => Alert.alert(s.voiceTitle, s.voiceBody)}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Feather name="mic" size={18} color={c.accent} />
        </Pressable>
      </View>

      {/* Segmented filter [All · By Room · By Milestone · My visits] */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: c.paper,
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: theme.radii.pill,
          padding: SPACE.xs,
          gap: SPACE.xs,
        }}
      >
        {tabs.map((t) => {
          const activeTab = tab === t.id
          return (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab }}
              onPress={() => setTab(t.id)}
              style={{
                flex: 1,
                minHeight: 36,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radii.pill,
                backgroundColor: activeTab ? c.accent : 'transparent',
                paddingVertical: SPACE.sm,
                paddingHorizontal: 2,
              }}
            >
              <Small
                color={activeTab ? c.onAccent : c.textMute}
                style={{ fontWeight: '600' }}
                numberOfLines={1}
              >
                {t.label}
              </Small>
            </Pressable>
          )
        })}
      </View>

      {/* ---- My visits tab (her own uploaded photos, served from R2) ---- */}
      {tab === 'mine' ? (
        query.isLoading ? (
          <Card>
            <View style={{ alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.lg }}>
              <ActivityIndicator color={c.accent} />
              <Small muted>{s.loading}</Small>
            </View>
          </Card>
        ) : sitePhotos.length === 0 ? (
          <Card>
            <View style={{ alignItems: 'center', paddingVertical: SPACE.xl }}>
              <Feather name="camera" size={28} color={c.textMute} />
              <Body muted style={{ textAlign: 'center', marginTop: SPACE.md }}>
                {s.emptyMine}
              </Body>
            </View>
          </Card>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }}>
            {sitePhotos.map((p) => (
              <PhotoTile
                key={p.id}
                photo={{
                  id: p.id,
                  imageUri: p.image_url,
                  caption: p.caption ?? s.yourPhoto,
                  date: shortDate(p.published_at, lang),
                }}
                size={cellSize}
                labels={tileLabels}
              />
            ))}
          </View>
        )
      ) : query.isLoading ? (
        <Card>
          <View style={{ alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.lg }}>
            <ActivityIndicator color={c.accent} />
            <Small muted>{s.loading}</Small>
          </View>
        </Card>
      ) : query.isError ? (
        <Card>
          <View style={{ gap: SPACE.md }}>
            <Body>{s.error}</Body>
            <Button title={s.retry} variant="secondary" onPress={() => query.refetch()} />
          </View>
        </Card>
      ) : sitePhotos.length === 0 ? (
        // Empty / quiet / no-search-results — all calm, never red.
        q ? (
          <Card>
            <View style={{ alignItems: 'center', paddingVertical: SPACE.xl }}>
              <Feather name="search" size={28} color={c.textMute} />
              <Body muted style={{ textAlign: 'center', marginTop: SPACE.md }}>
                {s.noResults}
              </Body>
            </View>
          </Card>
        ) : activeQuiet ? (
          (() => {
            const nextDate = shortDate(activeQuiet.next_expected_at, lang)
            const bodyParts: string[] = []
            if (activeQuiet.reason) bodyParts.push(activeQuiet.reason)
            if (nextDate) bodyParts.push(`${s.quietNextPrefix} ${nextDate}.`)
            return (
              <CalmCard
                status="quiet"
                title={s.quietTitle}
                body={bodyParts.join(' ') || undefined}
              />
            )
          })()
        ) : (
          <Card>
            <View style={{ alignItems: 'center', paddingVertical: SPACE.xl }}>
              <Feather name="image" size={28} color={c.textMute} />
              <Body muted style={{ textAlign: 'center', marginTop: SPACE.md }}>
                {s.empty}
              </Body>
            </View>
          </Card>
        )
      ) : (
        <View style={{ gap: SPACE.lg }}>
          {/* "Latest" hero (only on All, no search) */}
          {latest ? (
            <View style={{ gap: SPACE.sm }}>
              <Small muted style={{ fontWeight: '600', letterSpacing: 0.5 }}>
                {s.latest.toUpperCase()}
              </Small>
              <PhotoTile
                photo={toTile(latest)}
                variant="hero"
                labels={tileLabels}
                onPress={() => setActive(latest)}
                onTranslate={onTranslate}
              />
            </View>
          ) : null}

          {/* Quiet tile when the site is sparse (calm, never red, fade only) */}
          {!q && activeQuiet && sitePhotos.length <= SPARSE_THRESHOLD ? (
            (() => {
              const nextDate = shortDate(activeQuiet.next_expected_at, lang)
              const bodyParts: string[] = []
              if (activeQuiet.reason) bodyParts.push(activeQuiet.reason)
              if (nextDate) bodyParts.push(`${s.quietNextPrefix} ${nextDate}.`)
              return (
                <CalmCard
                  status="quiet"
                  title={s.quietTitle}
                  body={bodyParts.join(' ') || undefined}
                />
              )
            })()
          ) : null}

          {/* Grouped grid */}
          {groups.map((group) => (
            <View key={group.key} style={{ gap: SPACE.sm }}>
              {group.label ? (
                <Small muted style={{ fontWeight: '600' }}>
                  {group.label}
                </Small>
              ) : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }}>
                {group.items.map((photo) => (
                  <PhotoTile
                    key={photo.id}
                    photo={toTile(photo)}
                    size={cellSize}
                    labels={tileLabels}
                    onPress={() => setActive(photo)}
                    onTranslate={onTranslate}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Storage management */}
      <Card>
        <View style={{ gap: SPACE.md }}>
          <H2>{s.storageTitle}</H2>

          {/* Keep kept + milestone toggle */}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: policy.keepStarredAndMilestone }}
            onPress={() =>
              savePolicy({ ...policy, keepStarredAndMilestone: !policy.keepStarredAndMilestone })
            }
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.md,
              minHeight: TAP,
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: policy.keepStarredAndMilestone ? c.accent : c.line,
                backgroundColor: policy.keepStarredAndMilestone ? c.accent : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {policy.keepStarredAndMilestone ? (
                <Feather name="check" size={16} color={c.onAccent} />
              ) : null}
            </View>
            <Body style={{ flex: 1 }}>{s.keepLabel}</Body>
          </Pressable>

          {/* Auto-manage retention radios */}
          <Small muted>{s.autoManage}</Small>
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            {([7, 30, 90] as RetentionDays[]).map((days) => {
              const selected = policy.retentionDays === days
              const label = days === 7 ? s.days7 : days === 30 ? s.days30 : s.days90
              return (
                <Pressable
                  key={days}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => savePolicy({ ...policy, retentionDays: days })}
                  style={{
                    flex: 1,
                    minHeight: TAP,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.radii.control,
                    borderWidth: 1,
                    borderColor: selected ? c.accent : c.line,
                    backgroundColor: selected ? c.accent : 'transparent',
                  }}
                >
                  <Small color={selected ? c.onAccent : c.text} style={{ fontWeight: '600' }}>
                    {label}
                  </Small>
                </Pressable>
              )
            })}
          </View>

          <Button title={s.freeUp} variant="secondary" block onPress={onFreeUpSpace} />
          <Small muted>{s.storageNote}</Small>
        </View>
      </Card>

      {/* Floating "+" upload FAB (above the floating nav) */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={s.addPhoto}
        accessibilityState={{ disabled: uploading }}
        disabled={uploading}
        onPress={() => setUploadOpen(true)}
        style={({ pressed }) => ({
          position: 'absolute',
          right: SPACE.lg,
          bottom: navClearance - 8,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: c.accent,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.96 : 1 }],
          ...theme.shadowCard,
        })}
      >
        {uploading ? (
          <ActivityIndicator color={c.onAccent} />
        ) : (
          <Feather name="plus" size={26} color={c.onAccent} />
        )}
      </Pressable>

      {/* Full-screen viewer (pushed inline; no separate route yet) */}
      <Modal
        visible={active !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActive(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' }}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              padding: SPACE.lg,
              paddingTop: insets.top + SPACE.lg,
              paddingBottom: insets.bottom + SPACE.xl,
            }}
          >
            {active ? (
              <View style={{ gap: SPACE.lg }}>
                <Image
                  source={{ uri: active.image_url }}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                  style={{ width: '100%', height: width, borderRadius: theme.radii.card }}
                />

                {/* Caption + ⓘ translate */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm }}>
                  <BodyStrong color="#ffffff" style={{ flex: 1 }}>
                    {active.caption ?? s.caption}
                  </BodyStrong>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={s.translate}
                    onPress={onTranslate}
                    hitSlop={8}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingTop: 2 })}
                  >
                    <Feather name="info" size={20} color="#ffffff" />
                  </Pressable>
                </View>

                {/* Date · room */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
                  <MonoSm color={AP.onDarkMuted}>{shortDate(active.published_at, lang)}</MonoSm>
                  {active.room_tag ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: 'rgba(255,255,255,0.15)',
                        borderRadius: 9999,
                        paddingVertical: 2,
                        paddingHorizontal: 8,
                      }}
                    >
                      <Feather name="map-pin" size={11} color="#ffffff" />
                      <Small color="#ffffff" style={{ fontWeight: '600' }}>
                        {active.room_tag}
                      </Small>
                    </View>
                  ) : null}
                </View>

                {/* Save / Share / Hide */}
                <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                  <Button
                    title={s.save}
                    variant="secondary"
                    style={{ flex: 1 }}
                    onPress={() => onSavePhoto(active.image_url, active.id)}
                  />
                  <Button
                    title={s.share}
                    variant="secondary"
                    style={{ flex: 1 }}
                    onPress={() => onSharePhoto(active.image_url, active.caption)}
                  />
                  <Button
                    title={s.hide}
                    variant="ghost"
                    style={{ flex: 1 }}
                    onPress={() => hide(active.id)}
                  />
                </View>
                <Button title={s.close} variant="ghost" block onPress={() => setActive(null)} />
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      {/* Upload-intent sheet */}
      <Modal
        visible={uploadOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setUploadOpen(false)}
      >
        <Pressable
          onPress={() => setUploadOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => {
              /* swallow taps inside the sheet */
            }}
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: theme.radii.sheet,
              borderTopRightRadius: theme.radii.sheet,
              padding: SPACE.lg,
              paddingBottom: insets.bottom + SPACE.xl,
              gap: SPACE.md,
            }}
          >
            <H2>{s.addPhoto}</H2>
            <Small muted>{s.addNote}</Small>
            <Button title={s.takePhoto} block onPress={onTakePhoto} />
            <Button title={s.chooseLibrary} variant="secondary" block onPress={onChooseLibrary} />
            <Button title={s.cancel} variant="ghost" block onPress={() => setUploadOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  )
}
