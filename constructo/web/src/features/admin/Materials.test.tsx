import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'
import type { Material } from '../../api/types'

const listMaterials = vi.fn()
const createMaterial = vi.fn()
const updateMaterial = vi.fn()
vi.mock('../../api/client', () => ({
  api: {
    listMaterials: (...a: unknown[]) => listMaterials(...a),
    createMaterial: (...a: unknown[]) => createMaterial(...a),
    updateMaterial: (...a: unknown[]) => updateMaterial(...a),
  },
}))

const { Materials } = await import('./Materials')

function material(over: Partial<Material> = {}): Material {
  return {
    id: 'm1', company_id: 'co', name: 'OPC 53 Cement', unit: 'bag', category: 'binder',
    notes: null, is_active: true, created_at: '2026-02-01T00:00:00Z', ...over,
  }
}

function renderMaterials(role = 'owner') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(['me'], { id: 'u1', role })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <Materials />
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

describe('Materials', () => {
  beforeEach(() => {
    listMaterials.mockReset()
    createMaterial.mockReset()
    updateMaterial.mockReset()
    listMaterials.mockImplementation((includeArchived: boolean) =>
      Promise.resolve(
        includeArchived
          ? [material(), material({ id: 'm2', name: 'Old Sand', is_active: false })]
          : [material()],
      ),
    )
    createMaterial.mockImplementation((b) => Promise.resolve(material({ id: 'mN', ...b })))
    updateMaterial.mockImplementation((id, patch) => Promise.resolve(material({ id, ...patch })))
  })

  it('lists active materials', async () => {
    renderMaterials('owner')
    expect(await screen.findByText('OPC 53 Cement')).toBeInTheDocument()
    expect(screen.queryByText('Old Sand')).not.toBeInTheDocument()
  })

  it('adds a material through createMaterial', async () => {
    renderMaterials('owner')
    await screen.findByText('OPC 53 Cement')
    await userEvent.type(screen.getByLabelText(/^Name$/i), 'TMT Steel')
    await userEvent.type(screen.getByLabelText(/^Unit$/i), 'kg')
    await userEvent.click(screen.getByRole('button', { name: /add material/i }))
    await waitFor(() => expect(createMaterial).toHaveBeenCalled())
    expect(createMaterial.mock.calls[0][0]).toMatchObject({
      name: 'TMT Steel',
      category: 'binder',
      unit: 'kg',
    })
  })

  it('blocks an empty material name', async () => {
    renderMaterials('owner')
    await screen.findByText('OPC 53 Cement')
    await userEvent.click(screen.getByRole('button', { name: /add material/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/required/i)
    expect(createMaterial).not.toHaveBeenCalled()
  })

  it('archives a material', async () => {
    renderMaterials('owner')
    const row = (await screen.findByText('OPC 53 Cement')).closest('li') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: /archive/i }))
    await waitFor(() =>
      expect(updateMaterial).toHaveBeenCalledWith('m1', { is_active: false }),
    )
  })

  it('shows archived materials when toggled', async () => {
    renderMaterials('owner')
    await screen.findByText('OPC 53 Cement')
    await userEvent.click(screen.getByRole('checkbox', { name: /show archived/i }))
    expect(await screen.findByText('Old Sand')).toBeInTheDocument()
    await waitFor(() => expect(listMaterials).toHaveBeenCalledWith(true))
  })
})
