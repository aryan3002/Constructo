// Signed-out frame (spec §7): brand panel + form card + the "What's what"
// guide. The brand panel is the ONE place with fixed ink/amber colours — the
// card and everything inside it use the `site` theme tokens.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLanguage, useT, type Language, type TranslationKey } from '../../i18n'
import { Modal, ThemeProvider } from '../../ui'
import { guideSectionDomId, guideSections, type GuideSectionId } from './guide.content'

const INK = '#15171c'
const AMBER = '#f2a100'
const PAPER = '#f4f0e7'

// --- Guide context: any child (e.g. an AuthError "What's what" action) can open the guide at a section.
interface AuthGuideContextValue {
  openGuide: (section?: GuideSectionId) => void
}
const AuthGuideContext = createContext<AuthGuideContextValue>({ openGuide: () => {} })
export function useAuthGuide(): AuthGuideContextValue {
  return useContext(AuthGuideContext)
}

const SIGNIN_STEPS: TranslationKey[] = ['auth.how.step1', 'auth.how.step2', 'auth.how.step3']
const FIRSTRUN_STEPS: TranslationKey[] = [
  'auth.firstrun.step1',
  'auth.firstrun.step2',
  'auth.firstrun.step3',
  'auth.firstrun.step4',
]

/** Neev = foundation: three courses, widening downward. */
function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      style={{ color: AMBER }}
    >
      <rect x="11" y="4" width="10" height="6" rx="1.5" fill="currentColor" />
      <rect x="6" y="13" width="20" height="6" rx="1.5" fill="currentColor" />
      <rect x="1" y="22" width="30" height="6" rx="1.5" fill="currentColor" />
    </svg>
  )
}

