/**
 * Notifications — a calm cadence chooser (Calm Cockpit, handoff §5).
 *
 * Each category (Site updates, Weekly summary, Design & decisions) offers one
 * clear choice of cadence — **As it happens · Daily · Weekly · Pause** — rendered
 * as a selectable group of rows with live subtitles (the kit's SettingsRow feel),
 * each row explaining what that cadence means so the pick is never a guess. The
 * choice is the caller's own preference, persisted into their member
 * `notif_prefs.cadence` jsonb via the existing self-PATCH
 * (`PATCH /homeowner/members/{id}`) — the same path the push-token persister
 * uses, so no migration. Other prefs in the blob (e.g. push_token) are preserved.
 *
 * A calm, always-visible reassurance — anchored by an `ok` StatusPill — explains
 * that **urgent spikes always punch through** any cadence below (a genuine delay
 * or money risk still reaches you, even on Pause or Weekly). A category with no
 * real delivery hook yet is honestly labelled "Coming soon" (handoff §6 — honest
 * placeholders, never a fabricated promise).
 *
 * Pushed screen (`href:null` in _layout), `Screen floatingNav` for bottom
 * clearance. Eyebrow kickers, Feather icons (no emoji, no %), warm-paper tokens.
 * Strings in the per-screen en/hi pattern (single language per screen).
 */
import { useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { homeowner } from '../../src/api/client'
import type { HomeownerMember } from '../../src/api/types'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE, TAP } from '../../src/theme/tokens'
import {
  Body,
  Display,
  Eyebrow,
  Micro,
  QuietState,
  Screen,
  SettingsGroup,
  Small,
  StatusPill,
  Toggle,
} from '../../src/ui'
import {
  CADENCE_LABEL,
  CADENCES,
  NOTIF_CATEGORIES,
  readCadence,
  withCadence,
  type Cadence,
  type Lang,
} from './_settings.util'

// ---- Delivery method helpers -----------------------------------------------

type DeliveryKey = 'push' | 'whatsapp' | 'email'

const DELIVERY_CHANNELS: {
  key: DeliveryKey
  icon: React.ComponentProps<typeof import('@expo/vector-icons').Feather>['name']
  label: Record<Lang, string>
  desc: Record<Lang, string>
  wired: boolean
}[] = [
  {
    key: 'push',
    icon: 'bell',
    label: { en: 'Push notifications', hi: 'पुश सूचनाएँ' },
    desc: { en: 'In-app and phone notifications.', hi: 'ऐप और फ़ोन पर सूचनाएँ।' },
    wired: true,
  },
  {
    key: 'whatsapp',
    icon: 'message-circle',
    label: { en: 'WhatsApp', hi: 'व्हाट्सएप' },
    desc: { en: 'Alerts sent to your WhatsApp number.', hi: 'आपके व्हाट्सएप नंबर पर सूचनाएँ।' },
    wired: false,
  },
  {
    key: 'email',
    icon: 'mail',
    label: { en: 'Email', hi: 'ईमेल' },
    desc: { en: 'Digest emails to your inbox.', hi: 'आपके इनबॉक्स में डाइजेस्ट ईमेल।' },
    wired: false,
  },
]

function readDelivery(prefs: Record<string, unknown> | undefined, key: DeliveryKey): boolean {
  const map = (prefs?.delivery ?? {}) as Record<string, unknown>
  // Default push=true, others=false when not yet stored.
  if (map[key] === undefined) return key === 'push'
  return map[key] === true
}

function withDelivery(
  prefs: Record<string, unknown> | undefined,
  key: DeliveryKey,
  value: boolean,
): Record<string, unknown> {
  const existing = (prefs?.delivery ?? {}) as Record<string, unknown>
  return { ...(prefs ?? {}), delivery: { ...existing, [key]: value } }
}

/** A Feather glyph + one-line meaning per cadence — turns the bare label into a
 *  reassuring, self-explaining choice (the live subtitle each row carries). */
const CADENCE_META: Record<
  Cadence,
  { icon: React.ComponentProps<typeof Feather>['name']; meaning: Record<Lang, string> }
