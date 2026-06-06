/**
 * PM · DPR (the hero). The evening Daily Progress Report drafts itself from the
 * day's site_events; the PM reviews it, edits the summary, and SENDS it.
 *
 * Discipline mirrored from the backend (CA1 — AI proposes, the human commits):
 *   - The screen never sends on its own. The amber "Send report" button is the
 *     only thing that flips draft → sent.
 *   - Sections are evidence-anchored; a thin/empty day shows an honest minimal
 *     draft (an explicit note), never invented fiction.
 *
 * Strings come from the t() i18n catalog; icons are premium Feather glyphs.
 */
import { useEffect, useMemo, useState } from 'react'
import { ScrollView, Share, TextInput, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import {
  pm,
  type Dpr,
  type DprSections,
  type Site,
} from '../../../src/api/pm'
import {
  Body,
  BodyStrong,
  Button,
  Card,
  H1,
  Small,
  StatusDot,
} from '../../../src/ui'

const todayISO = () => new Date().toISOString().slice(0, 10)

/** Assemble a plain-text DPR (digit-safe; no emoji) for the OS share sheet, so
 *  the report survives outside the app (e.g. relayed to WhatsApp). */
function buildDprText(dpr: Dpr, t: (k: string, v?: Record<string, string | number>) => string): string {
  const s = dpr.sections
  const lines: string[] = [`DPR — ${dpr.report_date}`]
  if (s.summary) lines.push('', s.summary)
  lines.push(
    '',
    `${t('pm.labor')}: ${s.labor.headcount != null ? t('pm.onSite', { count: s.labor.headcount }) : t('pm.laborUnknown')}`,
  )
  const block = (title: string, items: string[]) => {
    if (items.length === 0) return
    lines.push('', `${title}:`)
    for (const it of items) lines.push(`- ${it}`)
  }
  block(t('pm.materials'), s.materials.deliveries.map((d) => d.summary))
  block(t('pm.workDone'), s.work_done.items.map((w) => w.summary))
  block(t('pm.blockers'), s.blockers.items.map((b) => b.description))
  block(t('pm.next'), s.next.items)
  return lines.join('\n')
}

export default function PmDpr() {
  const { t, lang } = useT()
  const { theme } = useTheme()
  const qc = useQueryClient()
  const date = todayISO()

  const [siteId, setSiteId] = useState<string | null>(null)
  const [summaryDraft, setSummaryDraft] = useState<string | null>(null)

  // 1) The PM's sites (owner/pm see all company sites).
  const sitesQ = useQuery<Site[]>({
    queryKey: ['pm', 'sites'],
    queryFn: async () => (await pm.sites()).items,
  })

  // Default to the first site once they load.
  useEffect(() => {
    if (siteId == null && sitesQ.data && sitesQ.data.length > 0) {
      setSiteId(sitesQ.data[0].id)
    }
  }, [siteId, sitesQ.data])

  // 2) Today's auto-draft for the chosen site (idempotent generate-or-fetch).
  const dprQ = useQuery<Dpr>({
    queryKey: ['pm', 'dpr', siteId, date],
    enabled: siteId != null,
    queryFn: () => pm.draftDpr(siteId as string, date),
  })

  // Keep the editable summary mirror in sync with the loaded draft.
  useEffect(() => {
    if (dprQ.data) setSummaryDraft(dprQ.data.sections.summary ?? '')
  }, [dprQ.data])

  const editM = useMutation({
    mutationFn: (sections: DprSections) =>
      pm.editDpr((dprQ.data as Dpr).id, sections),
    onSuccess: (updated) => qc.setQueryData(['pm', 'dpr', siteId, date], updated),
  })

  const sendM = useMutation({
    mutationFn: () => pm.sendDpr((dprQ.data as Dpr).id),
    onSuccess: (updated) => qc.setQueryData(['pm', 'dpr', siteId, date], updated),
  })

  const dpr = dprQ.data
  const sent = dpr?.status === 'sent'

  const isEmptyDay = useMemo(() => {
    if (!dpr) return false
    const s = dpr.sections
    return (
      (s.labor.headcount == null && s.labor.entries.length === 0) &&
      s.materials.deliveries.length === 0 &&
      s.work_done.items.length === 0 &&
      s.blockers.items.length === 0
    )
  }, [dpr])

  function saveSummary() {
    if (!dpr || summaryDraft == null) return
    editM.mutate({ ...dpr.sections, summary: summaryDraft })
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{
        padding: SPACE.lg,
        paddingTop: SPACE.xl,
        paddingBottom: SPACE.xxl,
        gap: SPACE.md,
      }}
    >
      {/* header */}
      <View style={{ gap: SPACE.xs }}>
        <H1>{t('pm.dprTitle')}</H1>
        <Body muted>{t('pm.dprSubtitle')}</Body>
      </View>

      {/* site picker */}
      {sitesQ.data && sitesQ.data.length > 0 ? (
        <SitePicker
          sites={sitesQ.data}
          value={siteId}
          onChange={(id) => {
            setSiteId(id)
            setSummaryDraft(null)
          }}
        />
      ) : sitesQ.data ? (
        <Card>
          <BodyStrong>{t('pm.noSites')}</BodyStrong>
          <Body muted style={{ marginTop: SPACE.xs }}>
            {t('pm.noSitesBody')}
          </Body>
        </Card>
      ) : null}

      {/* states */}
      {dprQ.isLoading ? (
        <Card>
          <Body muted>{t('common.loading')}</Body>
        </Card>
      ) : dprQ.error ? (
        <Card>
          <Body>{t('pm.error')}</Body>
          <Button
            title={t('common.retry')}
            variant="secondary"
            style={{ marginTop: SPACE.sm }}
            onPress={() => void dprQ.refetch()}
          />
        </Card>
      ) : dpr ? (
        <>
          {/* status badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <StatusDot status={sent ? 'ok' : 'info'} />
            <Small style={{ color: sent ? theme.colors.ok : theme.colors.info }}>
              {sent ? t('pm.sentBadge') : t('pm.draftBadge')}
            </Small>
            <Small muted>· {dpr.report_date}</Small>
          </View>

          {/* honest thin-day note */}
          {isEmptyDay ? (
            <Card style={{ borderLeftWidth: 4, borderLeftColor: theme.colors.warn }}>
              <Body muted>{t('pm.thinDay')}</Body>
            </Card>
          ) : null}

          {/* summary (editable until sent) */}
          <Card>
            <Small muted style={{ letterSpacing: 1 }}>
              {t('pm.summary').toUpperCase()}
            </Small>
            {sent ? (
              <Body style={{ marginTop: SPACE.xs }}>{dpr.sections.summary}</Body>
            ) : (
              <>
                <TextInput
                  value={summaryDraft ?? ''}
                  onChangeText={setSummaryDraft}
                  multiline
                  placeholder={t('pm.summary')}
                  placeholderTextColor={theme.colors.textMute}
                  style={{
                    marginTop: SPACE.xs,
                    minHeight: 72,
                    padding: SPACE.md,
                    borderRadius: theme.radii.control,
                    borderWidth: 1,
                    borderColor: theme.colors.line,
                    color: theme.colors.text,
                    fontFamily: 'Hind-Regular',
                    fontSize: 15,
                    textAlignVertical: 'top',
                  }}
                />
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: SPACE.xs,
                  }}
                >
                  <Small muted>{t('pm.summaryHint')}</Small>
                  <Button
                    title={editM.isSuccess && !editM.isPending ? t('pm.edited') : t('pm.saveEdit')}
                    variant="ghost"
                    size="md"
                    loading={editM.isPending}
                    disabled={summaryDraft === dpr.sections.summary}
                    onPress={saveSummary}
                  />
                </View>
              </>
            )}
          </Card>

          {/* sections */}
          <LaborCard dpr={dpr} />
          <MaterialsCard dpr={dpr} />
          <ListCard
            icon="check-square"
            title={t('pm.workDone')}
            items={dpr.sections.work_done.items.map((w) => w.summary)}
          />
          <ListCard
            icon="alert-triangle"
            title={t('pm.blockers')}
            items={dpr.sections.blockers.items.map((b) => b.description)}
            tone="risk"
          />
          <ListCard
            icon="arrow-right"
            title={t('pm.next')}
            items={dpr.sections.next.items}
          />

          {/* SEND — the only path that commits draft → sent (CA1). */}
          {sent ? (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.sm }}
            >
              <Feather name="check-circle" size={18} color={theme.colors.ok} />
              <Small style={{ color: theme.colors.ok }}>{t('pm.sent')}</Small>
            </View>
          ) : (
            <Button
              title={t('pm.send')}
              block
              size="lg"
              loading={sendM.isPending}
              onPress={() => sendM.mutate()}
            />
          )}

          {/* Share the DPR as plain text — survives outside the app (WhatsApp). */}
          <Button
            title={lang === 'hi' ? 'रिपोर्ट साझा करें' : 'Share report'}
            variant="secondary"
            block
            onPress={() => void Share.share({ message: buildDprText(dpr, t) })}
          />
        </>
      ) : null}
    </ScrollView>
  )
}

