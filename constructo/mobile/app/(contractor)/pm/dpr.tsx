/**
 * PM · DPR (the hero). The evening Daily Progress Report drafts itself from the
 * day's site_events; the PM reviews it, edits the summary, and SENDS it.
 *
 * Discipline mirrored from the backend (CA1 — AI proposes, the human commits):
 *   - The screen never sends on its own. The amber "Send report" button is the
 *     only thing that flips draft → sent.
 *   - Sections are evidence-anchored; a thin/empty day shows an honest minimal
 *     draft (an explicit note), never invented fiction.
 *   - PM PROPOSES, NEVER APPROVES — any money action reads as "propose to owner".
 *
 * Neev re-skin: ConfirmCard (AI draft), MoneyCell, StatusPill, Card flag,
 * EmptyState, Screen, SyncStatus, useInputStyle. No hardcoded hex or font families.
 */
import { useEffect, useMemo, useState } from 'react'
import { Share, TextInput, View } from 'react-native'
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
  ConfirmCard,
  type ConfirmField,
  type Confidence,
  EmptyState,
  H1,
  MonoSm,
  Screen,
  Small,
  StatusPill,
  SyncStatus,
  useInputStyle,
} from '../../../src/ui'

/** Strings — English default, Hindi via lang toggle. ONE language per screen. */
const STR = {
  en: {
    title: 'Daily Progress Report',
    subtitle: 'Auto-drafted from today’s site activity. Review and send.',
    chooseSite: 'Choose a site',
    noSites: 'No sites yet',
    noSitesBody: 'Your DPR lights up once a site starts capturing activity.',
    loading: 'Loading…',
    error: 'We could not load the DPR just now.',
    retry: 'Retry',
    draftBadge: 'Draft',
    sentBadge: 'Sent',
    thinDay: 'A thin day — only what was actually captured is shown. Nothing is invented.',
    aiLabel: 'AI DRAFT',
    aiHeading: "Here's what I heard",
    confidence: 'Confidence',
    confirmLabel: 'Looks right — Send',
    holdLabel: 'Check & send',
    editLabel: 'Edit',
    summary: 'Summary',
    summaryHint: 'You can edit this before sending.',
    saveEdit: 'Save',
    edited: 'Saved',
    labor: 'Labour',
    onSite: '{count} on site',
    laborUnknown: 'Headcount not captured',
    materials: 'Materials',
    workDone: 'Work done',
    blockers: 'Blockers',
    next: 'Next',
    unconfirmed: 'unconfirmed',
    emptySection: 'Nothing captured.',
    send: 'Send report',
    sent: 'Sent · logged',
    shareReport: 'Share report',
    proof: 'Proof',
  },
  hi: {
    title: 'दैनिक प्रगति रिपोर्ट',
    subtitle: 'आज की साइट गतिविधि से अपने-आप तैयार। जाँचें और भेजें।',
    chooseSite: 'साइट चुनें',
    noSites: 'अभी कोई साइट नहीं',
    noSitesBody: 'साइट गतिविधि दर्ज करना शुरू करते ही आपकी DPR जीवंत हो जाएगी।',
    loading: 'लोड हो रहा है…',
    error: 'अभी DPR लोड नहीं हो सकी।',
    retry: 'फिर कोशिश करें',
    draftBadge: 'ड्राफ़्ट',
    sentBadge: 'भेजा गया',
    thinDay: 'कम गतिविधि वाला दिन — सिर्फ़ वही दिखाया गया है जो वाकई दर्ज हुआ। कुछ भी बनाया नहीं गया।',
    aiLabel: 'AI DRAFT',
    aiHeading: 'यह मैंने सुना',
    confidence: 'भरोसा',
    confirmLabel: 'ठीक है — भेजें',
    holdLabel: 'जाँचें और भेजें',
    editLabel: 'बदलें',
    summary: 'सारांश',
    summaryHint: 'भेजने से पहले आप इसे बदल सकते हैं।',
    saveEdit: 'सेव करें',
    edited: 'सेव हो गया',
    labor: 'मज़दूर',
    onSite: 'साइट पर {count}',
    laborUnknown: 'हाज़िरी दर्ज नहीं',
    materials: 'सामग्री',
    workDone: 'हुआ काम',
    blockers: 'रुकावटें',
    next: 'आगे',
    unconfirmed: 'अपुष्ट',
    emptySection: 'कुछ दर्ज नहीं।',
    send: 'रिपोर्ट भेजें',
    sent: 'भेजा गया · दर्ज',
    shareReport: 'रिपोर्ट साझा करें',
    proof: 'प्रमाण',
  },
  // NOTE: no `as const` — keep en/hi the same widened shape so STR[lang] flows
  // into the language-aware helpers (LaborCard/MaterialsCard/buildDprText).
}

