import { Link } from 'react-router-dom'
import type { BriefSite } from '../api/types'
import {
  SEVERITY_CLASSES,
  SEVERITY_LABEL,
  sortBySeverity,
} from '../lib/format'

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center rounded-md bg-slate-100 px-3 py-2">
      <span className="text-lg font-semibold text-slate-800">{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  )
}

export function BriefCard({ site }: { site: BriefSite }) {
  const risks = sortBySeverity(site.top_risks)

  return (
    <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            {site.name}
          </h3>
          <Link
            to={`/sites/${site.site_id}`}
            className="text-sm text-brand-600 hover:underline"
          >
            View site →
          </Link>
        </div>
      </header>

      {/* Top risks first */}
      <section className="mt-4" aria-label="Top risks">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Top risks
        </h4>
        {risks.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No risks flagged today.</p>
        ) : (
          <ul className="mt-2 space-y-2" data-testid="risk-list">
            {risks.map((risk, i) => (
              <li
                key={`${risk.kind}-${i}`}
                data-testid="risk-item"
                data-severity={risk.severity}
                className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                  SEVERITY_CLASSES[risk.severity] ?? SEVERITY_CLASSES.low
                }`}
              >
                <span className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase">
                  {SEVERITY_LABEL[risk.severity] ?? risk.severity}
                </span>
                <span>{risk.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 grid grid-cols-3 gap-2" aria-label="Counts">
        <CountPill label="Attendance" value={site.counts.attendance} />
        <CountPill label="Deliveries" value={site.counts.deliveries} />
        <CountPill label="Issues" value={site.counts.issues} />
      </section>
    </article>
  )
}
