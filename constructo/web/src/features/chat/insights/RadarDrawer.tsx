/**
 * RadarDrawer — "what's slipping" (Phase D). The deterministic sentinel signals
 * for a site (absence / overdue), in a right slide-over. Semantic tokens only.
 */
import { useQuery } from '@tanstack/react-query'
import { Drawer } from '../../../ui/Drawer'
import { chatApi } from '../../../api/chat'

export interface RadarDrawerProps {
  open: boolean
  onClose: () => void
  siteId: string
}

const SEV_DOT: Record<string, string> = { high: 'bg-risk', medium: 'bg-warn', low: 'bg-info' }

export function RadarDrawer({ open, onClose, siteId }: RadarDrawerProps) {
  const q = useQuery({
    queryKey: ['chat', 'sentinel', siteId],
    queryFn: () => chatApi.sentinel(siteId),
    enabled: open,
  })
  const signals = q.data?.signals ?? []

  return (
    <Drawer open={open} onClose={onClose} title="What's slipping">
      {q.isPending ? (
        <p className="font-body text-small text-text-muted">Checking…</p>
      ) : signals.length === 0 ? (
        <p className="font-body text-small text-text-muted">All clear — nothing slipping right now.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {signals.map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEV_DOT[s.severity] ?? 'bg-info'}`}
              />
              <span className="font-body text-body text-text-primary">{s.message}</span>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  )
}