const todayISO = () => new Date().toISOString().slice(0, 10)

/** Assemble a plain-text DPR (digit-safe; no emoji) for the OS share sheet, so
 *  the report survives outside the app (e.g. relayed to WhatsApp). */
function buildDprText(dpr: Dpr, str: typeof STR['en']): string {
  const s = dpr.sections
  const lines: string[] = [`DPR — ${dpr.report_date}`]
  if (s.summary) lines.push('', s.summary)
  const headcount =
    s.labor.headcount != null
      ? str.onSite.replace('{count}', String(s.labor.headcount))
      : str.laborUnknown
  lines.push('', `${str.labor}: ${headcount}`)
  const block = (title: string, items: string[]) => {
    if (items.length === 0) return
    lines.push('', `${title}:`)
    for (const it of items) lines.push(`- ${it}`)
  }
  block(str.materials, s.materials.deliveries.map((d) => d.summary))
  block(str.workDone, s.work_done.items.map((w) => w.summary))
  block(str.blockers, s.blockers.items.map((b) => b.description))
  block(str.next, s.next.items)
  return lines.join('\n')
}

export default function PmDpr() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const str = STR[lang]
  const qc = useQueryClient()
  const date = todayISO()
  const inputStyle = useInputStyle()

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

  // Derive ConfirmCard fields from the DPR sections so the AI draft is visible
  // and reviewable with honest confidence before sending.
  const confirmFields = useMemo((): ConfirmField[] => {
    if (!dpr) return []
    const s = dpr.sections
    const fields: ConfirmField[] = []
    if (s.labor.headcount != null) {
      fields.push({
        label: str.labor,
        value: str.onSite.replace('{count}', String(s.labor.headcount)),
        numeric: false,
      })
    }
    if (s.materials.deliveries.length > 0) {
      fields.push({
        label: str.materials,
        value: s.materials.deliveries.map((d) => d.summary).join('; '),
        // Any delivery that needs clarification from the AI is low-confidence.
        lowConfidence: s.materials.deliveries.some((d) => d.needs_clarification),
      })
    }
    if (s.work_done.items.length > 0) {
      fields.push({
        label: str.workDone,
        value: s.work_done.items.map((w) => w.summary).join('; '),
      })
    }
    if (s.blockers.items.length > 0) {
      fields.push({
        label: str.blockers,
        value: s.blockers.items.map((b) => b.description).join('; '),
        lowConfidence: true,
      })
    }
    return fields
  }, [dpr, str])

  // Honest confidence: any low-confidence delivery or empty day → warn/low.
  const confidence: Confidence = useMemo(() => {
    if (!dpr) return 'high'
    if (isEmptyDay) return 'low'
    if (dpr.sections.materials.deliveries.some((d) => d.needs_clarification)) return 'medium'
    return 'high'
  }, [dpr, isEmptyDay])

  return (
    <>
      <SyncStatus />
      <Screen>
        {/* header */}
        <View style={{ gap: SPACE.xs }}>
          <H1>{str.title}</H1>
          <Body muted>{str.subtitle}</Body>
        </View>

        {/* site picker */}
        {sitesQ.data && sitesQ.data.length > 0 ? (
          <SitePicker
            sites={sitesQ.data}
            value={siteId}
            label={str.chooseSite}
            onChange={(id) => {
              setSiteId(id)
              setSummaryDraft(null)
            }}
          />
        ) : sitesQ.data ? (
          <EmptyState
            variant="empty"
            title={str.noSites}
            body={str.noSitesBody}
          />
        ) : null}

        {/* states */}
        {dprQ.isLoading ? (
          <EmptyState
            variant="offline"
            icon="loader"
            title={str.loading}
          />
        ) : dprQ.error ? (
          <EmptyState
            variant="empty"
            icon="alert-circle"
            title={str.error}
            action={
              <Button
                title={str.retry}
                variant="secondary"
                onPress={() => void dprQ.refetch()}
              />
            }
          />
        ) : dpr ? (
          <>
            {/* status badge */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <StatusPill
                status={sent ? 'ok' : 'info'}
                size="sm"
                label={sent ? str.sentBadge : str.draftBadge}
              />
              <MonoSm muted>· {dpr.report_date}</MonoSm>
            </View>

            {/* thin-day honest note */}
            {isEmptyDay ? (
              <Card flag="warn">
                <Body muted>{str.thinDay}</Body>
              </Card>
            ) : null}

            {/* ConfirmCard — the AI-drafted report: confidence visible, low conf holds send. */}
            {!sent ? (
              <ConfirmCard
                aiLabel={str.aiLabel}
                heading={str.aiHeading}
                transcript={summaryDraft ?? undefined}
                fields={confirmFields}
                confidence={confidence}
                confirmLabel={str.confirmLabel}
                holdConfirmLabel={str.holdLabel}
                editLabel={str.editLabel}
                onConfirm={() => sendM.mutate()}
                onEdit={() => {/* summary edit is below — user taps that card */}}
              />
            ) : (
              /* sent state: show the logged summary as a plain card */
              <Card flag="ok">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.sm }}>
                  <Feather name="check-circle" size={16} color={c.ok} />
                  <Small color={c.ok}>{str.sent}</Small>
                </View>
                {dpr.sections.summary ? (
                  <Body>{dpr.sections.summary}</Body>
                ) : null}
              </Card>
            )}

            {/* summary edit (only when not yet sent) */}
            {!sent ? (
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.sm }}>
                  <Feather name="edit-2" size={14} color={c.textMute} />
                  <MonoSm
                    color={c.textMute}
                    style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}
                  >
                    {str.summary}
                  </MonoSm>
                </View>
                <TextInput
                  value={summaryDraft ?? ''}
                  onChangeText={setSummaryDraft}
                  multiline
                  placeholder={str.summary}
                  placeholderTextColor={c.textMute}
                  style={[
                    inputStyle,
                    {
                      minHeight: 72,
                      paddingTop: SPACE.md,
                      textAlignVertical: 'top',
                    },
                  ]}
                />
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: SPACE.xs,
                  }}
                >
                  <Small muted>{str.summaryHint}</Small>
                  <Button
                    title={editM.isSuccess && !editM.isPending ? str.edited : str.saveEdit}
                    variant="ghost"
                    size="md"
                    loading={editM.isPending}
                    disabled={summaryDraft === dpr.sections.summary}
                    onPress={saveSummary}
                  />
                </View>
              </Card>
            ) : null}

            {/* sections */}
            <LaborCard dpr={dpr} str={str} />
            <MaterialsCard dpr={dpr} str={str} />
            <ListCard
              icon="check-square"
              title={str.workDone}
              items={dpr.sections.work_done.items.map((w) => w.summary)}
              emptyLabel={str.emptySection}
            />
            <ListCard
              icon="alert-triangle"
              title={str.blockers}
              items={dpr.sections.blockers.items.map((b) => b.description)}
              tone="risk"
              emptyLabel={str.emptySection}
            />
            <ListCard
              icon="arrow-right"
              title={str.next}
              items={dpr.sections.next.items}
              emptyLabel={str.emptySection}
            />

            {/* Share as plain text — survives outside the app (WhatsApp). */}
            <Button
              title={str.shareReport}
              variant="secondary"
              block
              leading={<Feather name="share-2" size={16} color={c.text} />}
              onPress={() => void Share.share({ message: buildDprText(dpr, str) })}
            />
          </>
        ) : null}
      </Screen>
    </>
  )
}

