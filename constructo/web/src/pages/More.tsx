import { Link, useNavigate } from 'react-router-dom'
import { clearToken, type Role } from '../api/auth'
import { useMeRole } from '../auth/useCan'
import { useT, type TranslationKey } from '../i18n'
import { AppShell, Display, H2, Small, useRoleTabs, type Role as ShellRole } from '../ui'

interface MoreLink {
  to: string
  labelKey: TranslationKey
  icon: string
}

/**
 * The secondary destinations each role can reach from the "More" tab. The
 * primary lanes already live in the bottom bar (see ROLE_TABS); this hub holds
 * everything else so no screen is unreachable.
 */
const ROLE_MORE: Record<Role, MoreLink[]> = {
  owner: [
    { to: '/payments', labelKey: 'nav.payments', icon: '₹' },
    { to: '/permits', labelKey: 'nav.permits', icon: '📋' },
    { to: '/reconcile', labelKey: 'nav.reconcile', icon: '🧾' },
    { to: '/groups', labelKey: 'nav.groups', icon: '💬' },
  ],
  pm: [
    { to: '/approvals', labelKey: 'nav.approvals', icon: '✓' },
    { to: '/payments', labelKey: 'nav.payments', icon: '₹' },
    { to: '/permits', labelKey: 'nav.permits', icon: '📋' },
    { to: '/reconcile', labelKey: 'nav.reconcile', icon: '🧾' },
    { to: '/groups', labelKey: 'nav.groups', icon: '💬' },
  ],
  architect: [{ to: '/sites', labelKey: 'nav.sites', icon: '🏗' }],
  supervisor: [
    { to: '/permits', labelKey: 'nav.permits', icon: '📋' },
  ],
  accountant: [
    { to: '/payments', labelKey: 'nav.payments', icon: '₹' },
    { to: '/permits', labelKey: 'nav.permits', icon: '📋' },
  ],
  procurement: [
    { to: '/payments', labelKey: 'nav.payments', icon: '₹' },
    { to: '/search', labelKey: 'nav.search', icon: '🔍' },
  ],
  labor_contractor: [],
}

/**
 * "More" hub — the overflow menu every role's tab bar links to. Lists the
 * secondary work destinations for the role plus the account section (Settings,
 * Sign out). Site-themed, ≥48px rows, i18n labels.
 */
export function More() {
  const t = useT()
  const navigate = useNavigate()
  const role: Role = useMeRole() ?? 'owner'
  const tabs = useRoleTabs(role as ShellRole)
  const workLinks = ROLE_MORE[role] ?? []

  function signOut() {
    clearToken()
    navigate('/login', { replace: true })
  }

  return (
    <AppShell role={role as ShellRole} tabs={tabs} roleBadge={undefined}>
      <header className="mb-5">
        <Display as="h1" className="!text-h1">
          {t('more.title')}
        </Display>
        <Small className="mt-1 block">{t('more.subtitle')}</Small>
      </header>

      {workLinks.length > 0 && (
        <section className="mb-6" aria-labelledby="more-work">
          <H2 id="more-work" className="mb-2">
            {t('more.section.work')}
          </H2>
          <ul className="overflow-hidden rounded-card border border-line bg-card shadow-card">
            {workLinks.map((link) => (
              <li key={link.to} className="border-b border-line last:border-b-0">
                <MoreRow to={link.to} icon={link.icon} label={t(link.labelKey)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="more-account">
        <H2 id="more-account" className="mb-2">
          {t('more.section.account')}
        </H2>
        <ul className="overflow-hidden rounded-card border border-line bg-card shadow-card">
          <li className="border-b border-line">
            <MoreRow to="/settings" icon="⚙️" label={t('nav.settings')} />
          </li>
          <li>
            <button
              type="button"
              onClick={signOut}
              className="flex min-h-tap w-full items-center gap-3 px-4 py-3 text-left font-body text-body font-semibold text-risk cstk-animate hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span aria-hidden className="text-xl leading-none">⎋</span>
              <span>{t('settings.signout')}</span>
            </button>
          </li>
        </ul>
      </section>
    </AppShell>
  )
}

function MoreRow({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-tap items-center gap-3 px-4 py-3 font-body text-body font-semibold text-text cstk-animate hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span aria-hidden className="text-xl leading-none">{icon}</span>
      <span className="flex-1">{label}</span>
      <span aria-hidden className="text-text-mute">›</span>
    </Link>
  )
}
