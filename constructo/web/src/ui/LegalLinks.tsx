// Privacy policy + terms links (S7). Hidden when the deploy hasn't configured
// the URLs (see `legalUrls`), never a link to nowhere.
import { legalUrls } from '../api/config'
import { useT } from '../i18n'

export function LegalLinks({ className = '' }: { className?: string }) {
  const t = useT()
  const { privacy, terms } = legalUrls()
  if (!privacy && !terms) return null
  const link =
    'font-body text-small font-semibold text-text-mute underline underline-offset-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-[4px]'
  return (
    <nav aria-label={t('legal.nav')} className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`}>
      {privacy ? (
        <a href={privacy} target="_blank" rel="noopener noreferrer" className={link}>
          {t('legal.privacy')}
        </a>
      ) : null}
      {terms ? (
        <a href={terms} target="_blank" rel="noopener noreferrer" className={link}>
          {t('legal.terms')}
        </a>
      ) : null}
    </nav>
  )
}
