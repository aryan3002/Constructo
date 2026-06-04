// The reconcile cockpit queue (W2.1) — the virtualized master list. Built on the
// W0 DataGrid (TanStack Table + Virtual): sticky header, density switch, frozen
// identity, mono right-aligned amounts, 60fps over hundreds of rows. The keyboard
// cursor (useCockpitKeys) drives `selectedKey`; clicking a row selects it too.
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataGrid } from '../../components/DataGrid/DataGrid'
import type { ReconcileItem } from '../../api/reconcile'
import { RECONCILE_STATUS, formatInr, statusKey } from '../../pages/reconcile/helpers'
import { StatusDot, type Status } from '../../ui'
import { useT } from '../../i18n'

export function Queue({
  items,
  selectedKey,
  onSelect,
}: {
  items: ReconcileItem[]
  selectedKey: string | null
  onSelect: (key: string) => void
}) {
  const t = useT()
  const columns = useMemo<ColumnDef<ReconcileItem, unknown>[]>(
    () => [
      {
        id: 'status',
        header: t('reconcile.col.status'),
        size: 132,
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5">
            <StatusDot status={RECONCILE_STATUS[row.original.status] as Status} />
            <span className="truncate">{t(statusKey(row.original.status))}</span>
          </span>
        ),
      },
      {
        id: 'vendor',
        header: t('reconcile.field.vendor'),
        cell: ({ row }) => row.original.vendor ?? '—',
      },
      {
        id: 'item',
        header: t('reconcile.field.item'),
        cell: ({ row }) => row.original.item ?? '—',
      },
      {
        id: 'amount',
        header: t('reconcile.amount_at_risk'),
        size: 120,
        meta: { numeric: true },
        cell: ({ row }) =>
          row.original.amount_at_risk > 0 ? formatInr(row.original.amount_at_risk) : '—',
      },
    ],
    [t],
  )

  return (
    <DataGrid
      data={items}
      columns={columns}
      getRowId={(r) => r.key}
      onRowClick={(r) => onSelect(r.key)}
      selectedRowId={selectedKey ?? undefined}
      ariaLabel={t('reconcile.title')}
      emptyLabel={t('reconcile.empty_title')}
    />
  )
}
