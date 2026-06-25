// Setup & Administration control plane (W4.1) — the shell.
//
// A sectioned admin canvas: a left rail of control-plane sections + the active
// section's panel, with the section in the URL (`?section=`) so it's deep-
// linkable and survives refresh (the URL-as-state DoD, same as the cockpit).
// W4.1 ships the Company Profile section (RHF + Zod); the rest are listed so the
// control-plane map is visible, each rendering an honest "coming in W4" panel
// (Groups links to the existing mapping screen). Owner-only (`manage_settings`).
import { Link, useSearchParams } from 'react-router-dom'
import { useT, type TranslationKey } from '../../i18n'
import { useCan, useMeRole } from '../../auth/useCan'
import {
  AppShell,
  Body,
  Display,
  H2,
  Small,
  useRoleTabs,
  type Role as ShellRole,
} from '../../ui'
import { CompanyProfile } from './CompanyProfile'
import { TeamRoles } from './TeamRoles'
import { SiteBaselines } from './SiteBaselines'
import { Vendors } from './Vendors'
import { Materials } from './Materials'
import { NotificationSettings } from './NotificationSettings'
import { Billing } from './Billing'

interface SectionDef {
  key: string
  labelKey: TranslationKey
  group: TranslationKey
  /** Built sections render a real panel; the rest show the roadmap placeholder. */
  built?: boolean
  /** Optional deep-link to an existing screen that already covers this. */
  link?: string
}

// The control-plane IA (vault 11/06). Order = the admin's mental model.
const SECTIONS: SectionDef[] = [
  { key: 'company', labelKey: 'admin.section.company', group: 'admin.group.brand', built: true },
  { key: 'team', labelKey: 'admin.section.team', group: 'admin.group.people', built: true },
  { key: 'baselines', labelKey: 'admin.section.baselines', group: 'admin.group.site', built: true },
  { key: 'vendors', labelKey: 'admin.section.vendors', group: 'admin.group.site', built: true },
  { key: 'materials', labelKey: 'admin.section.materials', group: 'admin.group.site', built: true },
  { key: 'groups', labelKey: 'admin.section.groups', group: 'admin.group.comms', link: '/groups' },
  { key: 'notifications', labelKey: 'admin.section.notifications', group: 'admin.group.comms', built: true },
  { key: 'billing', labelKey: 'admin.section.billing', group: 'admin.group.account', built: true },
  // Hidden for the pilot (empty stubs / now in the sidebar) — restore by re-adding:
  //   { key: 'documents', labelKey: 'admin.section.documents', group: 'admin.group.site', link: '/settings/documents' },
  //   { key: 'integrations', labelKey: 'admin.section.integrations', group: 'admin.group.comms' },
  //   { key: 'audit', labelKey: 'admin.section.audit', group: 'admin.group.account' },
  //   { key: 'security', labelKey: 'admin.section.security', group: 'admin.group.account' },
]

export function AdminConsole() {
  const t = useT()
  const role = (useMeRole() ?? 'owner') as ShellRole
  const tabs = useRoleTabs(role)
  const canManage = useCan('manage_settings')

  const [params, setParams] = useSearchParams()
  const requested = params.get('section') ?? 'company'
  const active = SECTIONS.find((s) => s.key === requested) ?? SECTIONS[0]

  function select(key: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('section', key)
        return next
      },
      { replace: true },
    )
  }

  return (
    <AppShell role={role} tabs={tabs}>
      <header className="mb-6">
        <Small className="!text-text-mute">{t('admin.title')}</Small>
        <Display className="mt-1">{t('admin.headline')}</Display>
        <Small className="mt-1 block !text-text-mute">{t('admin.subtitle')}</Small>
      </header>

      {!canManage ? (
        <section className="rounded-sheet border border-line bg-card p-6 shadow-card">
          <H2 as="h2">{t('admin.denied.title')}</H2>
          <Body className="mt-2 !text-text-mute">{t('admin.denied.hint')}</Body>
        </section>
      ) : (
        <div className="grid gap-6 md:grid-cols-[14rem,1fr]">
          {/* Section rail. */}
          <nav aria-label={t('admin.nav_label')} className="md:sticky md:top-20 md:self-start">
            <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
              {Array.from(new Set(SECTIONS.map((s) => s.group))).map((group) => (
                <li key={group} className="shrink-0">
                  <div className="px-3 pb-1 pt-3 font-body text-micro font-semibold uppercase tracking-wide text-text-mute">
                    {t(group)}
                  </div>
                  <ul className="flex flex-col gap-0.5">
                    {SECTIONS.filter((s) => s.group === group).map((s) => {
                      const isActive = s.key === active.key
                      return (
                        <li key={s.key}>
                          <button
                            type="button"
                            onClick={() => select(s.key)}
                            aria-current={isActive ? 'page' : undefined}
                            className={`flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-control px-3 py-2 text-left font-body text-small font-semibold cstk-animate transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                              isActive ? 'bg-surface-selected text-text' : 'text-text-mute hover:bg-surface-hover hover:text-text'
                            }`}
                          >
                            {t(s.labelKey)}
                            {!s.built ? (
                              <span className="rounded-pill bg-surface-sunken px-1.5 py-0.5 font-body text-micro font-semibold text-text-mute">
                                {t('admin.soon')}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </nav>

          {/* Active section panel. */}
          <div className="rounded-sheet border border-line bg-card p-5 shadow-card md:p-6">
            {active.key === 'company' ? (
              <CompanyProfile />
            ) : active.key === 'team' ? (
              <TeamRoles />
            ) : active.key === 'baselines' ? (
              <SiteBaselines />
            ) : active.key === 'vendors' ? (
              <Vendors />
            ) : active.key === 'materials' ? (
              <Materials />
            ) : active.key === 'notifications' ? (
              <NotificationSettings />
            ) : active.key === 'billing' ? (
              <Billing />
            ) : (
              <ComingSoon labelKey={active.labelKey} link={active.link} />
            )}
          </div>
        </div>
      )}
    </AppShell>
  )
}

function ComingSoon({ labelKey, link }: { labelKey: TranslationKey; link?: string }) {
  const t = useT()
  return (
    <section className="flex flex-col items-start gap-3">
      <H2 as="h2">{t(labelKey)}</H2>
      <p className="font-body text-small text-text-mute">{t('admin.coming_soon')}</p>
      {link ? (
        <Link
          to={link}
          className="inline-flex min-h-tap items-center gap-1.5 rounded-pill border border-primary/50 bg-card px-3 font-body text-small font-semibold text-primary-deep cstk-animate transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t('admin.open_existing')} <span aria-hidden>→</span>
        </Link>
      ) : null}
    </section>
  )
}