> = {
  as_it_happens: {
    icon: 'zap',
    meaning: {
      en: 'A nudge the moment something happens.',
      hi: 'जैसे ही कुछ हो, तुरंत सूचना।',
    },
  },
  daily: {
    icon: 'sun',
    meaning: {
      en: 'One gentle round-up each evening.',
      hi: 'हर शाम एक शांत सारांश।',
    },
  },
  weekly: {
    icon: 'calendar',
    meaning: {
      en: 'Just the weekly letter — nothing in between.',
      hi: 'सिर्फ़ साप्ताहिक पत्र — बीच में कुछ नहीं।',
    },
  },
  pause: {
    icon: 'moon',
    meaning: {
      en: 'No routine nudges. Open the app whenever you like.',
      hi: 'कोई नियमित सूचना नहीं। जब चाहें ऐप खोलें।',
    },
  },
}

const STR = {
  en: {
    title: 'Notifications',
    subtitle: 'Choose how often each kind of update reaches you.',
    spikeTitle: 'Urgent always reaches you',
    spikeBody:
      'A genuine delay or money risk punches through any setting below — even on Pause or Weekly, you are never left in the dark on the things that matter.',
    alwaysOn: 'Always on',
    comingSoon: 'Coming soon',
    comingSoonNote: 'Your choice is saved, but this kind of alert isn’t sending yet.',
    saveError: 'Couldn’t save that. Please try again.',
    noMemberTitle: 'Settings unavailable',
    noMember: 'We couldn’t load your notification settings just now.',
    delivery: 'Delivery channels',
    deliverySub: 'Where Constructo reaches you.',
    deliveryNote: "Your choice is saved, but WhatsApp/Email delivery isn't sending yet.",
  },
  hi: {
    title: 'सूचनाएँ',
    subtitle: 'चुनें कि हर तरह की जानकारी आप तक कितनी बार पहुँचे।',
    spikeTitle: 'ज़रूरी बात हमेशा पहुँचेगी',
    spikeBody:
      'सच्ची देरी या पैसे का जोखिम नीचे किसी भी सेटिंग को पार कर पहुँचेगा — रोका हुआ या साप्ताहिक होने पर भी, ज़रूरी बातों में आप कभी अंधेरे में नहीं रहेंगे।',
    alwaysOn: 'हमेशा चालू',
    comingSoon: 'जल्द आ रहा है',
    comingSoonNote: 'आपकी पसंद सहेज ली जाती है, पर इस तरह की सूचना अभी नहीं भेजी जा रही।',
    saveError: 'सहेज नहीं पाए। कृपया फिर कोशिश करें।',
    noMemberTitle: 'सेटिंग उपलब्ध नहीं',
    noMember: 'अभी आपकी सूचना सेटिंग लोड नहीं हो सकीं।',
    delivery: 'डिलीवरी चैनल',
    deliverySub: 'Constructo आपसे कहाँ संपर्क करे।',
    deliveryNote: 'आपकी पसंद सहेज ली जाती है, पर व्हाट्सएप/ईमेल डिलीवरी अभी नहीं भेजी जा रही।',
  },
} as const