// ---------------------------------------------------------------------------
// Local composite components (role-specific; not in src/ui).
// ---------------------------------------------------------------------------

function SitePicker({
  sites,
  value,
  label,
  onChange,
}: {
  sites: Site[]
  value: string | null
  label: string
  onChange: (id: string) => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View style={{ gap: SPACE.xs }}>
      <MonoSm
        color={c.textMute}
        style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}
      >
        {label}
      </MonoSm>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
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
                borderWidth: active ? 1.5 : 1,
                borderColor: active ? c.accent : c.line,
                backgroundColor: active ? c.accent : c.card,
                color: active ? c.onAccent : c.text,
                overflow: 'hidden',
              }}
            >
              {s.name}
            </Body>
          )
        })}
      </View>
    </View>
  )
}

function SectionHeader({
  icon,
  title,
}: {
  icon: React.ComponentProps<typeof Feather>['name']
  title: string
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
      <Feather name={icon} size={15} color={c.textMute} />
      <MonoSm
        color={c.textMute}
        style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}
      >
        {title}
      </MonoSm>
    </View>
  )
}

function LaborCard({ dpr, str }: { dpr: Dpr; str: typeof STR['en'] }) {
  const labor = dpr.sections.labor
  const headcount = labor.headcount
  return (
    <Card>
      <SectionHeader icon="users" title={str.labor} />
      <BodyStrong style={{ marginTop: SPACE.sm, fontSize: 18 }}>
        {headcount != null
          ? str.onSite.replace('{count}', String(headcount))
          : str.laborUnknown}
      </BodyStrong>
      {labor.entries.map((e) => (
        <Small key={e.event_id} muted style={{ marginTop: 2 }}>
          {e.summary}
        </Small>
      ))}
    </Card>
  )
}

