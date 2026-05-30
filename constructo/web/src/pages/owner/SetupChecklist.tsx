import { useT } from '../../i18n'
import { Body, H2, Small, StatusPill, Icons } from '../../ui'
import type { SetupStep } from '../../api/dashboard'
import type { TranslationKey } from '../../i18n'

/**
 * SetupChecklist — the cold-start surface. Instead of a blank grid, a new owner
 * sees the concrete steps that make the daily brief start working, with each
 * step marked done/to-do from real backend signal (sites, events, baselines).
 */
export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const t = useT()

  return (
    <section
      aria-labelledby="owner-setup-heading"
      className="rounded-sheet border border-line bg-card p-5 shadow-card"
    >
      <H2 id="owner-setup-heading">{t('owner.setup.title')}</H2>
      <Small className="mt-1 block">{t('owner.setup.hint')}</Small>

      <ol className="mt-4 space-y-2">
        {steps.map((step) => (
          <li
            key={step.key}
            className="flex items-center gap-3 rounded-card border border-line bg-paper px-3 py-3"
          >
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[0.95rem] ${
                step.done ? 'bg-ok/15 text-ok' : 'bg-card text-text-mute'
              }`}
              aria-hidden
            >
              {step.done ? <Icons.CheckIcon /> : '•'}
            </span>
            <Body
              as="span"
              className={`flex-1 font-semibold ${step.done ? '!text-text-mute line-through' : '!text-text'}`}
            >
              {t(step.title_key as TranslationKey)}
            </Body>
            <StatusPill
              status={step.done ? 'ok' : 'info'}
              size="sm"
              label={step.done ? t('owner.setup.done') : t('owner.setup.todo')}
            />
          </li>
        ))}
      </ol>
    </section>
  )
}
