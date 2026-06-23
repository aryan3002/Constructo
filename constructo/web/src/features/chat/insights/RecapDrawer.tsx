/**
 * RecapDrawer — "last 24 hours" (Phase D). Deterministic recap totals for a
 * site (event counts, material totals, worker-days, amount, open disputes) in a
 * right slide-over. Semantic tokens only.
 */
import { useQuery } from '@tanstack/react-query'
import { Drawer } from '../../../ui/Drawer'
import { chatApi } from '../../../api/chat'

export interface RecapDrawerProps {
  open: boolean
  onClose: () => void
  siteId: string
}

export function RecapDrawer({ open, onClose, siteId }: RecapDrawerProps) {
  const q = useQuery({
    queryKey: ['chat', 'recap', siteId],
    queryFn: () => chatApi.recap(siteId),
    enabled: open,
  })
  const r = q.data
  const empty = r && !r.summary && Object.keys(r.event_counts).length === 0

  return (
    <Drawer open={open} onClose={onClose} title="Last 24 hours">
      {q.isPending ? (
        <p className="font-body text-small text-text-muted">Loading…</p>
      ) : !r || empty ? (
        <p className="font-body text-small text-text-muted">Nothing logged in this window.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="font-body text-body text-text-primary">{r.summary}</p>

          {Object.keys(r.event_counts).length > 0 ? (
            <section>
              <h3 className="mb-1 font-body text-small font-semibold uppercase tracking-wide text-text-muted">
                Activity
              </h3>
              <ul className="flex flex-col gap-1">
                {Object.entries(r.event_counts).map(([k, v]) => (
                  <li key={k} className="flex justify-between font-body text-small text-text-secondary">
                    <span>{k}</span>
                    <span className="font-mono">{v}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {Object.keys(r.material_totals).length > 0 ? (
            <section>
              <h3 className="mb-1 font-body text-small font-semibold uppercase tracking-wide text-text-muted">
                Materials
              </h3>
              <ul className="flex flex-col gap-1">
                {Object.entries(r.material_totals).map(([k, v]) => (
                  <li key={k} className="flex justify-between font-body text-small text-text-secondary">
                    <span>{k}</span>
                    <span className="font-mono">{v}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {r.open_disputes > 0 ? (
            <p className="font-body text-small font-medium text-risk-fg">
              {r.open_disputes} open dispute{r.open_disputes !== 1 ? 's' : ''}
            </p>
          ) : null}
        </div>
      )}
    </Drawer>
  )
}
