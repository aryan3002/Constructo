// The Approve / Hold / Assign chips shared by the owner's Home ("Needs you")
// and the PM's Today. Money chips (Approve, Hold) are the owner's alone and go
// through a confirm and a 5-second undo (T8, as in the app); a PM sees the
// owner-only note in their place. Assign asks who, then records it.
import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '../../api/auth'
import { ApiError } from '../../api/client'
import { qk } from '../../api/queryKeys'
import { useT, type TranslationKey } from '../../i18n'
import { Button, Modal, Small } from '../../ui'
import { CheckIcon, PauseIcon, UserPlusIcon } from '../../ui/icons'
import { Spinner } from '../../components/states'
import {
  isMoneyAction,
  targetId,
  useDecide,
  type DecideTarget,
  type DecisionAction,
} from './useDecide'
import { schedulePending, undoPending, usePendingActions } from './pendingDecisions'

export interface ChipOutcome {
  status: 'ok' | 'risk'
  message: string
}

interface Asking {
  target: DecideTarget
  action: DecisionAction
  siteName: string
}

/**
 * `useChipActions(date, report)` → `{ act, dialogs }`. `act()` opens the
 * confirm (money) or the assignee picker (assign); `dialogs` must be rendered
 * by the caller. `report` receives the plain outcome for the page's status line.
 */
export function useChipActions(date: string, report: (o: ChipOutcome) => void) {
  const t = useT()
  const { decide } = useDecide(date)
  const [asking, setAsking] = useState<Asking | null>(null)

  function failed(err: unknown) {
    const ownerOnly = err instanceof ApiError && err.code === 'owner_only'
    report({
      status: 'risk',
      message: t(ownerOnly ? 'approvals.owner_only' : 'owner.home.action_failed'),
    })
  }

  function act(target: DecideTarget, action: DecisionAction, siteName: string) {
    setAsking({ target, action, siteName })
  }

  function confirmMoney() {
    if (!asking) return
    const { target, action } = asking
    setAsking(null)
    const title = titleText(target)
    schedulePending({
      ids: [targetId(target)],
      message: t(action === 'approve' ? 'owner.chip.pending_approved' : 'owner.chip.pending_held', {
        title,
      }),
      send: () => decide({ target, action }),
      onError: failed,
    })
  }

  function assignTo(person: { id: string; name: string }) {
    if (!asking) return
    const { target } = asking
    setAsking(null)
    decide({ target, action: 'assign', assignee: person }).then(
      () => report({ status: 'ok', message: t('owner.chip.done_assigned', { name: person.name }) }),
      failed,
    )
  }

  const dialogs = (
    <>
      {asking && isMoneyAction(asking.action) ? (
        <MoneyConfirm
          action={asking.action}
          title={titleText(asking.target)}
          siteName={asking.siteName}
          onCancel={() => setAsking(null)}
          onConfirm={confirmMoney}
        />
      ) : null}
      {asking && asking.action === 'assign' ? (
        <AssignPicker onCancel={() => setAsking(null)} onPick={assignTo} />
      ) : null}
    </>
  )

  return { act, dialogs }
}

export function titleText(target: DecideTarget): string {
  return target.type === 'risk' ? target.title : target.decision.title
}

function MoneyConfirm({
  action,
  title,
  siteName,
  onCancel,
  onConfirm,
}: {
  action: DecisionAction
  title: string
  siteName: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const t = useT()
  const approve = action === 'approve'
  return (
    <Modal
      open
      onClose={onCancel}
      title={t(approve ? 'owner.chip.confirm_approve_title' : 'owner.chip.confirm_hold_title')}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={onCancel}>
            {t('action.cancel')}
          </Button>
          <Button variant="primary" type="button" onClick={onConfirm}>
            {t(approve ? 'action.approve' : 'action.hold')}
          </Button>
        </div>
      }
    >
      <p className="font-body text-body font-semibold text-text">{title}</p>
      {siteName ? (
        <Small className="mt-1">{t('owner.chip.site', { site: siteName })}</Small>
      ) : null}
      <p className="mt-3 font-body text-small text-text">
        {t(approve ? 'owner.chip.approve_consequence' : 'owner.chip.hold_consequence')}
      </p>
      <Small className="mt-2">{t('owner.chip.undo_note')}</Small>
    </Modal>
  )
}

