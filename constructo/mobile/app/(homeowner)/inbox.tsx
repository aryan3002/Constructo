/**
 * Notifications inbox — the in-app feed of what you've been notified about
 * (photos, request updates, project updates, weekly summaries). Opening it marks
 * everything read (clears the bell badge); tapping a row deep-links to the
 * matching screen, mirroring the push-tap routing.
 */
import type * as React from 'react'
import { useEffect } from 'react'
import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { homeowner } from '../../src/api/client'
import type { AppNotification } from '../../src/api/types'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../src/theme/tokens'
import { BodyStrong, Card, FadeInUp, MonoSm, Screen, ScreenLoader, Small, SubHeader } from '../../src/ui'

const ICON: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  photo: 'image',
  request: 'message-square',
  update: 'file-text',
  weekly_summary: 'calendar',
}

const STR = {
  en: { title: 'Notifications', empty: "You're all caught up." },
  hi: { title: 'सूचनाएँ', empty: 'सब कुछ देख लिया।' },
} as const

function timeLabel(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return time
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} · ${time}`
}

function routeFor(n: AppNotification): string | null {
  switch (n.type) {
    case 'photo':
      return '/(homeowner)/photos'
    case 'request':
      return '/(homeowner)/requests'
    case 'update':
    case 'weekly_summary':
      return '/(homeowner)/updates'
    default:
      return null
  }
}

export default function InboxScreen() {
  const { lang } = useT()
  const t = STR[lang === 'hi' ? 'hi' : 'en']
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const qc = useQueryClient()

  const q = useQuery({ queryKey: ['notifications'], queryFn: () => homeowner.notifications() })
  const items = q.data?.items ?? []

  // Opening the inbox marks everything read — then refresh so the bell clears.
  useEffect(() => {
    void homeowner
      .markNotificationsSeen()
      .then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Screen floatingNav>
      <SubHeader title={t.title} onBack={() => router.back()} />

      {q.isLoading ? (
        <ScreenLoader fill={false} />
      ) : items.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: SPACE.xxl, gap: SPACE.sm }}>
          <Feather name="bell" size={28} color={c.textMute} />
          <Small muted>{t.empty}</Small>
        </View>
      ) : (
        <View style={{ gap: SPACE.sm, marginTop: SPACE.sm }}>
          {items.map((n, i) => {
            const route = routeFor(n)
            return (
              <FadeInUp key={n.id} delay={Math.min(i, 6) * 40}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={n.title}
                  disabled={!route}
                  onPress={() => route && router.push(route as never)}
                  style={({ pressed }) => ({ transform: [{ scale: pressed && route ? 0.99 : 1 }] })}
                >
                  <Card
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: SPACE.md,
                      backgroundColor: n.is_unread ? AP.surfaceLow : c.card,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: AP.chip,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather
                        name={(n.type && ICON[n.type]) || 'bell'}
                        size={16}
                        color={AP.onChip}
                      />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                        <BodyStrong style={{ flex: 1 }}>{n.title}</BodyStrong>
                        {n.is_unread ? (
                          <View
                            style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }}
                          />
                        ) : null}
                      </View>
                      <Small muted>{n.body}</Small>
                      <MonoSm muted>{timeLabel(n.created_at)}</MonoSm>
                    </View>
                    {route ? (
                      <Feather name="chevron-right" size={18} color={c.textMute} style={{ marginTop: 8 }} />
                    ) : null}
                  </Card>
                </Pressable>
              </FadeInUp>
            )
          })}
        </View>
      )}
    </Screen>
  )
}
