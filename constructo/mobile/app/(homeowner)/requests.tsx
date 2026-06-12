/**
 * My Requests — homeowner pushed screen (Calm Cockpit §5).
 *
 * Fetches `homeowner.requests()` and renders each as a `ListRow` with a
 * `StatusPill` reflecting the real request status. Empty state = `QuietState`.
 * A "＋ Add a request" button routes to `/(homeowner)/issue`.
 *
 * This is the destination for Home's "My requests · See all" affordance.
 *
 * Route: (homeowner)/requests — registered `href: null` so the tab bar is
 * hidden (this is a pushed screen, not a tab).
 */
import { ActivityIndicator, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { homeowner } from '../../src/api/client'
import type { HomeownerRequest } from '../../src/api/types'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE } from '../../src/theme/tokens'
import {
  Button,
  CalmCard,
  Card,
  QuietState,
  Screen,
  Small,
  StatusPill,
  SubHeader,
  ListRow,
} from '../../src/ui'
import { REQUEST_STATUS_META, slaPromise } from '../_requests.util'

type Lang = 'en' | 'hi'

// ---- localised copy ----
interface Strings {
  title: string
  subtitle: string
  addRequest: string
  empty: string
  emptyMessage: string
  sectionOpen: string
  sectionResolved: string
  raised: string
  loadError: string
  retry: string
}

const STR: Record<Lang, Strings> = {
  en: {
    title: 'My Requests',
    subtitle: 'Flag something for your team',
    addRequest: '+ Add a request',
    empty: 'All clear',
    emptyMessage: 'Nothing flagged yet. Tap the button below to raise an issue with your team.',
    sectionOpen: 'Open',
    sectionResolved: 'Resolved',
    raised: 'Raised',
    loadError: 'Could not load requests. Please retry.',
    retry: 'Retry',
  },
  hi: {
    title: 'मेरे अनुरोध',
    subtitle: 'अपनी टीम के लिए कुछ दर्ज करें',
    addRequest: '+ अनुरोध जोड़ें',
    empty: 'सब ठीक है',
    emptyMessage: 'अभी कुछ दर्ज नहीं। नीचे के बटन से अपनी टीम को कुछ भेजें।',
    sectionOpen: 'खुले',
    sectionResolved: 'हल हुए',
    raised: 'दर्ज किया',
    loadError: 'अनुरोध लोड नहीं हो सके। कृपया पुनः प्रयास करें।',
    retry: 'पुनः प्रयास',
  },
} as const

function formatDate(iso: string, lang: Lang): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
      day: 'numeric',
      month: 'short',
    }).format(d)
  } catch {
    return d.toDateString()
  }
}

export default function RequestsScreen() {
  const { lang } = useT()
  const t = STR[lang as Lang] ?? STR.en
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors

  const listQ = useQuery<HomeownerRequest[]>({
    queryKey: ['homeowner', 'requests'],
    queryFn: () => homeowner.requests(),
  })

  const open = (listQ.data ?? []).filter((r) => r.status !== 'done')
  const resolved = (listQ.data ?? []).filter((r) => r.status === 'done')

  const addButton = (
    <Button
      title={t.addRequest}
      variant="secondary"
      size="md"
      onPress={() => router.push('/(homeowner)/issue')}
      leading={<Feather name="plus" size={16} color={c.accentDeep} />}
    />
  )

  return (
    <Screen scroll floatingNav>
      <SubHeader
        title={t.title}
        subtitle={t.subtitle}
        onBack={() => router.back()}
      />

      <View style={{ marginTop: SPACE.md }}>{addButton}</View>

      {listQ.isLoading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: SPACE.xl }} />
      ) : listQ.isError ? (
        <CalmCard title={t.loadError} status="risk">
          <Button
            title={t.retry}
            variant="ghost"
            size="md"
            onPress={() => void listQ.refetch()}
          />
        </CalmCard>
      ) : listQ.data && listQ.data.length === 0 ? (
        <QuietState
          icon="inbox"
          title={t.empty}
          message={t.emptyMessage}
          tone="quiet"
          style={{ marginTop: SPACE.lg }}
        />
      ) : (
        <View style={{ gap: SPACE.lg, marginTop: SPACE.md }}>
          {open.length > 0 ? (
            <View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACE.sm,
                  marginBottom: SPACE.sm,
                }}
              >
                <Feather name="inbox" size={14} color={c.warn} />
                <Small style={{ color: c.warn, letterSpacing: 1, fontWeight: '600' }}>
                  {t.sectionOpen.toUpperCase()}
                </Small>
              </View>
              <Card>
                {open.map((req, idx) => {
                  const sla = slaPromise(req, lang as Lang)
                  const subtitle = sla || `${t.raised} · ${formatDate(req.created_at, lang as Lang)}`
                  return (
                    <ListRow
                      key={req.id}
                      icon="message-square"
                      title={req.title}
                      subtitle={subtitle}
                      last={idx === open.length - 1}
                      right={
                        <StatusPill
                          status={REQUEST_STATUS_META[req.status]?.status ?? 'info'}
                          label={
                            lang === 'hi'
                              ? (REQUEST_STATUS_META[req.status]?.hi ?? req.status)
                              : (REQUEST_STATUS_META[req.status]?.en ?? req.status)
                          }
                          size="sm"
                        />
                      }
                    />
                  )
                })}
              </Card>
            </View>
          ) : null}

          {resolved.length > 0 ? (
            <View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACE.sm,
                  marginBottom: SPACE.sm,
                }}
              >
                <Feather name="check-circle" size={14} color={c.ok} />
                <Small style={{ color: c.ok, letterSpacing: 1, fontWeight: '600' }}>
                  {t.sectionResolved.toUpperCase()}
                </Small>
              </View>
              <Card>
                {resolved.map((req, idx) => (
                  <ListRow
                    key={req.id}
                    icon="check"
                    title={req.title}
                    subtitle={`${t.raised} · ${formatDate(req.created_at, lang as Lang)}`}
                    last={idx === resolved.length - 1}
                    right={
                      <StatusPill
                        status="ok"
                        label={
                          lang === 'hi'
                            ? (REQUEST_STATUS_META[req.status]?.hi ?? req.status)
                            : (REQUEST_STATUS_META[req.status]?.en ?? req.status)
                        }
                        size="sm"
                      />
                    }
                  />
                ))}
              </Card>
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  )
}
