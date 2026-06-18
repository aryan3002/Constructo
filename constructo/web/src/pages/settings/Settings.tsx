import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { clearToken } from '../../api/auth'
import { ApiError } from '../../api/client'
import { useT, type TranslationKey } from '../../i18n'
import { Body, Button, Display, H2, Small, ThemeProvider } from '../../ui'
import { useThemeMode, type ThemeMode } from '../../ui/ThemeModeProvider'
import { useMe } from '../auth/useMe'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Toggle } from './Toggle'
import { useHighContrast, useNotifPrefs } from './useDisplayPrefs'

const ROLE_KEY: Record<string, TranslationKey> = {
  owner: 'invite.role.owner',
  pm: 'invite.role.pm',
  architect: 'invite.role.architect',
  supervisor: 'invite.role.supervisor',
  accountant: 'invite.role.accountant',
  procurement: 'invite.role.procurement',
  labor_contractor: 'invite.role.labor_contractor',
  contractor: 'invite.role.labor_contractor',
  client: 'invite.role.client',
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-sheet border border-line bg-card p-5 shadow-card">
      <H2 as="h2">{title}</H2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/**
 * Settings / profile. Profile (name, read-only phone+role), a real LANGUAGE
 * switcher (en/hi, persisted via i18n -> localStorage + user.language), the
 * sunlight/high-contrast toggle, notification prefs (stub, saved locally), and
 * a Team -> invite shortcut. Owner-on-brand "site" theme.
 */
export function Settings() {
  const t = useT()
  const navigate = useNavigate()
  const { me, loading } = useMe()
  const [name, setName] = useState('')
  const [savedName, setSavedName] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [highContrast, setHighContrast] = useHighContrast()
  const [notifs, setNotifs] = useNotifPrefs()
  const { mode, setMode } = useThemeMode()

  useEffect(() => {
    if (me?.name) setName(me.name)
  }, [me])

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    setNameError(null)
    setSavingName(true)
    try {
      await authApi.updateProfile({ name: name.trim() })
      setSavedName(true)
      setTimeout(() => setSavedName(false), 1500)
    } catch (err) {
      setNameError(err instanceof ApiError ? err.message : t('common.error'))
    } finally {
      setSavingName(false)
    }
  }

  function signOut() {
    clearToken()
    navigate('/login', { replace: true })
  }

  const fieldClass =
    'mt-1 w-full min-h-tap rounded-control border border-line bg-paper-2 px-3 ' +
    'font-body text-body text-text focus:border-primary focus:outline-none ' +
    'focus:ring-2 focus:ring-primary/40'

  const canInvite = me?.role === 'owner' || me?.role === 'pm'

  return (
    <ThemeProvider defaultTheme="site">
      <div className="mx-auto w-full max-w-lg space-y-5 px-4 py-8">
        <header>
          <Display as="h1" className="!text-h1">
            {t('settings.title')}
          </Display>
        </header>

        {loading ? (
          <Body className="text-text-mute">{t('common.loading')}</Body>
        ) : (
          <>
            <Section title={t('settings.profile.title')}>
              <form onSubmit={saveName} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="settings-name"
                    className="block font-body text-small font-semibold text-text"
                  >
                    {t('settings.profile.name')}
                  </label>
                  <input
                    id="settings-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <dl className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="font-body text-micro text-text-mute">
                      {t('settings.profile.phone')}
                    </dt>
                    <dd className="cstk-mono text-body text-text">{me?.phone}</dd>
                  </div>
                  <div>
                    <dt className="font-body text-micro text-text-mute">
                      {t('settings.profile.role')}
                    </dt>
                    <dd className="font-body text-body text-text">
                      {me ? (ROLE_KEY[me.role] ? t(ROLE_KEY[me.role]) : me.role) : ''}
                    </dd>
                  </div>
                </dl>
                {nameError && (
                  <p role="alert" className="font-body text-small font-medium text-risk">
                    {nameError}
                  </p>
                )}
                <Button type="submit" variant="primary" disabled={savingName}>
                  {savedName ? t('settings.profile.saved') : t('action.save')}
                </Button>
              </form>
            </Section>

            {me?.role === 'owner' ? (
              <Section title={t('settings.admin.title')}>
                <Body className="!text-text-mute">{t('settings.admin.hint')}</Body>
                <Link
                  to="/settings/admin"
                  className="mt-3 inline-flex min-h-tap items-center gap-1.5 rounded-pill border border-primary/50 bg-card px-4 font-body text-small font-semibold text-primary-deep cstk-animate transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {t('settings.admin.open')} <span aria-hidden>→</span>
                </Link>
              </Section>
            ) : null}

            <Section title={t('settings.language.title')}>
              <Small>{t('settings.language.subtitle')}</Small>
              <div className="mt-3">
                <LanguageSwitcher />
              </div>
            </Section>

            <Section title={t('settings.appearance.title')}>
              <Small>{t('settings.appearance.subtitle')}</Small>
              <div
                className="mt-3 inline-flex rounded-control border border-line p-1"
                role="group"
                aria-label={t('settings.appearance.theme')}
              >
                {(
                  [
                    ['light', t('settings.appearance.light')],
                    ['dark', t('settings.appearance.dark')],
                    ['system', t('settings.appearance.system')],
                  ] as [ThemeMode, string][]
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className={`min-h-tap rounded-[6px] px-4 font-body text-small font-semibold capitalize transition-colors duration-160 ${
                      mode === m
                        ? 'bg-primary text-on-primary'
                        : 'text-text-mute hover:text-text'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Section>

            <Section title={t('settings.display.title')}>
              <Toggle
                checked={highContrast}
                onChange={setHighContrast}
                label={t('settings.display.contrast')}
                hint={t('settings.display.contrast.hint')}
              />
            </Section>

            <Section title={t('settings.notifications.title')}>
              <div className="divide-y divide-line">
                <Toggle
                  checked={notifs.dailyBrief}
                  onChange={(v) => setNotifs({ ...notifs, dailyBrief: v })}
                  label={t('settings.notifications.daily_brief')}
                />
                <Toggle
                  checked={notifs.riskAlerts}
                  onChange={(v) => setNotifs({ ...notifs, riskAlerts: v })}
                  label={t('settings.notifications.risk_alerts')}
                />
                <Toggle
                  checked={notifs.mentions}
                  onChange={(v) => setNotifs({ ...notifs, mentions: v })}
                  label={t('settings.notifications.mentions')}
                />
              </div>
              <Small className="mt-3 block">{t('settings.notifications.hint')}</Small>
            </Section>

            {canInvite && (
              <Section title={t('settings.team.title')}>
                <Link to="/invite">
                  <Button variant="secondary" block>
                    {t('settings.team.invite')}
                  </Button>
                </Link>
              </Section>
            )}

            <Button variant="ghost" block onClick={signOut}>
              {t('settings.signout')}
            </Button>
          </>
        )}
      </div>
    </ThemeProvider>
  )
}
