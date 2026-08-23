import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { useMe } from './useMe'
import { ApiError, api } from '../../api/client'
import { useT, type TranslationKey } from '../../i18n'
import { Body, Button, Display, Small } from '../../ui'
import { MessageIcon } from '../../ui/icons'
import { AuthLayout } from './AuthLayout'
import { SelectField, TextField } from './fields'
import { InviteTeam } from './InviteTeam'
import { markOnboarded } from './Login'

const SITE_TYPES = [
  'residential',
  'commercial',
  'villa',
  'interior',
  'infra',
] as const

const STEPS = ['company', 'site', 'team', 'whatsapp'] as const
type Step = (typeof STEPS)[number]

/**
 * Owner first-run, one screen-flow: name company -> add first site (name + type
 * ONLY, we learn the rest) -> connect the site's WhatsApp group. Each step is a
 * single decisive amber action; "skip" keeps friction low. Reaches a useful
 * state (a real site) before the dashboard.
 */
export function OwnerFirstRun() {
  const navigate = useNavigate()
  const t = useT()
  const { me } = useMe()
  const [step, setStep] = useState<Step>('company')
  const [company, setCompany] = useState('')
  const [siteName, setSiteName] = useState('')
  const [siteType, setSiteType] = useState<string>('residential')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // If this owner already has a site (returning on a new device, or the demo
  // seed), they're not actually new — skip first-run and go to their app rather
  // than prompting them to re-name a company they already have.
  useEffect(() => {
    if (!me || me.role !== 'owner') return
    let cancelled = false
    void (async () => {
      try {
        const sites = await api.listSites()
        if (!cancelled && sites.items.length > 0) {
          markOnboarded(me.id)
          navigate('/', { replace: true })
        }
      } catch {
        /* keep first-run if we can't check */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [me, navigate])

  const stepIndex = STEPS.indexOf(step)

  function finish() {
    if (me) markOnboarded(me.id)
    navigate('/', { replace: true })
  }

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (company.trim()) await authApi.renameCompany(company.trim())
      setStep('site')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  async function saveSite(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await authApi.createSite({ name: siteName.trim(), type: siteType })
      setStep('team')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout steps="firstrun" title={t('auth.onboard.welcome')}>
      <Small>
        {t('auth.onboard.step', { current: stepIndex + 1, total: STEPS.length })}
      </Small>

      {step === 'company' && (
        <form onSubmit={saveCompany} className="mt-4 space-y-4" noValidate>
          <div>
            <Display as="h1" className="!text-h1">
              {t('auth.onboard.company.title')}
            </Display>
            <Small className="mt-1">{t('auth.onboard.company.subtitle')}</Small>
          </div>
          <TextField
            label={t('auth.onboard.company.label')}
            required
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder={t('auth.onboard.company.placeholder')}
          />
          {error && (
            <p role="alert" className="font-body text-small font-medium text-risk">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" block disabled={busy}>
            {t('auth.onboard.continue')}
          </Button>
        </form>
      )}

      {step === 'site' && (
        <form onSubmit={saveSite} className="mt-4 space-y-4" noValidate>
          <div>
            <Display as="h1" className="!text-h1">
              {t('auth.onboard.site.title')}
            </Display>
            <Small className="mt-1">{t('auth.onboard.site.subtitle')}</Small>
          </div>
          <TextField
            label={t('auth.onboard.site.name_label')}
            required
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder={t('auth.onboard.site.name_placeholder')}
          />
          <SelectField
            label={t('auth.onboard.site.type_label')}
            value={siteType}
            onChange={(e) => setSiteType(e.target.value)}
          >
            {SITE_TYPES.map((tp) => (
              <option key={tp} value={tp}>
                {t(`auth.onboard.site.type.${tp}` as TranslationKey)}
              </option>
            ))}
          </SelectField>
          {error && (
            <p role="alert" className="font-body text-small font-medium text-risk">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" block disabled={busy}>
            {t('auth.onboard.continue')}
          </Button>
        </form>
      )}

      {step === 'team' && (
        <div className="mt-4 space-y-4">
          <div>
            <Display as="h1" className="!text-h1">
              {t('auth.onboard.team.title')}
            </Display>
            <Small className="mt-1">{t('auth.onboard.team.subtitle')}</Small>
          </div>
          <InviteTeam companyName={company || undefined} />
          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => setStep('whatsapp')}
          >
            {t('auth.onboard.continue')}
          </Button>
          <Button variant="ghost" block onClick={() => setStep('whatsapp')}>
            {t('auth.onboard.skip')}
          </Button>
        </div>
      )}

      {step === 'whatsapp' && (
        <div className="mt-4 space-y-4">
          <div className="flex items-start gap-3">
            <span className="mt-1 text-2xl text-ok" aria-hidden>
              <MessageIcon />
            </span>
            <div>
              <Display as="h1" className="!text-h1">
                {t('auth.onboard.whatsapp.title')}
              </Display>
              <Body className="mt-1 text-text-mute">
                {t('auth.onboard.whatsapp.subtitle')}
              </Body>
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            block
            leadingIcon={<MessageIcon />}
            onClick={finish}
          >
            {t('auth.onboard.whatsapp.connect')}
          </Button>
          <Button variant="ghost" block onClick={finish}>
            {t('auth.onboard.skip')}
          </Button>
        </div>
      )}
    </AuthLayout>
  )
}
