/**
 * Photos & Videos (H2) — curated site photos, grouped by date / room / milestone,
 * with a full-screen viewer, client-side storage policy, and an upload-intent sheet.
 *
 * Save: expo-media-library (download-then-save two-step).
 * Share: React Native built-in Share.share.
 * Free up space: FileSystem.deleteAsync on cacheDirectory.
 * Upload: coming soon — intent capture only, no upload endpoint yet.
 * "Hide" is local-only state.
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
  useWindowDimensions,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Feather } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImagePicker from 'expo-image-picker'
import * as MediaLibrary from 'expo-media-library'
import { useQuery } from '@tanstack/react-query'

import { homeowner } from '../../src/api/client'
import type { Photo, QuietPeriod } from '../../src/api/types'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  CalmCard,
  Card,
  Display,
  H2,
  Screen,
  Small,
} from '../../src/ui'

type ViewMode = 'all' | 'room' | 'milestone'
type RetentionDays = 7 | 30 | 90

const POLICY_KEY = 'constructo.photoPolicy'

interface PhotoPolicy {
  keepStarredAndMilestone: boolean
  retentionDays: RetentionDays
}

const DEFAULT_POLICY: PhotoPolicy = { keepStarredAndMilestone: true, retentionDays: 30 }

const STR = {
  en: {
    title: 'Photos & Videos',
    all: 'All',
    room: 'By Room',
    milestone: 'By Milestone',
    unsorted: 'Unsorted',
    general: 'General',
    milestoneHeader: 'Milestone',
    loading: 'Loading photos…',
    empty: 'No photos yet — your builder will share progress here.',
    quietTitle: 'Quiet on site right now',
    quietNextPrefix: 'Next photos expected around',
    error: 'Could not load photos. Pull to refresh in a moment.',
    retry: 'Try again',
    caption: 'No caption',
    starred: 'Starred',
    save: 'Save',
    share: 'Share',
    hide: 'Hide',
    close: 'Close',
    storageTitle: 'Storage management',
    storageNote:
      'These photos live on the server and stay curated for you — nothing is really deleted from your account.',
    keepLabel: 'Keep starred + milestone photos',
    autoManage: 'Auto-manage cached photos older than',
    days7: '7 days',
    days30: '30 days',
    days90: '90 days',
    freeUp: 'Free up space',
    addPhoto: 'Add a photo',
    takePhoto: 'Take a photo',
    chooseLibrary: 'Choose from library',
    cancel: 'Cancel',
    permTitle: 'Permission needed',
    permCamera: 'Allow camera access to take a photo.',
    permLibrary: 'Allow photo library access to choose a photo.',
    pickedTitle: 'Photo noted',
    pickedBody: 'Uploads are coming soon — your photo has been noted locally.',
    freedTitle: 'Cache cleared',
    freedBody: 'Local cache was cleared. Your curated photos stay on the server.',
    savedTitle: 'Saved',
    savedBody: 'Photo saved to your gallery.',
    saveErrorTitle: 'Could not save',
    saveErrorBody: 'Please try again.',
  },
  hi: {
    title: 'फ़ोटो और वीडियो',
    all: 'सभी',
    room: 'कमरे अनुसार',
    milestone: 'चरण अनुसार',
    unsorted: 'बिना श्रेणी',
    general: 'सामान्य',
    milestoneHeader: 'चरण',
    loading: 'फ़ोटो लोड हो रही हैं…',
    empty: 'अभी कोई फ़ोटो नहीं — आपका बिल्डर यहाँ प्रगति साझा करेगा।',
    quietTitle: 'अभी साइट पर शांति है',
    quietNextPrefix: 'अगली फ़ोटो लगभग',
    error: 'फ़ोटो लोड नहीं हो सकीं। थोड़ी देर में फिर कोशिश करें।',
    retry: 'फिर कोशिश करें',
    caption: 'कोई कैप्शन नहीं',
    starred: 'चिह्नित',
    save: 'सहेजें',
    share: 'साझा करें',
    hide: 'छिपाएँ',
    close: 'बंद करें',
    storageTitle: 'स्टोरेज प्रबंधन',
    storageNote:
      'ये फ़ोटो सर्वर पर रहती हैं और आपके लिए सुरक्षित हैं — आपके खाते से कुछ भी वास्तव में हटाया नहीं जाता।',
    keepLabel: 'चिह्नित + चरण फ़ोटो रखें',
    autoManage: 'इससे पुरानी कैश फ़ोटो स्वतः प्रबंधित करें',
    days7: '7 दिन',
    days30: '30 दिन',
    days90: '90 दिन',
    freeUp: 'जगह खाली करें',
    addPhoto: 'फ़ोटो जोड़ें',
    takePhoto: 'फ़ोटो लें',
    chooseLibrary: 'लाइब्रेरी से चुनें',
    cancel: 'रद्द करें',
    permTitle: 'अनुमति आवश्यक',
    permCamera: 'फ़ोटो लेने के लिए कैमरा एक्सेस की अनुमति दें।',
    permLibrary: 'फ़ोटो चुनने के लिए लाइब्रेरी एक्सेस की अनुमति दें।',
    pickedTitle: 'फ़ोटो नोट की गई',
    pickedBody: 'अपलोड जल्द आ रहा है — आपकी फ़ोटो लोकली नोट की गई है।',
    freedTitle: 'कैश साफ़ किया गया',
    freedBody: 'लोकल कैश साफ़ हो गया। आपकी फ़ोटो सर्वर पर सुरक्षित रहती हैं।',
    savedTitle: 'सहेजा गया',
    savedBody: 'फ़ोटो आपकी गैलरी में सहेजी गई।',
    saveErrorTitle: 'सहेजा नहीं जा सका',
    saveErrorBody: 'कृपया फिर कोशिश करें।',
  },
} as const

/** Short date — "6 Jun" — for quiet-card next-expected display. */
function shortDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

