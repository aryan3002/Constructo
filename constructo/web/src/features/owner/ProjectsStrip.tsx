/**
 * ProjectsStrip — the Command Center's horizontal row of project cards. Each card
 * shows the project name, a status dot (status spine), location, and — only when
 * the row carries them — a last-activity relative time and a people count. A
 * trailing "+ New project" tile opens NewProjectModal.
 *
 * Props: { sites }. OwnerHome (Slice C) feeds `useSites().data.items`. `Site`
 * has no activity/people fields today, so those render defensively from an
 * optionally-widened `ProjectRow` and are omitted when absent.
 *
 * Zero sites: no special-cased empty state. The `.map()` over an empty array
 * renders no cards, so the "+ New project" tile is the only thing on the strip —
 * that tile IS the empty-state invitation (per R6: no owner.projects.empty.* key).
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { StatusDot, type Status } from '../../ui/StatusPill'
import { Small, H2 } from '../../ui/Typography'
import type { Site } from '../../api/types'
import { NewProjectModal } from './NewProjectModal'

const STATUS_TO_SPINE: Record<string, Status> = {
  active: 'ok',
  paused: 'warn',
  completed: 'done',
}

type ProjectRow = Site & {
  last_activity_at?: string | null
  people_count?: number | null
}

export interface ProjectsStripProps {
  sites: Site[]
}

/** Compact relative time ("2h", "3d") — omitted upstream when no timestamp. */
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.max(0, Math.round(diff / 60000))
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.round(hrs / 24)}d`
}

export function ProjectsStrip({ sites }: ProjectsStripProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const rows = sites as ProjectRow[]

  return (
    <section aria-label={t('projects.strip.title')}>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {rows.map((site) => (
          <li key={site.id} className="shrink-0 w-56">
            <Link
              to={`/sites/${site.id}`}
              className="block min-h-tap rounded-card border border-line bg-card p-4 shadow-card cstk-animate transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="flex items-center gap-2">
                <StatusDot status={STATUS_TO_SPINE[site.status] ?? 'info'} />
                <H2 as="h3" className="!text-h2 truncate">
                  {site.name}
                </H2>
              </div>
              {site.location && <Small className="mt-1 block truncate">{site.location}</Small>}
              {site.last_activity_at ? (
                <Small className="mt-0.5 block !text-text-mute">{relTime(site.last_activity_at)}</Small>
              ) : (
                <Small className="mt-0.5 block !text-text-mute">
                  {t('projects.strip.no_activity')}
                </Small>
              )}
              {typeof site.people_count === 'number' && (
                <Small className="mt-0.5 block !text-text-mute">
                  {t('projects.strip.people', { count: site.people_count })}
                </Small>
              )}
            </Link>
          </li>
        ))}

        {/* + New project tile — also the empty-state invitation when sites=[] */}
        <li className="shrink-0 w-56">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-tap h-full w-full flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line bg-card p-4 text-text-mute cstk-animate transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span aria-hidden className="text-h1 leading-none">
              +
            </span>
            <span className="font-body text-small font-medium">{t('projects.new.cta')}</span>
          </button>
        </li>
      </ul>

      <NewProjectModal open={open} onClose={() => setOpen(false)} />
    </section>
  )
}
