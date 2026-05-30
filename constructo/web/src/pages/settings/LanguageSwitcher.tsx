import { SUPPORTED_LANGUAGES, useLanguage, useT, type Language } from '../../i18n'

/**
 * Language switcher (en / hi). Uses the B0 i18n: setLanguage persists to
 * localStorage AND fire-and-forgets PATCH /api/v1/users/me (now implemented in
 * this feature), so the choice survives a refresh and follows the account.
 * Rendered as a segmented control of >=48px tap targets.
 */
export function LanguageSwitcher() {
  const { lang, setLanguage } = useLanguage()
  const t = useT()

  return (
    <div
      role="radiogroup"
      aria-label={t('language.label')}
      className="inline-flex rounded-control border border-line bg-paper-2 p-1"
    >
      {SUPPORTED_LANGUAGES.map((code: Language) => {
        const active = code === lang
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setLanguage(code)}
            className={`min-h-tap rounded-[6px] px-4 font-body text-body font-semibold cstk-animate transition ${
              active
                ? 'bg-primary text-on-primary shadow-card'
                : 'text-text-mute hover:text-text'
            }`}
          >
            {t(code === 'en' ? 'language.en' : 'language.hi')}
          </button>
        )
      })}
    </div>
  )
}