function MaterialsCard({ dpr, str }: { dpr: Dpr; str: typeof STR['en'] }) {
  const deliveries = dpr.sections.materials.deliveries
  return (
    <Card>
      <SectionHeader icon="package" title={str.materials} />
      {deliveries.length === 0 ? (
        <Body muted style={{ marginTop: SPACE.sm }}>
          {str.emptySection}
        </Body>
      ) : (
        deliveries.map((d) => (
          <View
            key={d.event_id}
            style={{
              marginTop: SPACE.sm,
              gap: SPACE.xs,
            }}
          >
            <Body>{d.summary}</Body>
            {d.needs_clarification ? (
              <StatusPill status="warn" size="sm" label={str.unconfirmed} />
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
  emptyLabel,
}: {
  icon: React.ComponentProps<typeof Feather>['name']
  title: string
  items: string[]
  tone?: 'risk'
  emptyLabel: string
}) {
  return (
    <Card
      flag={tone === 'risk' && items.length > 0 ? 'risk' : undefined}
    >
      <SectionHeader icon={icon} title={title} />
      {items.length === 0 ? (
        <Body muted style={{ marginTop: SPACE.sm }}>
          {emptyLabel}
        </Body>
      ) : (
        items.map((it, i) => (
          <Body key={`${i}-${it.slice(0, 12)}`} style={{ marginTop: SPACE.sm }}>
            • {it}
          </Body>
        ))
      )}
    </Card>
  )
}
