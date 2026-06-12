/**
 * Storage (Wave 1b) — dedicated storage-management screen for the homeowner.
 *
 * Extracted from Photos (where storage logic lived inline in a Card). Expanded
 * to the prototype layout (screen-settings.jsx StorageScreen):
 *   - On-device vs cloud usage bar (on-device = real FileSystem cache size;
 *     cloud = honest "—" with a reassurance note — we never fabricate a GB)
 *   - Auto-manage Toggle
 *   - Keep on device radio group (7 / 30 / 90 days / Everything)
 *   - Always-keep checkboxes (pinned / milestone / shared)
 *   - Free up space now button (real FileSystem.deleteAsync) + savings hint
 *   - Cloud reassurance line
 *
 * The SAME `constructo.photoPolicy` AsyncStorage key + `PhotoPolicy` shape is
 * used so Photos.tsx (which still reads retentionDays for display) continues to
 * work with no changes to the key format.
 *
 * Navigation: pushed from Photos "Manage" link and Settings "Storage settings"
 * row — registered href:null in _layout.tsx.
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Feather } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system/legacy'

import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE, TAP, TYPE } from '../../src/theme/tokens'
import {
  Body,
  Button,
  Card,
  Eyebrow,
  FadeInUp,
  MonoSm,
  Screen,
  Small,
  SubHeader,
  Toggle,
} from '../../src/ui'
import { POLICY_KEY, DEFAULT_POLICY } from './_storage.util'
import type { PhotoPolicy, RetentionDays } from './_storage.util'

// ── Strings ───────────────────────────────────────────────────────────────────

const STR = {
  en: {
    title: 'Storage settings',
    onDevice: 'On your device',
    cloud: 'Total in cloud',
    cloudValue: '—',
    cloudNote:
      'All photos and videos are kept safely in the cloud. Removing them from your device never deletes them from the project.',
    autoManage: 'Auto-manage storage',
    keepHeader: 'KEEP ON DEVICE',
    alwaysHeader: 'ALWAYS KEEP ON DEVICE',
    keep7: 'Last 7 days',
    keep30: 'Last 30 days',
    keep90: 'Last 3 months',
    keepAll: 'Everything (manual only)',
    pinned: 'Pinned media',
    milestone: 'Milestone completion photos',
    shared: 'Media I shared with family',
    freeUp: 'Free up space now',
    savingsPrefix: 'Saves approximately',
    savingsSuffix: 'MB',
    freedTitle: 'Cache cleared',
    freedBody: 'Local cache was cleared. Your curated photos stay in the cloud.',
    computing: 'Computing…',
    noCache: '0 MB',
    estimateNote: '(estimated)',
  },
  hi: {
    title: 'स्टोरेज सेटिंग्स',
    onDevice: 'आपके डिवाइस पर',
    cloud: 'कुल क्लाउड में',
    cloudValue: '—',
    cloudNote:
      'सभी फ़ोटो और वीडियो क्लाउड में सुरक्षित रहते हैं। डिवाइस से हटाने पर प्रोजेक्ट से कुछ नहीं मिटता।',
    autoManage: 'स्टोरेज स्वतः प्रबंधित करें',
    keepHeader: 'डिवाइस पर रखें',
    alwaysHeader: 'हमेशा डिवाइस पर रखें',
    keep7: 'पिछले 7 दिन',
    keep30: 'पिछले 30 दिन',
    keep90: 'पिछले 3 महीने',
    keepAll: 'सब कुछ (केवल मैन्युअल)',
    pinned: 'पिन किया मीडिया',
    milestone: 'चरण पूर्णता फ़ोटो',
    shared: 'परिवार के साथ साझा किया मीडिया',
    freeUp: 'अभी जगह खाली करें',
    savingsPrefix: 'लगभग',
    savingsSuffix: 'MB बचेगा',
    freedTitle: 'कैश साफ़ किया गया',
    freedBody: 'लोकल कैश साफ़ हो गया। आपकी तस्वीरें क्लाउड में सुरक्षित हैं।',
    computing: 'गणना हो रही है…',
    noCache: '0 MB',
    estimateNote: '(अनुमानित)',
  },
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the cache directory size in bytes, or null if unreadable. */
async function getCacheSizeBytes(): Promise<number | null> {
  try {
    const dir = FileSystem.cacheDirectory
    if (!dir) return null
    const info = await FileSystem.getInfoAsync(dir)
    if (!info.exists) return null
    // `size` is present on the `exists: true` branch of the FileInfo union.
    return 'size' in info ? (info.size ?? null) : null
  } catch {
    return null
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Storage() {
  const { lang } = useT()
  const s = STR[lang]
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()

  const [policy, setPolicy] = useState<PhotoPolicy>(DEFAULT_POLICY)
  const [cacheMB, setCacheMB] = useState<number | null>(null)
  const [cacheLoading, setCacheLoading] = useState(true)

  // Load policy from AsyncStorage on mount.
  useEffect(() => {
    void AsyncStorage.getItem(POLICY_KEY).then((raw) => {
      if (!raw) return
      try {
        const parsed = JSON.parse(raw) as Partial<PhotoPolicy>
        setPolicy({
          keepStarredAndMilestone:
            parsed.keepStarredAndMilestone ?? DEFAULT_POLICY.keepStarredAndMilestone,
          retentionDays: (parsed.retentionDays ?? DEFAULT_POLICY.retentionDays) as RetentionDays,
          autoManage: parsed.autoManage ?? DEFAULT_POLICY.autoManage,
          alwaysKeep: {
            pinned: parsed.alwaysKeep?.pinned ?? DEFAULT_POLICY.alwaysKeep.pinned,
            milestone: parsed.alwaysKeep?.milestone ?? DEFAULT_POLICY.alwaysKeep.milestone,
            shared: parsed.alwaysKeep?.shared ?? DEFAULT_POLICY.alwaysKeep.shared,
          },
        })
      } catch {
        /* corrupt — keep defaults */
      }
    })

    // Compute cache size.
    getCacheSizeBytes()
      .then((bytes) => setCacheMB(bytes !== null ? Math.round(bytes / 1024 / 1024) : 0))
      .catch(() => setCacheMB(0))
      .finally(() => setCacheLoading(false))
  }, [])

  const savePolicy = useCallback((next: PhotoPolicy) => {
    setPolicy(next)
    void AsyncStorage.setItem(POLICY_KEY, JSON.stringify(next))
  }, [])

  const onFreeUpSpace = useCallback(async () => {
    try {
      await FileSystem.deleteAsync(FileSystem.cacheDirectory ?? '', { idempotent: true })
      setCacheMB(0)
    } catch {
      // Non-fatal — server data is unaffected.
    }
    Alert.alert(s.freedTitle, s.freedBody)
  }, [s])

  // Retention radio options.
  const retentionOptions: { id: RetentionDays; label: string }[] = [
    { id: 7, label: s.keep7 },
    { id: 30, label: s.keep30 },
    { id: 90, label: s.keep90 },
    { id: 'all', label: s.keepAll },
  ]

  // Always-keep checkbox options.
  const alwaysKeepOptions: { key: keyof PhotoPolicy['alwaysKeep']; label: string }[] = [
    { key: 'pinned', label: s.pinned },
    { key: 'milestone', label: s.milestone },
    { key: 'shared', label: s.shared },
  ]

  // Usage bar: fraction = cache / (cache + a synthetic "rest"). Since we don't
  // know the real cloud total, we just show the device bar as an absolute value
  // and do NOT show a "cloud total" number. We show "—" there with a note.
  const deviceLabel = cacheLoading
    ? s.computing
    : cacheMB !== null
      ? `${cacheMB} MB`
      : s.noCache

  return (
    <Screen scroll padded={false} style={{ flex: 1 }}>
      <SubHeader title={s.title} onBack={() => router.back()} />

      <View style={{ padding: SPACE.lg, gap: SPACE.md }}>
        {/* ── Usage card ──────────────────────────────────────────────────── */}
        <FadeInUp>
          <Card>
            <View style={{ flexDirection: 'row', gap: SPACE.lg }}>
              {/* On-device — real computed value */}
              <View style={{ flex: 1, gap: 4 }}>
                <Small muted>{s.onDevice}</Small>
                <MonoSm
                  style={{ fontSize: 19, fontWeight: '700', color: c.text }}
                >
                  {deviceLabel}
                </MonoSm>
              </View>
              {/* Cloud — honest "—" with estimate label */}
              <View style={{ flex: 1, gap: 4 }}>
                <Small muted>{s.cloud}</Small>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <MonoSm
                    style={{ fontSize: 19, fontWeight: '700', color: c.textMute }}
                  >
                    {s.cloudValue}
                  </MonoSm>
                  <Small muted style={{ fontSize: TYPE.micro.fontSize }}>
                    {s.estimateNote}
                  </Small>
                </View>
              </View>
            </View>

            {/* Usage bar — shows device fraction of a placeholder bar */}
            {!cacheLoading && cacheMB !== null && cacheMB > 0 ? (
              <View
                style={{
                  height: 8,
                  borderRadius: theme.radii.pill,
                  backgroundColor: c.line,
                  marginTop: SPACE.md,
                  overflow: 'hidden',
                }}
              >
                {/* Bar is purely illustrative — we cap at 60% to avoid filling
                    fully (we don't know the total). The bar just communicates
                    "there is something on device". */}
                <View
                  style={{
                    width: `${Math.min(Math.max((cacheMB / Math.max(cacheMB, 100)) * 60, 5), 60)}%`,
                    height: '100%',
                    backgroundColor: c.accent,
                    borderRadius: theme.radii.pill,
                  }}
                />
              </View>
            ) : null}
          </Card>
        </FadeInUp>

        {/* ── Auto-manage toggle ──────────────────────────────────────────── */}
        <FadeInUp delay={40}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.md,
              minHeight: TAP,
              paddingHorizontal: 2,
            }}
          >
            <Body style={{ flex: 1, fontSize: 15, fontWeight: '500' }}>
              {s.autoManage}
            </Body>
            <Toggle
              value={policy.autoManage}
              onValueChange={(v) => savePolicy({ ...policy, autoManage: v })}
            />
          </View>
        </FadeInUp>

        {/* ── Keep on device radios ────────────────────────────────────────── */}
        <FadeInUp delay={80} style={{ gap: SPACE.sm }}>
          <Eyebrow>{s.keepHeader}</Eyebrow>
          <Card style={{ padding: 0 }}>
            {retentionOptions.map(({ id, label }, i) => {
              const selected = policy.retentionDays === id
              const isLast = i === retentionOptions.length - 1
              return (
                <Pressable
                  key={String(id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => savePolicy({ ...policy, retentionDays: id })}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: SPACE.md,
                    minHeight: TAP,
                    paddingHorizontal: SPACE.md,
                    paddingVertical: SPACE.sm + 2,
                    opacity: pressed ? 0.7 : 1,
                    borderBottomWidth: isLast ? 0 : 1,
                    borderBottomColor: c.line,
                  })}
                >
                  {/* Radio circle */}
                  <View
                    style={{
                      width: 21,
                      height: 21,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: selected ? c.accent : c.line,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {selected ? (
                      <View
                        style={{
                          width: 11,
                          height: 11,
                          borderRadius: 6,
                          backgroundColor: c.accent,
                        }}
                      />
                    ) : null}
                  </View>
                  <Body style={{ flex: 1, fontSize: 14.5 }}>{label}</Body>
                </Pressable>
              )
            })}
          </Card>
        </FadeInUp>

        {/* ── Always keep checkboxes ───────────────────────────────────────── */}
        <FadeInUp delay={120} style={{ gap: SPACE.sm }}>
          <Eyebrow>{s.alwaysHeader}</Eyebrow>
          <Card style={{ padding: 0 }}>
            {alwaysKeepOptions.map(({ key, label }, i) => {
              const checked = policy.alwaysKeep[key]
              const isLast = i === alwaysKeepOptions.length - 1
              return (
                <Pressable
                  key={key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  onPress={() =>
                    savePolicy({
                      ...policy,
                      alwaysKeep: { ...policy.alwaysKeep, [key]: !checked },
                    })
                  }
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: SPACE.md,
                    minHeight: TAP,
                    paddingHorizontal: SPACE.md,
                    paddingVertical: SPACE.sm + 2,
                    opacity: pressed ? 0.7 : 1,
                    borderBottomWidth: isLast ? 0 : 1,
                    borderBottomColor: c.line,
                  })}
                >
                  {/* Checkbox square */}
                  <View
                    style={{
                      width: 21,
                      height: 21,
                      borderRadius: 6,
                      borderWidth: 2,
                      borderColor: checked ? c.accent : c.line,
                      backgroundColor: checked ? c.accent : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {checked ? (
                      <Feather name="check" size={13} color={c.onAccent} />
                    ) : null}
                  </View>
                  <Body style={{ flex: 1, fontSize: 14.5 }}>{label}</Body>
                </Pressable>
              )
            })}
          </Card>
        </FadeInUp>

        {/* ── Free up space button + hint ─────────────────────────────────── */}
        <FadeInUp delay={160} style={{ gap: SPACE.sm }}>
          <Button
            title={s.freeUp}
            variant="secondary"
            block
            onPress={() => void onFreeUpSpace()}
          />
          {cacheMB !== null && cacheMB > 0 ? (
            <Small muted style={{ textAlign: 'center' }}>
              {s.savingsPrefix} {cacheMB} {s.savingsSuffix}
            </Small>
          ) : null}
        </FadeInUp>

        {/* ── Cloud reassurance note ───────────────────────────────────────── */}
        <FadeInUp delay={200}>
          <View
            style={{
              flexDirection: 'row',
              gap: SPACE.sm,
              padding: SPACE.md,
              backgroundColor: c.paper,
              borderRadius: theme.radii.card,
              borderWidth: 1,
              borderColor: c.line,
            }}
          >
            <Feather
              name="info"
              size={16}
              color={c.textMute}
              style={{ flexShrink: 0, marginTop: 1 }}
            />
            <Small muted style={{ flex: 1, lineHeight: 18 }}>
              {s.cloudNote}
            </Small>
          </View>
        </FadeInUp>
      </View>
    </Screen>
  )
}
