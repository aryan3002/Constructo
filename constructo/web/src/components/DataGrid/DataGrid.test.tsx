import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataGrid } from './DataGrid'

interface Invoice {
  vendor: string
  amount: number
}

const columns: ColumnDef<Invoice, unknown>[] = [
  { accessorKey: 'vendor', header: 'Vendor' },
  { accessorKey: 'amount', header: 'Amount', meta: { numeric: true } },
]

describe('DataGrid', () => {
  it('renders the empty state with no data', () => {
    render(<DataGrid<Invoice> data={[]} columns={columns} emptyLabel="No invoices." />)
    expect(screen.getByText('No invoices.')).toBeInTheDocument()
  })

  it('renders column headers when data is present', () => {
    render(
      <DataGrid<Invoice>
        data={[{ vendor: 'Sharma Traders', amount: 240000 }]}
        columns={columns}
      />,
    )
    expect(screen.getByRole('columnheader', { name: 'Vendor' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toBeInTheDocument()
  })
})