function StepList({
  keys,
  tone,
}: {
  keys: TranslationKey[]
  /** `ink` = on the dark brand panel; `paper` = inside the light <details>. */
  tone: 'ink' | 'paper'
}) {
  const t = useT()
  const badge =
    tone === 'ink'
      ? 'bg-[#f2a100] text-[#15171c]'
      : 'bg-primary text-on-primary'
  const text = tone === 'ink' ? 'text-[#f4f0e7]' : 'text-text'
  return (
    <ol className="space-y-3">
      {keys.map((k, i) => (
        <li key={k} className="flex items-center gap-3">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full cstk-mono text-small font-bold ${badge}`}
            aria-hidden
          >
            {i + 1}
          </span>
          <span className={`font-body text-body ${text}`}>{t(k)}</span>
        </li>
      ))}
    </ol>
  )
}

function LangToggle() {
  const t = useT()
  const { lang, setLanguage } = useLanguage()
  const pill = (active: boolean) =>
    'min-h-[40px] min-w-[44px] rounded-[6px] px-2 font-body text-small font-semibold cstk-animate transition ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ' +
    (active ? 'bg-card text-text shadow-card' : 'text-text-mute hover:text-text')
  const opt = (code: Language, label: string, aria: TranslationKey) => (
    <button
      type="button"
      lang={code}
      aria-pressed={lang === code}
      aria-label={t(aria)}
      onClick={() => setLanguage(code)}
      className={pill(lang === code)}
    >
      {label}
    </button>
  )
  return (
    <div
      role="group"
      aria-label={t('auth.lang.label')}
      className="inline-flex min-h-tap items-center gap-0.5 rounded-control bg-paper-2 p-1"
    >
      {opt('en', 'EN', 'auth.lang.switch_en')}
      {opt('hi', 'हिं', 'auth.lang.switch_hi')}
    </div>
  )
}

export function AuthLayout({
  children,
  steps = 'signin',
  title,
}: {
  children: ReactNode
  /** Which list the brand panel shows: how signing in works (3) or the first-run setup (4). */
  steps?: 'signin' | 'firstrun'
  /** Card eyebrow; defaults to the app name. */
  title?: string
}) {
  const t = useT()
  const [guide, setGuide] = useState<{ open: boolean; section?: GuideSectionId }>({
    open: false,
  })
  const openGuide = useCallback((section?: GuideSectionId) => setGuide({ open: true, section }), [])
  const closeGuide = useCallback(() => setGuide({ open: false }), [])
  const ctx = useMemo(() => ({ openGuide }), [openGuide])

  // Jump to the requested section once the dialog has mounted.
  useEffect(() => {
    if (!guide.open || !guide.section) return
    const id = guideSectionDomId(guide.section)
    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView?.({ block: 'start' })
    })
    return () => cancelAnimationFrame(raf)
  }, [guide])

  const stepKeys = steps === 'firstrun' ? FIRSTRUN_STEPS : SIGNIN_STEPS
  const stepsTitle: TranslationKey = steps === 'firstrun' ? 'auth.firstrun.title' : 'auth.how.title'
  const sections = guideSections({ dev: import.meta.env.DEV })

  return (
    <ThemeProvider defaultTheme="site">
      <AuthGuideContext.Provider value={ctx}>
        <div className="min-h-screen bg-paper md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-cols-2">
          {/* Brand panel — ≥ md. Fixed ink/amber by design (the one exception to tokens). */}
          <aside
            className="hidden md:flex md:flex-col md:justify-between md:gap-12 md:px-10 md:py-12 lg:px-16"
            style={{ backgroundColor: INK, color: PAPER }}
          >
            <div>
              <BrandMark size={44} />
              <p className="mt-5 font-display text-display font-bold" style={{ color: PAPER }}>
                {t('app.name')}
              </p>
              <p className="mt-1 font-body text-body" style={{ color: `${PAPER}b3` }}>
                {t('auth.tagline')}
              </p>
            </div>
            <div>
              <p
                className="mb-4 font-body text-micro font-semibold uppercase tracking-widest"
                style={{ color: AMBER }}
              >
                {t(stepsTitle)}
              </p>
              <StepList keys={stepKeys} tone="ink" />
            </div>
            <div className="border-t pt-6" style={{ borderColor: `${PAPER}26` }}>
              <p className="font-body text-body font-semibold" style={{ color: PAPER }}>
                {t('auth.homeowner_q')}
              </p>
              <p className="mt-1 font-body text-small" style={{ color: `${PAPER}b3` }}>
                {t('auth.homeowner_note')}
              </p>
            </div>
          </aside>

          {/* Slim header — < md. */}
          <header
            className="flex items-center gap-3 px-5 py-4 md:hidden"
            style={{ backgroundColor: INK, color: PAPER }}
          >
            <BrandMark size={28} />
            <span className="font-display text-h2 font-bold" style={{ color: PAPER }}>
              {t('app.name')}
            </span>
            <span className="ml-auto font-body text-small" style={{ color: `${PAPER}b3` }}>
              {t('auth.tagline')}
            </span>
          </header>

          <main className="flex flex-col items-center justify-center px-4 py-8 md:px-8 md:py-12">
            <div className="w-full max-w-md">
              <div className="rounded-sheet border border-line bg-card p-6 shadow-card sm:p-8">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-body text-micro font-semibold uppercase tracking-widest text-primary-deep">
                    {title ?? t('app.name')}
                  </span>
                  <div className="flex items-center gap-2">
                    <LangToggle />
                    <button
                      type="button"
                      onClick={() => openGuide()}
                      aria-label={t('auth.guide.title')}
                      aria-haspopup="dialog"
                      className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-control border border-line bg-paper-2 font-display text-h2 font-bold text-text cstk-animate transition hover:border-primary hover:text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      ?
                    </button>
                  </div>
                </div>
                <div className="mt-4">{children}</div>
              </div>

              {/* < md: the brand-panel content folds into a disclosure under the card. */}
              <details className="mt-4 rounded-card border border-line bg-card px-4 md:hidden">
                <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between font-body text-body font-semibold text-text marker:content-none">
                  {t('auth.how.details')}
                  <span aria-hidden className="text-text-mute">
                    ▾
                  </span>
                </summary>
                <div className="space-y-4 pb-4">
                  <p className="font-body text-micro font-semibold uppercase tracking-widest text-primary-deep">
                    {t(stepsTitle)}
                  </p>
                  <StepList keys={stepKeys} tone="paper" />
                  <div className="border-t border-line pt-3">
                    <p className="font-body text-small font-semibold text-text">
                      {t('auth.homeowner_q')}
                    </p>
                    <p className="font-body text-small text-text-mute">{t('auth.homeowner_note')}</p>
                  </div>
                </div>
              </details>
            </div>
          </main>
        </div>

        <Modal open={guide.open} onClose={closeGuide} title={t('auth.guide.title')}>
          <div className="space-y-6">
            {sections.map((s) => {
              const Icon = s.icon
              return (
                <section
                  key={s.id}
                  id={guideSectionDomId(s.id)}
                  aria-labelledby={`${guideSectionDomId(s.id)}-title`}
                  className="scroll-mt-4"
                >
                  <h3
                    id={`${guideSectionDomId(s.id)}-title`}
                    className="flex items-center gap-2 font-display text-h2 font-semibold text-text"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-primary/15 text-primary-deep">
                      <Icon />
                    </span>
                    {t(s.titleKey)}
                  </h3>
                  <ul className="mt-2 space-y-1.5 pl-10">
                    {s.bodyKeys.map((k) => (
                      <li key={k} className="font-body text-small text-text-mute">
                        {t(k)}
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        </Modal>
      </AuthGuideContext.Provider>
    </ThemeProvider>
  )
}
