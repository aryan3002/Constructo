import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SiteSwitcher, type SiteSummary } from './SiteSwitcher'

const sites: SiteSummary[] = [
  { id: 's1', name: 'Green Valley', status: 'risk' },
  { id: 's2', name: 'Lakeside', status: 'warn' },
  { id: 's3', name: 'Metro Park', status: 'ok' },
]

describe('SiteSwitcher', () => {
  it('shows the selected site name in the header', () => {
    render(<SiteSwitcher sites={sites} selectedId="s2" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: /Lakeside/ })).toBeInTheDocument()
  })

  it('shows "All Sites (n)" when nothing is selected', () => {
    render(<SiteSwitcher sites={sites} selectedId={null} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: /All Sites \(3\)/ })).toBeInTheDocument()
  })

  it('opens a switcher dialog listing every site and selects one', async () => {
    const onSelect = vi.fn()
    render(<SiteSwitcher sites={sites} selectedId="s1" onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('button', { name: /Green Valley/ }))
    const dialog = screen.getByRole('dialog', { name: /switch site/i })
    expect(dialog).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Metro Park/ }))
    expect(onSelect).toHaveBeenCalledWith('s3')
  })

  it('can select the All Sites aggregate from the sheet', async () => {
    const onSelect = vi.fn()
    render(<SiteSwitcher sites={sites} selectedId="s1" onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /Green Valley/ }))
    const dialog = screen.getByRole('dialog', { name: /switch site/i })
    await userEvent.click(within(dialog).getByRole('button', { name: /All Sites/ }))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('renders the notification count and role avatar', () => {
    render(
      <SiteSwitcher
        sites={sites}
        selectedId={null}
        onSelect={() => {}}
        notificationCount={3}
        role={{ name: 'Owner', initials: 'RK' }}
      />,
    )
    expect(
      screen.getByRole('button', { name: /3 unread/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Role: Owner')).toHaveTextContent('RK')
  })
})
