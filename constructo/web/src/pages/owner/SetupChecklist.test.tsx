import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageProvider } from '../../i18n'
import type { SetupStep } from '../../api/dashboard'
import { SetupChecklist } from './SetupChecklist'

function renderChecklist(steps: SetupStep[], onAddProject = vi.fn()) {
  render(
    <LanguageProvider defaultLanguage="en">
      <SetupChecklist steps={steps} onAddProject={onAddProject} />
    </LanguageProvider>,
  )
  return { onAddProject }
}

describe('SetupChecklist', () => {
  it('renders an Add project CTA for the unfinished add_project step', () => {
    const { onAddProject } = renderChecklist([
      { key: 'add_project', done: false, title_key: 'owner.setup.add_project' },
    ])

    fireEvent.click(screen.getByRole('button', { name: /add project/i }))
    expect(onAddProject).toHaveBeenCalledTimes(1)
  })

  it('does not render the Add project CTA once the step is done', () => {
    renderChecklist([
      { key: 'add_project', done: true, title_key: 'owner.setup.add_project' },
    ])

    expect(screen.queryByRole('button', { name: /add project/i })).not.toBeInTheDocument()
  })

  it('does not render an Add project CTA for unrelated todo steps', () => {
    renderChecklist([
      { key: 'invite_team', done: false, title_key: 'owner.setup.invite_team' },
    ])

    expect(screen.queryByRole('button', { name: /add project/i })).not.toBeInTheDocument()
  })
})