interface Group {
  key: string
  label: string
  items: Photo[]
}

function formatDate(iso: string, lang: 'en' | 'hi'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
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
      // "all" — group by the date (day) of publication
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

export default function Photos() {
  const { theme } = useTheme()
  const c = theme.colors
  const { lang } = useT()
  const s = STR[lang]
  const { width } = useWindowDimensions()

  const [view, setView] = useState<ViewMode>('all')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [active, setActive] = useState<Photo | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [policy, setPolicy] = useState<PhotoPolicy>(DEFAULT_POLICY)

  // Load persisted storage policy.
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
    queryKey: ['photos', view],
    queryFn: () => homeowner.photos(undefined, view),
  })

  const quietQ = useQuery({
    queryKey: ['homeowner', 'quietPeriods'],
    queryFn: () => homeowner.quietPeriods(),
  })
  // Most-recent confirmed quiet period — the endpoint orders detected_at DESC,
  // so the newest is the first element.
  const activeQuiet: QuietPeriod | null = quietQ.data?.[0] ?? null

  const visible = useMemo(
    () => (query.data?.items ?? []).filter((p) => !hidden.has(p.id)),
    [query.data, hidden],
  )
  const groups = useMemo(
    () => groupPhotos(visible, view, lang, s),
    [visible, view, lang, s],
  )

  const hide = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    setActive(null)
  }, [])

  // ---- Upload-intent (permission + picker; no real upload yet) ----
  const onTakePhoto = useCallback(async () => {
    setUploadOpen(false)
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(s.permTitle, s.permCamera)
      return
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 })
    if (!result.canceled) {
      // TODO(H?): POST the picked asset to the (not-yet-defined) upload endpoint.
      Alert.alert(s.pickedTitle, s.pickedBody)
    }
  }, [s])

  const onChooseLibrary = useCallback(async () => {
    setUploadOpen(false)
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(s.permTitle, s.permLibrary)
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 })
    if (!result.canceled) {
      // TODO(H?): POST the picked asset to the (not-yet-defined) upload endpoint.
      Alert.alert(s.pickedTitle, s.pickedBody)
    }
  }, [s])

  const onFreeUpSpace = useCallback(async () => {
    try {
      await FileSystem.deleteAsync(FileSystem.cacheDirectory ?? '', { idempotent: true })
    } catch {
      // Non-fatal — server data is unaffected.
    }
    Alert.alert(s.freedTitle, s.freedBody)
  }, [s])

  // 2-column square grid sizing (Screen pads SPACE.lg on each side; Card pads SPACE.lg).
  const gridGap = SPACE.sm
  const contentWidth = width - SPACE.lg * 2
  const cellSize = Math.floor((contentWidth - gridGap) / 2)

  const tabs: { mode: ViewMode; label: string }[] = [
    { mode: 'all', label: s.all },
    { mode: 'room', label: s.room },
    { mode: 'milestone', label: s.milestone },
  ]

  return (
    <Screen>
      <Display>{s.title}</Display>

      {/* Segmented control */}
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
        {tabs.map((tab) => {
          const activeTab = view === tab.mode
          return (
            <Pressable
              key={tab.mode}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab }}
              onPress={() => setView(tab.mode)}
              style={{
                flex: 1,
                minHeight: 36,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radii.pill,
                backgroundColor: activeTab ? c.accent : 'transparent',
                paddingVertical: SPACE.sm,
              }}
            >
              <Small
                color={activeTab ? c.onAccent : c.textMute}
                style={{ fontWeight: '600' }}
              >
                {tab.label}
              </Small>
            </Pressable>
          )
        })}
      </View>

      {/* Body: loading / error / empty / grid */}
      {query.isLoading ? (
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
      ) : visible.length === 0 ? (
        activeQuiet ? (
          (() => {
            const nextDate = shortDate(activeQuiet.next_expected_at)
            const bodyParts: string[] = []
            if (activeQuiet.reason) bodyParts.push(activeQuiet.reason)
            if (nextDate) bodyParts.push(`${s.quietNextPrefix} ${nextDate}.`)
            return (
              <CalmCard
                status="info"
                title={s.quietTitle}
                body={bodyParts.join(' ') || undefined}
              />
            )
          })()
        ) : (
          <Card>
            <View style={{ alignItems: 'center', paddingVertical: SPACE.xl }}>
              <Body muted style={{ textAlign: 'center' }}>
                {s.empty}
              </Body>
            </View>
          </Card>
        )
      ) : (
        <View style={{ gap: SPACE.lg }}>
          {groups.map((group) => (
            <View key={group.key} style={{ gap: SPACE.sm }}>
              {group.label ? (
                <Small muted style={{ fontWeight: '600' }}>
                  {group.label}
                </Small>
              ) : null}
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: gridGap,
                }}
              >
                {group.items.map((photo) => (
                  <Pressable
                    key={photo.id}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={photo.caption ?? s.caption}
                    onPress={() => setActive(photo)}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      borderRadius: theme.radii.card,
                      overflow: 'hidden',
                      backgroundColor: c.paper,
                      borderWidth: 1,
                      borderColor: c.line,
                    }}
                  >
                    <Image
                      source={{ uri: photo.image_url }}
                      resizeMode="cover"
                      style={{ width: '100%', height: '100%' }}
                    />
                    {photo.is_starred ? (
                      <View
                        accessibilityLabel={s.starred}
                        style={{
                          position: 'absolute',
                          top: SPACE.sm,
                          right: SPACE.sm,
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'rgba(0,0,0,0.45)',
                        }}
                      >
                        <Feather name="star" size={14} color="#ffffff" />
                      </View>
                    ) : null}
                  </Pressable>
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

          {/* Keep starred + milestone toggle */}
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
                  <Small
                    color={selected ? c.onAccent : c.text}
                    style={{ fontWeight: '600' }}
                  >
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

      {/* Floating "+" upload-intent button */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={s.addPhoto}
        onPress={() => setUploadOpen(true)}
        style={{
          position: 'absolute',
          right: SPACE.lg,
          bottom: SPACE.xl,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: c.accent,
          alignItems: 'center',
          justifyContent: 'center',
          ...theme.shadowCard,
        }}
      >
        <Feather name="plus" size={26} color={c.onAccent} />
      </Pressable>

      {/* Full-screen viewer */}
      <Modal
        visible={active !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActive(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' }}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: SPACE.lg }}
          >
            {active ? (
              <View style={{ gap: SPACE.lg }}>
                <Image
                  source={{ uri: active.image_url }}
                  resizeMode="contain"
                  style={{ width: '100%', height: width, borderRadius: theme.radii.card }}
                />
                <BodyStrong color="#ffffff">{active.caption ?? s.caption}</BodyStrong>
                <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                  <Button
                    title={s.save}
                    variant="secondary"
                    style={{ flex: 1 }}
                    onPress={async () => {
                      if (!active?.image_url) return
                      const { status } = await MediaLibrary.requestPermissionsAsync()
                      if (status !== 'granted') {
                        Alert.alert(s.permTitle, s.permLibrary)
                        return
                      }
                      try {
                        const localUri = await FileSystem.downloadAsync(
                          active.image_url,
                          (FileSystem.cacheDirectory ?? '') + active.id + '.jpg',
                        )
                        await MediaLibrary.saveToLibraryAsync(localUri.uri)
                        Alert.alert(s.savedTitle, s.savedBody)
                      } catch {
                        Alert.alert(s.saveErrorTitle, s.saveErrorBody)
                      }
                    }}
                  />
                  <Button
                    title={s.share}
                    variant="secondary"
                    style={{ flex: 1 }}
                    onPress={async () => {
                      if (!active?.image_url) return
                      await Share.share({
                        message: active.caption ?? s.caption,
                        url: active.image_url,
                      })
                    }}
                  />
                  <Button
                    title={s.hide}
                    variant="danger"
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
              paddingBottom: SPACE.xxl,
              gap: SPACE.md,
            }}
          >
            <H2>{s.addPhoto}</H2>
            <Button title={s.takePhoto} block onPress={onTakePhoto} />
            <Button title={s.chooseLibrary} variant="secondary" block onPress={onChooseLibrary} />
            <Button
              title={s.cancel}
              variant="ghost"
              block
              onPress={() => setUploadOpen(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  )
}