/** Who an Assign goes to: the company's active teammates. */
function AssignPicker({
  onCancel,
  onPick,
}: {
  onCancel: () => void
  onPick: (p: { id: string; name: string }) => void
}) {
  const t = useT()
  const team = useQuery({ queryKey: qk.team(), queryFn: () => authApi.listTeam() })
  const people = (team.data ?? []).filter((m) => m.is_active)
  return (
    <Modal open onClose={onCancel} title={t('owner.assign.title')}>
      <Small>{t('owner.assign.hint')}</Small>
      {team.isLoading ? (
        <Spinner label={t('owner.assign.loading')} />
      ) : team.isError ? (
        <p role="alert" className="mt-3 font-body text-small text-risk">
          {t('owner.assign.error')}
        </p>
      ) : people.length === 0 ? (
        <p className="mt-3 font-body text-small text-text-mute">{t('owner.assign.empty')}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {people.map((m) => {
            const name = m.name?.trim() || m.phone
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onPick({ id: m.id, name })}
                  className="flex min-h-tap w-full items-center justify-between gap-3 rounded-control border border-line bg-card px-3 text-left font-body text-small font-semibold text-text cstk-animate transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="truncate">{name}</span>
                  <span className="shrink-0 font-normal text-text-mute">
                    {t(`invite.role.${m.role}` as TranslationKey)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}

/** The actions waiting in their undo window, each with an Undo button. */
export function PendingUndoBar() {
  const t = useT()
  const actions = usePendingActions()
  if (actions.length === 0) return null
  return (
    <ul role="status" aria-live="polite" className="flex flex-col gap-2">
      {actions.map((a) => (
        <li
          key={a.key}
          className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface-sunken px-3 py-2"
        >
          <span className="min-w-0 truncate font-body text-small font-semibold text-text">
            {a.message}
          </span>
          <button
            type="button"
            onClick={() => undoPending(a.key)}
            className="min-h-tap shrink-0 rounded-control px-3 font-body text-small font-semibold text-primary-deep underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('owner.chip.undo')}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Which chips a row offers, decided by the caller from role and kind. */
export interface ChipSet {
  approve?: boolean
  hold?: boolean
  assign?: boolean
  /** Money the viewer may not decide: show the owner-only note instead. */
  ownerOnly?: boolean
}

export function ChipRow({
  chips,
  onAct,
}: {
  chips: ChipSet
  onAct: (action: DecisionAction) => void
}) {
  const t = useT()
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {chips.ownerOnly ? (
        <Small className="mr-auto !text-text-mute">{t('approvals.owner_only')}</Small>
      ) : null}
      {chips.approve ? (
        <Chip
          onClick={() => onAct('approve')}
          label={t('owner.needs.approve_money')}
          cls="border-ok/40 text-ok-fg hover:bg-ok/10 active:bg-ok/15"
          icon={<CheckIcon />}
        />
      ) : null}
      {chips.hold ? (
        <Chip
          onClick={() => onAct('hold')}
          label={t('action.hold')}
          cls="border-warn/40 text-warn-fg hover:bg-warn/10 active:bg-warn/15"
          icon={<PauseIcon />}
        />
      ) : null}
      {chips.assign ? (
        <Chip
          onClick={() => onAct('assign')}
          label={t('action.assign')}
          cls="border-info/40 text-info-fg hover:bg-info/10 active:bg-info/15"
          icon={<UserPlusIcon />}
        />
      ) : null}
    </div>
  )
}

function Chip({
  onClick,
  label,
  cls,
  icon,
}: {
  onClick: () => void
  label: string
  cls: string
  icon: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-tap items-center gap-1.5 rounded-pill border bg-card px-3 font-body text-small font-semibold cstk-animate transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-card ${cls}`}
    >
      <span className="text-[1.05em] leading-none" aria-hidden>
        {icon}
      </span>
      {label}
    </button>
  )
}
