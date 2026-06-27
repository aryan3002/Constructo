import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Body, Button, Display, Micro, Small, StatusPill, ThemeProvider, type Status } from '../../ui'
import { ApiError } from '../../api/client'
import {
  acknowledgeFinding,
  getSiteHealth,
  resolveFinding,
  type Finding,
  type FindingSeverity,
  type HealthBand,
  type SiteHealth,
} from '../../api/health'

type Phase = 'loading' | 'done' | 'error'

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

function FindingCard({
  finding,
  busy,
  onAcknowledge,
  onResolve,
}: {
  finding: Finding
  busy: boolean
  onAcknowledge: (id: string) => void
  onResolve: (id: string) => void
}) {
  return (
    <div className="rounded-card border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill
          status={SEVERITY_TO_STATUS[finding.severity]}
          size="sm"
          label={finding.severity.toUpperCase()}
        />
        {finding.phase ? (
          <span className="inline-flex items-center rounded-pill border border-line bg-paper px-2.5 py-0.5 font-body text-micro font-semibold text-text-mute">
            {finding.phase}
          </span>
        ) : null}
        {finding.status === 'acknowledged' ? (
          <StatusPill status="info" size="sm" label="Acknowledged" />
        ) : null}
      </div>
      <p className="mt-2 font-body font-semibold text-text">{finding.headline}</p>
      <Small className="mt-1 block text-text-mute">{finding.detail}</Small>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Micro className="cstk-mono text-text-mute">Detected {finding.detected_on}</Micro>
        <div className="flex gap-2">
          {finding.status === 'open' ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => onAcknowledge(finding.id)}
            >
              Acknowledge
            </Button>
          ) : null}
          <Button variant="primary" disabled={busy} onClick={() => onResolve(finding.id)}>
            Resolve
          </Button>
        </div>
      </div>
    </div>
  )
}

export function SiteHealth() {
  const { siteId = '' } = useParams()
  const [phase, setPhase] = useState<Phase>('loading')
  const [health, setHealth] = useState<SiteHealth | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (refresh: boolean) => {
      if (!siteId) return
      setPhase('loading')
      setErrorMsg(null)
      try {
        setHealth(await getSiteHealth(siteId, { refresh }))
        setPhase('done')
      } catch (err) {
        setErrorMsg(err instanceof ApiError ? err.message : 'Failed to load site health')
        setPhase('error')
      }
    },
    [siteId],
  )

  // First load recomputes live so the dashboard is fresh even before a nightly run.
  useEffect(() => {
    void load(true)
  }, [load])

  async function act(fn: (id: string) => Promise<unknown>, id: string) {
    setBusy(true)
    try {
      await fn(id)
      await load(false)
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const findings = [...(health?.findings ?? [])].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  )

  return (
    <ThemeProvider defaultTheme="site">
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Micro className="font-semibold uppercase tracking-widest text-primary-deep">
              Site Health
            </Micro>
            <Display as="h1" className="mt-1 !text-h1">
              What needs attention
            </Display>
            <Body className="mt-1 text-text-mute">
              Proactive checks across schedule, work, and quality — refreshed nightly.
            </Body>
          </div>
          <Button variant="secondary" disabled={phase === 'loading'} onClick={() => load(true)}>
            {phase === 'loading' ? 'Refreshing…' : 'Refresh'}
          </Button>
        </header>

        <section className="mt-6" aria-live="polite">
          {phase === 'loading' && !health ? (
            <div className="rounded-card border border-dashed border-line bg-paper p-8 text-center">
              <Body className="text-text-mute">Computing site health…</Body>
            </div>
          ) : null}

          {phase === 'error' ? (
            <div role="alert" className="rounded-card border border-risk/30 bg-risk/10 p-4">
              <Body className="font-semibold !text-risk">Couldn’t load site health</Body>
              {errorMsg ? <Small className="mt-1 !text-risk">{errorMsg}</Small> : null}
            </div>
          ) : null}

          {health ? (
            <>
              {/* Score panel */}
              <div className="rounded-card border border-line bg-card p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Micro className="font-semibold uppercase tracking-wide text-text-mute">
                      Health score
                    </Micro>
                    <p className="mt-1 font-display text-[2.75rem] leading-none font-bold text-text">
                      {health.score}
                      <span className="text-h3 font-semibold text-text-mute"> / 100</span>
                    </p>
                  </div>
                  <StatusPill status={BAND_TO_STATUS[health.band]} size="md" label={BAND_LABEL[health.band]} />
                </div>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-pill bg-paper-2">
                  <div
                    className={`h-full rounded-pill ${
                      health.band === 'at_risk'
                        ? 'bg-risk'
                        : health.band === 'watch'
                          ? 'bg-warn'
                          : 'bg-ok'
                    }`}
                    style={{ width: `${health.score}%` }}
                  />
                </div>
              </div>

              {/* Findings */}
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <Micro className="font-semibold uppercase tracking-wide text-text-mute">
                    {findings.length === 1 ? '1 active finding' : `${findings.length} active findings`}
                  </Micro>
                </div>
                {findings.length === 0 ? (
                  <div className="mt-3 rounded-card border border-ok/30 bg-ok/10 p-6 text-center">
                    <Body className="font-semibold !text-text">All clear</Body>
                    <Small className="mt-1">No issues detected on this site right now.</Small>
                  </div>
                ) : (
                  <ul className="mt-3 grid gap-3">
                    {findings.map((f) => (
                      <li key={f.id}>
                        <FindingCard
                          finding={f}
                          busy={busy}
                          onAcknowledge={(id) => act(acknowledgeFinding, id)}
                          onResolve={(id) => act(resolveFinding, id)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </ThemeProvider>
  )
}
