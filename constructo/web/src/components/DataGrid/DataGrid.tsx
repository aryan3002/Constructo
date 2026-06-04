import { useEffect, useRef } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useUiStore, type GridDensity } from '../../store/ui'

// Typed column option: `meta: { numeric: true }` → right-aligned mono tabular cell.
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    numeric?: boolean
  }
}

const DENSITY_PX: Record<GridDensity, number> = {
  compact: 40,
  default: 48,
  comfortable: 56,
}

export interface DataGridProps<T> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  getRowId?: (row: T, index: number) => string
  onRowClick?: (row: T) => void
  /** Highlight + scroll-into-view this row id (keyboard-cockpit selection). */
  selectedRowId?: string
  /** Override the store density (compact 40 / default 48 / comfortable 56 px). */
  density?: GridDensity
  emptyLabel?: string
  ariaLabel?: string
}

/**
 * DataGrid — virtualized, density-aware table primitive (vault 11/01 §5, 11/04
 * §8.1). Sticky header, right-aligned mono tabular numerics (columns flagged
 * `meta.numeric`), 60fps over thousands of rows. The W2 reconciliation cockpit
 * and other dense surfaces consume this; this is the reusable primitive.
 */
export function DataGrid<T>({
  data,
  columns,
  getRowId,
  onRowClick,
  selectedRowId,
  density,
  emptyLabel = 'Nothing here.',
  ariaLabel = 'Data grid',
}: DataGridProps<T>) {
  const storeDensity = useUiStore((s) => s.gridDensity)
  const rowH = DENSITY_PX[density ?? storeDensity]
  const scrollRef = useRef<HTMLDivElement>(null)

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
  })
  const rows = table.getRowModel().rows

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 12,
  })

  // Keep the keyboard-selected row in view as the cursor scans the queue.
  const selectedIndex = selectedRowId
    ? rows.findIndex((r) => r.id === selectedRowId)
    : -1
  useEffect(() => {
    if (selectedIndex >= 0) virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex])

  if (data.length === 0) {
    return (
      <div
        role="status"
        className="rounded-card border border-line bg-card px-4 py-10 text-center font-body text-small text-text-mute"
      >
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
      {/* Header */}
      <div role="rowgroup" className="sticky top-0 z-10 border-b border-divider bg-surface-sunken">
        {table.getHeaderGroups().map((hg) => (
          <div key={hg.id} role="row" className="flex">
            {hg.headers.map((header) => {
              const numeric = header.column.columnDef.meta?.numeric
              const size = header.column.columnDef.size
              return (
                <div
                  key={header.id}
                  role="columnheader"
                  className={`min-w-0 flex-1 truncate px-3 py-2 font-body text-micro font-semibold uppercase tracking-wide text-text-secondary ${
                    numeric ? 'text-right' : 'text-left'
                  }`}
                  style={size ? { flex: `0 0 ${size}px` } : undefined}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Virtualized body */}
      <div ref={scrollRef} className="max-h-[60vh] overflow-auto" aria-label={ariaLabel}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index]
            const selected = selectedRowId != null && row.id === selectedRowId
            return (
              <div
                key={row.id}
                role="row"
                aria-selected={selected || undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={`absolute inset-x-0 flex items-center border-b border-divider font-body text-small text-text ${
                  onRowClick ? 'cursor-pointer hover:bg-surface-hover' : ''
                } ${selected ? 'bg-surface-selected ring-1 ring-inset ring-primary' : ''}`}
                style={{ height: rowH, transform: `translateY(${vi.start}px)` }}
              >
                {row.getVisibleCells().map((cell) => {
                  const numeric = cell.column.columnDef.meta?.numeric
                  const size = cell.column.columnDef.size
                  return (
                    <div
                      key={cell.id}
                      role="cell"
                      className={`min-w-0 flex-1 truncate px-3 ${
                        numeric ? 'cstk-mono text-right tabular-nums' : 'text-left'
                      }`}
                      style={size ? { flex: `0 0 ${size}px` } : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
