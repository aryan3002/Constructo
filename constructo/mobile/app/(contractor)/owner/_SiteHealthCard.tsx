/**
 * Site Health summary card for the owner/PM site-detail screen.
 *
 * Shows the deterministic health score + band and the top findings (schedule
 * drift, work inconsistency, quality) with one-tap acknowledge/resolve. Mirrors
 * the web Site Health dashboard; reads the same /sites/{id}/health surface.
 */
import { View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Body, Button, Card, Small, StatusPill } from '../../../src/ui'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, type Status } from '../../../src/theme/tokens'
import type { Finding, FindingSeverity, HealthBand, SiteHealth } from '../../../src/api/health'

const SEVERITY_TO_STATUS: Record<FindingSeverity, Status> = {
  critical: 'risk',
  high: 'risk',
  medium: 'warn',
  low: 'info',
}
const BAND_TO_STATUS: Record<HealthBand, Status> = {
  at_risk: 'risk',
  watch: 'warn',
  healthy: 'ok',
}
const BAND_LABEL: Record<HealthBand, string> = {
  at_risk: 'At risk',
  watch: 'Watch',
  healthy: 'Healthy',
}
const SEVERITY_RANK: Record<FindingSeverity, number> = { critical: 3, high: 2, medium: 1, low: 0 }

const TOP_N = 3

export function SiteHealthCard({
  data,
  busy,
  onAcknowledge,
  onResolve,
}: {
  data: SiteHealth
  busy: boolean
  onAcknowledge: (id: string) => void
  onResolve: (id: string) => void
}) {
  const { theme } = useTheme()
  const findings: Finding[] = [...data.findings].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  )
  const top = findings.slice(0, TOP_N)
  const extra = findings.length - top.length

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACE.xs }}>
        <Feather name="activity" size={14} color={theme.colors.accentDeep} />
        <Small muted style={{ letterSpacing: 1 }}>
          SITE HEALTH
        </Small>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.sm }}>
        <Body style={{ fontSize: 30, lineHeight: 38, fontWeight: '700', color: theme.colors[BAND_TO_STATUS[data.band]] }}>
          {data.score}
          <Body style={{ color: theme.colors.textMute }}> / 100</Body>
        </Body>
        <StatusPill status={BAND_TO_STATUS[data.band]} size="sm" label={BAND_LABEL[data.band]} />
      </View>

      {top.length === 0 ? (
        <Small style={{ color: theme.colors.text }}>All clear — nothing flagged right now.</Small>
      ) : (
        top.map((f, i) => (
          <View key={f.id} style={{ marginTop: i === 0 ? 0 : SPACE.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm }}>
              <StatusPill status={SEVERITY_TO_STATUS[f.severity]} size="sm" label={f.severity.toUpperCase()} />
              <Small style={{ flex: 1, color: theme.colors.text }}>{f.headline}</Small>
            </View>
            {f.status === 'open' ? (
              <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: 6, marginLeft: 2 }}>
                <Button title="Acknowledge" variant="secondary" disabled={busy} onPress={() => onAcknowledge(f.id)} />
                <Button title="Resolve" variant="primary" disabled={busy} onPress={() => onResolve(f.id)} />
              </View>
            ) : (
              <Small muted style={{ marginTop: 4, marginLeft: 2 }}>
                {f.status === 'acknowledged' ? 'Acknowledged' : f.status}
              </Small>
            )}
          </View>
        ))
      )}

      {extra > 0 ? (
        <Small muted style={{ marginTop: SPACE.sm }}>
          +{extra} more {extra === 1 ? 'finding' : 'findings'}
        </Small>
      ) : null}
    </Card>
  )
}
