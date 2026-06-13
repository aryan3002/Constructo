/**
 * Site Engineer — Home (the cockpit). The 3-second answer for Lokesh: how many
 * jobs to do, how many asks to answer. Then his today's-work to-do (toggle done)
 * and the asks waiting on him.
 *
 *   - "Today's work"  → action items assigned to me, across my assigned sites
 *                       (GET /action-items?site_id&mine=true; PATCH to toggle).
 *   - "Asks for you"  → decisions assigned to me (GET /approvals?for=me).
 *
 * Honest gap: the prototype's "Site appointments" timeline has no scheduling
 * backend, so it is omitted (Determinism Doctrine — don't fabricate), the way the
 * owner pass omitted per-site progress %. A future `app/appointments`.
 */
import { useMemo } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '../../../src/auth/AuthContext'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { actionItemsApi, type ActionItem } from '../../../src/api/actionItems'
import { supervisorApi, type Approval } from '../../../src/api/supervisor'
import { Body, Button, Card, Display, Eyebrow, H2, Small, StatusPill, Title } from '../../../src/ui'
import { ErrorBlock, LoadingBlock, StatTile } from './_eng.components'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function EngHome() {
  const { me } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()
  const qc = useQueryClient()

  const sitesQ = useQuery({ queryKey: ['eng', 'sites'], queryFn: () => supervisorApi.sites() })
  const sites = useMemo(() => sitesQ.data?.items ?? [], [sitesQ.data])
  const siteName = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of sites) m.set(s.id, s.name)
    return m
  }, [sites])

  const todosQ = useQuery({
    queryKey: ['eng', 'todos', sites.map((s) => s.id).sort()],
    enabled: sites.length > 0,
    queryFn: async () => {
      const lists = await Promise.all(sites.map((s) => actionItemsApi.list(s.id, { mine: true })))
      return lists.flat()
    },
  })
  const asksQ = useQuery({ queryKey: ['eng', 'asks'], queryFn: () => supervisorApi.asksForMe() })

  const toggle = useMutation({
    mutationFn: (t: ActionItem) =>
      actionItemsApi.update(t.id, { status: t.status === 'done' ? 'open' : 'done' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['eng', 'todos'] }),
  })

  const todos = todosQ.data ?? []
  const openTodos = todos.filter((t) => t.status === 'open')
  const asks = (asksQ.data?.items ?? []).filter((a) => a.state === 'pending')

  const loading = sitesQ.isLoading || (sites.length > 0 && todosQ.isLoading) || asksQ.isLoading
  const error = sitesQ.error || asksQ.error
  const now = new Date()
  const firstName = me?.name?.split(' ')[0] ?? 'there'

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.lg }}
    >
      {/* Hero */}
      <View style={{ gap: SPACE.xs }}>
        <Eyebrow>{`TODAY · ${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`}</Eyebrow>
        <Display style={{ fontSize: 30, lineHeight: 38 }}>
          {`${greeting()}, ${firstName}.`}
        </Display>
        <Body muted>
          {openTodos.length} job{openTodos.length === 1 ? '' : 's'} to do · {asks.length} ask
          {asks.length === 1 ? '' : 's'} waiting on you.
        </Body>
      </View>

      {/* Quick stats */}
      <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
        <StatTile value={openTodos.length} label="To do" tone="ok" />
        <StatTile value={asks.length} label="Asks" tone={asks.length > 0 ? 'warn' : 'quiet'} />
        <StatTile value={sites.length} label="Sites" />
      </View>

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock
          message="We could not load your day just now."
          retryLabel="Try again"
          onRetry={() => {
            void sitesQ.refetch()
            void asksQ.refetch()
            void todosQ.refetch()
          }}
        />
      ) : (
        <>
          {/* Today's work */}
          <Card style={{ gap: SPACE.xs }} padded={false}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.sm,
                paddingHorizontal: SPACE.lg,
                paddingTop: SPACE.lg,
                paddingBottom: SPACE.sm,
              }}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.textMute} />
              <Title style={{ fontSize: 16, flex: 1 }}>Today’s work</Title>
              <Small muted>
                {todos.filter((t) => t.status === 'done').length}/{todos.length} done
              </Small>
            </View>
            {todos.length === 0 ? (
              <Small muted style={{ paddingHorizontal: SPACE.lg, paddingBottom: SPACE.lg }}>
                No jobs assigned to you today.
              </Small>
            ) : (
              todos.map((t, i) => (
                <TodoRow
                  key={t.id}
                  t={t}
                  site={siteName.get(t.site_id) ?? 'Site'}
                  busy={toggle.isPending}
                  onToggle={() => toggle.mutate(t)}
                  first={i === 0}
                />
              ))
            )}
          </Card>

          {/* Asks for you */}
          <Card style={{ gap: SPACE.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <Ionicons name="arrow-undo-outline" size={18} color={theme.colors.textMute} />
              <Title style={{ fontSize: 16, flex: 1 }}>Asks for you</Title>
              <Pressable onPress={() => router.push('/(contractor)/supervisor/tasks')} hitSlop={8}>
                <Small style={{ color: theme.colors.accentDeep }}>{asks.length} open</Small>
              </Pressable>
            </View>
            {asks.length === 0 ? (
              <Small style={{ color: theme.colors.ok }}>All asks answered.</Small>
            ) : (
              asks.slice(0, 3).map((a) => (
                <AskRow
                  key={a.id}
                  a={a}
                  site={siteName.get(a.site_id ?? '') ?? ''}
                  onReply={() => router.push(`/(contractor)/supervisor/task/${a.id}`)}
                />
              ))
            )}
          </Card>
        </>
      )}
    </ScrollView>
  )
}

function TodoRow({
  t,
  site,
  busy,
  onToggle,
  first,
}: {
  t: ActionItem
  site: string
  busy: boolean
  onToggle: () => void
  first: boolean
}) {
  const { theme } = useTheme()
  const done = t.status === 'done'
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
        paddingHorizontal: SPACE.lg,
        paddingVertical: SPACE.md,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: theme.colors.line,
      }}
    >
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: done }} disabled={busy} onPress={onToggle} hitSlop={8}>
        <Ionicons
          name={done ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={done ? theme.colors.ok : theme.colors.textMute}
        />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body
          style={{
            color: done ? theme.colors.textMute : theme.colors.text,
            textDecorationLine: done ? 'line-through' : 'none',
          }}
          numberOfLines={2}
        >
          {t.title}
        </Body>
        <Small muted numberOfLines={1}>
          {site}
          {t.due_on ? ' · due today' : ''}
        </Small>
      </View>
    </View>
  )
}

function AskRow({ a, site, onReply }: { a: Approval; site: string; onReply: () => void }) {
  const { theme } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.sm,
        paddingTop: SPACE.sm,
        borderTopWidth: 1,
        borderTopColor: theme.colors.line,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body numberOfLines={1}>{a.title}</Body>
        {site ? <Small muted numberOfLines={1}>{site}</Small> : null}
      </View>
      <Button title="Reply" variant="secondary" size="md" onPress={onReply} />
    </View>
  )
}
