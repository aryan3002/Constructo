/**
 * TabBar — WAI-ARIA compliant tablist primitive.
 *
 * Features:
 *   - role="tablist" with aria-label
 *   - role="tab" buttons with aria-selected, aria-controls, tabIndex (roving)
 *   - Arrow-key navigation: Left/Right move + activate, Home/End jump to ends
 *   - Blueprint tokens: active tab gets underline indicator + primary colour;
 *     inactive tabs use text-text-mute
 *   - 48px minimum tap target
 *   - Focus ring (focus-visible:ring-2 focus-visible:ring-primary)
 */

import { useRef, type KeyboardEvent } from 'react'

export interface TabItem {
  id: string
  label: string
}

export interface TabBarProps {
  tabs: TabItem[]
  active: string
  onChange: (id: string) => void
  /** Accessible label for the tablist element. */
  ariaLabel: string
  /** Optional class name to add to the container. */
  className?: string
}

/**
 * Reusable accessible TabBar.  Tab-panel association is handled by the caller:
 * each panel must have `id="panel-{tab.id}"`, `role="tabpanel"`,
 * `aria-labelledby="tab-{tab.id}"`, and `tabIndex={0}`.
 *
 * The "tab-{id}" / "panel-{id}" id naming is a convention callers must follow.
 */
export function TabBar({ tabs, active, onChange, ariaLabel, className }: TabBarProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    const last = tabs.length - 1

    let target: number | null = null
    if (e.key === 'ArrowRight') target = idx === last ? 0 : idx + 1
    else if (e.key === 'ArrowLeft') target = idx === 0 ? last : idx - 1
    else if (e.key === 'Home') target = 0
    else if (e.key === 'End') target = last

    if (target !== null) {
      e.preventDefault()
      tabRefs.current[target]?.focus()
      onChange(tabs[target].id)
    }
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={[
        'flex gap-0 border-b border-line',
        className ?? '',
      ].join(' ').trim()}
    >
      {tabs.map((tab, idx) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            ref={(el) => { tabRefs.current[idx] = el }}
            type="button"
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={[
              // 48px minimum tap target, no explicit height needed due to py-3
              'relative inline-flex min-h-tap items-center px-4 py-3',
              'font-body text-small font-semibold select-none',
              'cstk-animate transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
              isActive
                ? 'text-primary-deep after:absolute after:bottom-0 after:inset-x-0 after:h-0.5 after:bg-primary after:rounded-full'
                : 'text-text-mute hover:text-text',
            ].join(' ')}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
