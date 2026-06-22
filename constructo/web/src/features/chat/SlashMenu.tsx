/**
 * SlashMenu — the composer's slash-command palette (web Phase B).
 *
 * Anchored above the composer input row. Purely presentational: the composer
 * owns open/active/query state (the textarea keeps focus), so this component
 * just renders the filtered command list with listbox a11y and reports
 * hover/select. Cribs the keyboard/listbox model of `CommandPalette`.
 *
 * `onMouseDown` preventDefault keeps focus in the textarea so a click never
 * blurs the input; `onClick` performs the selection.
 *
 * Semantic tokens only — neev light + neev-dark inherit.
 */
import type { SlashMenuItem } from './slash'

export interface SlashMenuProps {
  /** Already filtered by the composer (by the typed `/prefix`). */
  items: SlashMenuItem[]
  /** Composer-owned highlighted index. */
  activeIndex: number
  onHoverIndex: (i: number) => void
  onSelect: (item: SlashMenuItem) => void
}

export function SlashMenu({ items, activeIndex, onHoverIndex, onSelect }: SlashMenuProps) {
  if (items.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 z-30 mb-1 w-full max-w-md px-3">
      <div
        role="listbox"
        aria-label="Slash commands"
        className="overflow-hidden rounded-sheet border border-edge bg-surface-card shadow-pop"
      >
        {items.map((item, i) => (
          <button
            key={item.cmd}
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            onMouseEnter={() => onHoverIndex(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(item)}
            className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left font-body text-small ${
              i === activeIndex
                ? 'bg-surface-selected text-text-primary'
                : 'text-text-primary hover:bg-surface-hover'
            }`}
          >
            <span className="truncate">
              <span className="font-semibold">/{item.cmd}</span>
              <span className="ml-2 text-text-muted">{item.label}</span>
            </span>
            <span className="shrink-0 font-mono text-micro text-text-muted">{item.usage}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