export default function Notifications() {
  const { lang } = useT()
  const { theme } = useTheme()
  const qc = useQueryClient()
  const L: Lang = lang === 'hi' ? 'hi' : 'en'
  const tx = STR[L]

  const [error, setError] = useState<string | null>(null)

  // The caller's own membership row carries notif_prefs (members()[0] — the
  // same convention the push-token persister relies on).
  const selfQ = useQuery({
    queryKey: ['homeowner-members-self'],
    queryFn: () => homeowner.members(),
  })
  const self: HomeownerMember | undefined = selfQ.data?.[0]
  const prefs = self?.notif_prefs

  const mut = useMutation({
    mutationFn: ({ id, next }: { id: string; next: Record<string, unknown> }) =>
      homeowner.updateNotifPrefs(id, next),
    onMutate: ({ next }) => {
      // Optimistic: patch the cached member so the chosen row updates instantly
      // (calm — no spinner mid-tap).
      qc.setQueryData<HomeownerMember[]>(['homeowner-members-self'], (old) =>
        old ? old.map((m, i) => (i === 0 ? { ...m, notif_prefs: next } : m)) : old,
      )
      setError(null)
    },
    onError: () => {
      setError(tx.saveError)
      void qc.invalidateQueries({ queryKey: ['homeowner-members-self'] })
    },
  })

  function setCadence(key: string, cadence: Cadence) {
    if (!self) return
    const next = withCadence(prefs, key, cadence)
    mut.mutate({ id: self.id, next })
  }

  function setDelivery(key: DeliveryKey, value: boolean) {
    if (!self) return
    const next = withDelivery(prefs, key, value)
    mut.mutate({ id: self.id, next })
  }

  return (
    <Screen floatingNav>
      <View style={{ gap: SPACE.xs }}>
        <Eyebrow>{tx.title}</Eyebrow>
        <Display>{tx.title}</Display>
        <Small muted>{tx.subtitle}</Small>
      </View>

      {/* Spikes-always-punch-through reassurance — calm sage chip, never alarming. */}
      <View
        style={{
          flexDirection: 'row',
          gap: SPACE.md,
          backgroundColor: AP.chip,
          borderRadius: theme.radii.card,
          padding: SPACE.lg,
        }}
      >
        <Feather name="shield" size={22} color={AP.onChip} />
        <View style={{ flex: 1, gap: SPACE.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <Body color={AP.onChip} style={{ fontWeight: '600', flexShrink: 1 }}>
              {tx.spikeTitle}
            </Body>
            <StatusPill status="ok" label={tx.alwaysOn} size="sm" />
          </View>
          <Small style={{ color: AP.onChip }}>{tx.spikeBody}</Small>
        </View>
      </View>

      {error ? (
        <StatusPill status="risk" label={error} icon="alert-triangle" />
      ) : null}

      {selfQ.isLoading ? (
        <View style={{ paddingVertical: SPACE.xxl, alignItems: 'center' }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : !self ? (
        <QuietState
          tone="quiet"
          icon="bell-off"
          title={tx.noMemberTitle}
          message={tx.noMember}
        />
      ) : (
        <>
          {/* ---- Delivery channels — Push / WhatsApp / Email toggles. ---- */}
          <View style={{ gap: SPACE.sm }}>
            <View style={{ gap: SPACE.xs, paddingHorizontal: SPACE.xs }}>
              <Eyebrow>{tx.delivery}</Eyebrow>
              <Small muted>{tx.deliverySub}</Small>
            </View>
            <SettingsGroup>
              {DELIVERY_CHANNELS.map((ch, i) => {
                const enabled = readDelivery(prefs, ch.key)
                return (
                  <View
                    key={ch.key}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: SPACE.md,
                      paddingHorizontal: SPACE.lg,
                      paddingVertical: SPACE.md,
                      borderBottomWidth: i < DELIVERY_CHANNELS.length - 1 ? 1 : 0,
                      borderBottomColor: theme.colors.line,
                      minHeight: TAP + 8,
                    }}
                  >
                    {/* Icon chip */}
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: theme.radii.chip,
                        backgroundColor: enabled ? AP.chip : AP.surfaceLow,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather
                        name={ch.icon}
                        size={18}
                        color={enabled ? AP.onChip : theme.colors.textMute}
                      />
                    </View>

                    {/* Label + desc + coming-soon badge */}
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                        <Body numberOfLines={1} style={{ flexShrink: 1 }}>
                          {ch.label[L]}
                        </Body>
                        {!ch.wired ? (
                          <View
                            style={{
                              backgroundColor: AP.surfaceLow,
                              borderRadius: theme.radii.pill,
                              paddingHorizontal: SPACE.sm,
                              paddingVertical: 2,
                            }}
                          >
                            <Micro muted>{tx.comingSoon}</Micro>
                          </View>
                        ) : null}
                      </View>
                      <Small muted numberOfLines={1}>{ch.desc[L]}</Small>
                    </View>

                    {/* Kit Toggle — persists into notif_prefs.delivery.{key}. */}
                    <Toggle
                      value={enabled}
                      onValueChange={(v) => setDelivery(ch.key, v)}
                    />
                  </View>
                )
              })}
            </SettingsGroup>
            {/* Honest footnote — shown when at least one unwired channel exists. */}
            {DELIVERY_CHANNELS.some((ch) => !ch.wired) ? (
              <Small muted style={{ fontStyle: 'italic', paddingHorizontal: SPACE.xs }}>
                {tx.deliveryNote}
              </Small>
            ) : null}
          </View>

          {/* ---- Cadence chooser per category. ---- */}
          {NOTIF_CATEGORIES.map((cat) => {
          const current = readCadence(prefs, cat.key)
          return (
            <View key={cat.key} style={{ gap: SPACE.sm }}>
              {/* Category header — Eyebrow kicker + title + one calm description. */}
              <View style={{ gap: SPACE.xs, paddingHorizontal: SPACE.xs }}>
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}
                >
                  <Eyebrow style={{ flexShrink: 1 }}>{cat.label[L]}</Eyebrow>
                  {!cat.wired ? (
                    <View
                      style={{
                        backgroundColor: AP.surfaceLow,
                        borderRadius: theme.radii.pill,
                        paddingHorizontal: SPACE.sm,
                        paddingVertical: 2,
                      }}
                    >
                      <Micro muted>{tx.comingSoon}</Micro>
                    </View>
                  ) : null}
                </View>
                <Small muted>{cat.desc[L]}</Small>
              </View>

              {/* The cadence chooser — selectable rows with live meanings (§5). */}
              <SettingsGroup>
                {CADENCES.map((c, i) => (
                  <CadenceRow
                    key={c}
                    cadence={c}
                    selected={c === current}
                    last={i === CADENCES.length - 1}
                    lang={L}
                    theme={theme}
                    onPress={() => setCadence(cat.key, c)}
                  />
                ))}
              </SettingsGroup>

              {!cat.wired ? (
                <Small muted style={{ fontStyle: 'italic', paddingHorizontal: SPACE.xs }}>
                  {tx.comingSoonNote}
                </Small>
              ) : null}
            </View>
          )
        })}
        </>
      )}
    </Screen>
  )
}

/**
 * CadenceRow — one selectable cadence in a category group. Reads like a
 * SettingsRow (icon chip · label + live meaning · trailing marker) but is a
 * radio-style pick: the chosen row gets a sage check and a soft sage wash; the
 * rest stay calm. ≥48px tap target, color+icon+word (never color alone).
 */
function CadenceRow({
  cadence,
  selected,
  last,
  lang,
  theme,
  onPress,
}: {
  cadence: Cadence
  selected: boolean
  last: boolean
  lang: Lang
  theme: ReturnType<typeof useTheme>['theme']
  onPress: () => void
}) {
  const meta = CADENCE_META[cadence]
  const iconColor = selected ? theme.colors.accentDeep : theme.colors.textMute

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${CADENCE_LABEL[cadence][lang]} — ${meta.meaning[lang]}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
        minHeight: TAP + 8,
        paddingHorizontal: SPACE.lg,
        paddingVertical: SPACE.md,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.colors.line,
        backgroundColor: selected
          ? AP.chip
          : pressed
            ? AP.surfaceLow
            : 'transparent',
      })}
    >
      {/* Icon chip — the cadence's shape cue. */}
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: theme.radii.chip,
          backgroundColor: selected ? theme.colors.card : AP.surfaceLow,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={meta.icon} size={18} color={iconColor} />
      </View>

      {/* Label + live meaning. */}
      <View style={{ flex: 1, gap: 2 }}>
        <Body
          color={selected ? theme.colors.accentDeep : theme.colors.text}
          style={selected ? { fontWeight: '600' } : undefined}
          numberOfLines={1}
        >
          {CADENCE_LABEL[cadence][lang]}
        </Body>
        <Small muted numberOfLines={2}>
          {meta.meaning[lang]}
        </Small>
      </View>

      {/* Trailing marker — a sage check when chosen, an empty ring otherwise. */}
      {selected ? (
        <Feather name="check-circle" size={22} color={theme.colors.accent} />
      ) : (
        <Feather name="circle" size={22} color={theme.colors.line} />
      )}
    </Pressable>
  )
}