// ---------------------------------------------------------------------------
// Local composite components (role-specific; not in src/ui).
// ---------------------------------------------------------------------------

function SitePicker({
  sites,
  value,
  onChange,
}: {
  sites: Site[]
  value: string | null
  onChange: (id: string) => void
}) {
  const { t } = useT()
  const { theme } = useTheme()
  return (
    <View style={{ gap: SPACE.xs }}>
      <Small muted style={{ letterSpacing: 1 }}>
        {t('pm.chooseSite').toUpperCase()}
      </Small>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          {sites.map((s) => {
            const active = s.id === value
            return (
              <Body
                key={s.id}
                onPress={() => onChange(s.id)}
                style={{
                  paddingVertical: SPACE.sm,
                  paddingHorizontal: SPACE.md,
                  borderRadius: theme.radii.pill,
                  borderWidth: 1,
                  borderColor: active ? theme.colors.accent : theme.colors.line,
                  backgroundColor: active ? theme.colors.accent : theme.colors.card,
                  color: active ? theme.colors.card : theme.colors.text,
                  overflow: 'hidden',
                }}
              >
                {s.name}
              </Body>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}

function SectionHeader({ icon, title }: { icon: React.ComponentProps<typeof Feather>['name']; title: string }) {
  const { theme } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
      <Feather name={icon} size={16} color={theme.colors.textMute} />
      <Small muted style={{ letterSpacing: 1 }}>
        {title.toUpperCase()}
      </Small>
    </View>
  )
}

function LaborCard({ dpr }: { dpr: Dpr }) {
  const { t } = useT()
  const labor = dpr.sections.labor
  return (
    <Card>
      <SectionHeader icon="users" title={t('pm.labor')} />
      <BodyStrong style={{ marginTop: SPACE.xs, fontSize: 18 }}>
        {labor.headcount != null ? t('pm.onSite', { count: labor.headcount }) : t('pm.laborUnknown')}
      </BodyStrong>
      {labor.entries.map((e) => (
        <Small key={e.event_id} muted style={{ marginTop: 2 }}>
          {e.summary}
        </Small>
      ))}
    </Card>
  )
}

function MaterialsCard({ dpr }: { dpr: Dpr }) {
  const { t } = useT()
  const deliveries = dpr.sections.materials.deliveries
  return (
    <Card>
      <SectionHeader icon="package" title={t('pm.materials')} />
      {deliveries.length === 0 ? (
        <Body muted style={{ marginTop: SPACE.xs }}>
          {t('pm.emptySection')}
        </Body>
      ) : (
        deliveries.map((d) => (
          <View key={d.event_id} style={{ marginTop: SPACE.xs }}>
            <Body>{d.summary}</Body>
            {d.needs_clarification ? (
              <Small style={{ color: '#e8a317' }}>≈ {t('pm.unconfirmed')}</Small>
            ) : null}
          </View>
        ))
      )}
    </Card>
  )
}

function ListCard({
  icon,
  title,
  items,
  tone,
}: {
  icon: React.ComponentProps<typeof Feather>['name']
  title: string
  items: string[]
  tone?: 'risk'
}) {
  const { t } = useT()
  const { theme } = useTheme()
  return (
    <Card
      style={
        tone === 'risk' && items.length > 0
          ? { borderLeftWidth: 4, borderLeftColor: theme.colors.risk }
          : undefined
      }
    >
      <SectionHeader icon={icon} title={title} />
      {items.length === 0 ? (
        <Body muted style={{ marginTop: SPACE.xs }}>
          {t('pm.emptySection')}
        </Body>
      ) : (
        items.map((it, i) => (
          <Body key={`${i}-${it.slice(0, 12)}`} style={{ marginTop: SPACE.xs }}>
            • {it}
          </Body>
        ))
      )}
    </Card>
  )
}
