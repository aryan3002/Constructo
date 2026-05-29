import { useId, useState, type ReactNode } from 'react'
import { ChevronDownIcon, DocIcon, MessageIcon, MicIcon, PhotoIcon } from './icons'
import { StatusDot, type Status } from './StatusPill'
import { Body, Mono, Small } from './Typography'

export type EvidenceKind = 'photo' | 'challan' | 'voice' | 'message'

export interface EvidenceItem {
  kind: EvidenceKind
  /** Short label, e.g. "Site photo", "Delivery challan #4471". */
  label: string
  /** Optional detail line (transcript snippet, sender, amount...). */
  detail?: ReactNode
  /** Optional image src for photo evidence. */
  thumbnailUrl?: string
  /** Optional mono meta shown on the right (time, amount). */
  meta?: string
}

export interface EvidenceCardProps {
  /** The claim being asserted, e.g. "Slab pour completed on B2". */
  claim: ReactNode
  status: Status
  /** Plain-language supporting line shown under the claim. */
  detail?: ReactNode
  evidence: EvidenceItem[]
  /** Start expanded (e.g. for the gallery / deep-linked proof). */
  defaultOpen?: boolean
  /** Optional trailing node in the header (e.g. action chips). */
  trailing?: ReactNode
  className?: string
}

const KIND_META: Record<EvidenceKind, { Icon: (p: { title?: string }) => ReactNode; label: string }> = {
  photo: { Icon: PhotoIcon, label: 'Photo' },
  challan: { Icon: DocIcon, label: 'Challan' },
  voice: { Icon: MicIcon, label: 'Voice note' },
  message: { Icon: MessageIcon, label: 'Message' },
}

function EvidenceRow({ item }: { item: EvidenceItem }) {
  const meta = KIND_META[item.kind]
  return (
    <li className="flex items-start gap-3 rounded-control border border-line bg-paper px-3 py-2">
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-md object-cover"
        />
      ) : (
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-card text-[1.1rem] text-text-mute"
          aria-hidden
        >
          <meta.Icon title={meta.label} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <Body className="truncate font-semibold !text-text" as="span">
          {item.label}
        </Body>
        {item.detail ? (
          <Small className="mt-0.5 line-clamp-2">{item.detail}</Small>
        ) : null}
      </div>
      {item.meta ? (
        <Mono className="shrink-0 text-micro text-text-mute">{item.meta}</Mono>
      ) : null}
    </li>
  )
}

/**
 * EvidenceCard — the soul of Constructo. A claim header with a status dot and a
 * "Show proof" control that expands IN PLACE (~160ms) to reveal the supporting
 * evidence (photo / challan / voice / message). The product's promise is that
 * every claim is one tap from its proof.
 */
export function EvidenceCard({
  claim,
  status,
  detail,
  evidence,
  defaultOpen = false,
  trailing,
  className,
}: EvidenceCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  const hasEvidence = evidence.length > 0

  return (
    <article
      data-status={status}
      className={`rounded-card border border-line bg-card shadow-card ${className ?? ''}`.trim()}
    >
      <header className="flex items-start gap-3 p-4">
        <StatusDot status={status} className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <Body as="h3" className="font-semibold !text-text">
            {claim}
          </Body>
          {detail ? <Small className="mt-0.5">{detail}</Small> : null}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </header>

      <div className="px-4 pb-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={!hasEvidence}
          aria-expanded={hasEvidence ? open : undefined}
          aria-controls={hasEvidence ? panelId : undefined}
          className="inline-flex min-h-tap items-center gap-1.5 rounded-control font-body text-small font-semibold text-primary-deep cstk-animate transition hover:opacity-80 disabled:text-text-mute disabled:hover:opacity-100"
        >
          {hasEvidence ? (
            <>
              {open ? 'Hide proof' : 'Show proof'}
              <span
                className={`text-[1.1em] leading-none transition-transform duration-160 cstk-animate ${
                  open ? 'rotate-180' : ''
                }`}
                aria-hidden
              >
                <ChevronDownIcon />
              </span>
            </>
          ) : (
            'No proof attached'
          )}
        </button>

        {hasEvidence && open ? (
          <ul
            id={panelId}
            className="mt-2 grid animate-reveal-down gap-2 cstk-animate"
          >
            {evidence.map((item, i) => (
              <EvidenceRow key={`${item.kind}-${i}`} item={item} />
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  )
}
