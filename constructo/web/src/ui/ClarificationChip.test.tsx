import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClarificationChip } from './ClarificationChip'

describe('ClarificationChip', () => {
  it('renders the question and at most three answer chips', () => {
    render(
      <ClarificationChip
        question="Tower A or B?"
        answers={[
          { id: 'a', label: 'Tower A' },
          { id: 'b', label: 'Tower B' },
          { id: 'c', label: 'Both' },
          { id: 'd', label: 'Neither' },
        ]}
      />,
    )
    expect(screen.getByText('Tower A or B?')).toBeInTheDocument()
    const chips = screen.getAllByRole('button')
    expect(chips).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Neither' })).not.toBeInTheDocument()
  })

  it('fires onAnswer with the chosen answer id', async () => {
    const onAnswer = vi.fn()
    render(
      <ClarificationChip
        question="q"
        answers={[
          { id: 'a', label: 'Tower A' },
          { id: 'b', label: 'Tower B' },
        ]}
        onAnswer={onAnswer}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Tower B' }))
    expect(onAnswer).toHaveBeenCalledWith('b')
  })

  it('groups the answers with an accessible label', () => {
    render(<ClarificationChip question="q" answers={[{ id: 'a', label: 'A' }]} />)
    expect(screen.getByRole('group', { name: /clarification/i })).toBeInTheDocument()
  })
})
