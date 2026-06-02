/**
 * Notifications — per-category cadence control (handoff §5).
 *
 * Each category (Site updates, Weekly summary, Design & decisions) gets a
 * segmented choice: As it happens · Daily · Weekly · Pause. The choice is the
 * caller's own preference, persisted into their member `notif_prefs.cadence`
 * jsonb via the existing self-PATCH (`PATCH /homeowner/members/{id}`) — the
 * same path the push-token persister uses, so no migration. Other prefs in the
 * blob (e.g. push_token) are preserved on write.
 *
 * A calm, always-visible note explains that **urgent spikes always punch
 * through** any cadence (a genuine delay or money risk still reaches you). A
 * category with no real delivery hook yet is honestly labelled "Coming soon"
 * (handoff §6 — honest placeholders, never a fabricated promise).
 *
 * Pushed screen (`href:null` in _layout). Feather icons, no emoji, no %,
 * warm-paper tokens. Strings in the per-screen en/hi pattern.
 */
import { useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { homeowner, ApiError } from '../../src/api/client'
import type { HomeownerMember } from '../../src/api/types'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE, TAP } from '../../src/theme/tokens'
import {
  BodyStrong,
  Card,
  Display,
  Micro,
  Screen,
  Small,
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

const STR = {
  en: {
    title: 'Notifications',
    subtitle: 'Choose how often each kind of update reaches you.',
    spikeTitle: 'Urgent always reaches you',
    spikeBody:
      'A genuine delay or money risk punches through any setting below — you are never left in the dark on the things that matter.',
    comingSoon: 'Coming soon',
    comingSoonNote: 'Controls here are saved, but this kind of alert isn’t sending yet.',
    saveError: 'Couldn’t save that. Please try again.',
    noMember: 'We couldn’t load your notification settings.',
  },
  hi: {
    title: 'सूचनाएँ',
    subtitle: 'चुनें कि हर तरह की जानकारी आप तक कितनी बार पहुँचे।',
    spikeTitle: 'ज़रूरी बात हमेशा पहुँचेगी',
    spikeBody:
      'सच्ची देरी या पैसे का जोखिम नीचे किसी भी सेटिंग को पार कर पहुँचेगा — ज़रूरी बातों में आप कभी अंधेरे में नहीं रहेंगे।',
    comingSoon: 'जल्द आ रहा है',
    comingSoonNote: 'यहाँ सेटिंग सहेज ली जाती है, पर इस तरह की सूचना अभी नहीं भेजी जा रही।',
    saveError: 'सहेज नहीं पाए। कृपया फिर कोशिश करें।',
    noMember: 'आपकी सूचना सेटिंग लोड नहीं हो सकीं।',
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
      // Optimistic: patch the cached member so the segmented control updates
      // instantly (calm — no spinner mid-tap).
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

  return (
    <Screen>
      <View style={{ gap: SPACE.sm }}>
        <Display>{tx.title}</Display>
        <Small muted>{tx.subtitle}</Small>
      </View>

      {/* Spikes-always-punch-through note (calm info card, never alarming). */}
      <Card
        style={{
          flexDirection: 'row',
          gap: SPACE.md,
          backgroundColor: AP.chip,
          borderColor: 'transparent',
        }}
      >
        <Feather name="alert-circle" size={20} color={theme.colors.accentDeep} />
        <View style={{ flex: 1, gap: SPACE.xs }}>
          <BodyStrong style={{ color: AP.onChip }}>{tx.spikeTitle}</BodyStrong>
          <Small style={{ color: AP.onChip }}>{tx.spikeBody}</Small>
        </View>
      </Card>

      {error ? (
        <Small style={{ color: theme.colors.risk }}>{error}</Small>
      ) : null}

      {selfQ.isLoading ? (
        <ActivityIndicator color={theme.colors.accent} />
      ) : !self ? (
        <Small muted>{tx.noMember}</Small>
      ) : (
        NOTIF_CATEGORIES.map((cat) => (
          <Card key={cat.key} style={{ gap: SPACE.md }}>
            <View style={{ gap: SPACE.xs }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}
              >
                <BodyStrong>{cat.label[L]}</BodyStrong>
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

            <CadencePicker
              value={readCadence(prefs, cat.key)}
              onChange={(c) => setCadence(cat.key, c)}
              lang={L}
              theme={theme}
            />

            {!cat.wired ? (
              <Small muted style={{ fontStyle: 'italic' }}>
                {tx.comingSoonNote}
              </Small>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  )
}

function CadencePicker({
  value,
  onChange,
  lang,
  theme,
}: {
  value: Cadence
  onChange: (c: Cadence) => void
  lang: Lang
  theme: ReturnType<typeof useTheme>['theme']
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
      {CADENCES.map((c) => {
        const active = c === value
        return (
          <Pressable
            key={c}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(c)}
            style={{
              borderRadius: theme.radii.pill,
              borderWidth: 1,
              borderColor: active ? theme.colors.accent : theme.colors.line,
              backgroundColor: active ? theme.colors.accentWarm : theme.colors.card,
              paddingHorizontal: SPACE.md,
              paddingVertical: SPACE.sm,
              minHeight: TAP,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
            }}
          >
            {active ? (
              <Feather name="check" size={14} color={theme.colors.accentDeep} />
            ) : null}
            <Small
              style={{ color: active ? theme.colors.accentDeep : theme.colors.text }}
            >
              {CADENCE_LABEL[c][lang]}
            </Small>
          </Pressable>
        )
      })}
    </View>
  )
}
