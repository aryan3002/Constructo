import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimelineItem } from './TimelineItem'

function renderItem(props: Partial<React.ComponentProps<typeof TimelineItem>> = {}) {
  return render(
    <ol>
      <TimelineItem
        typeLabel="Delivery"
        summary="50 bags cement received"
        occurredOn="Today 09:42"
        {...props}
      />
    </ol>,
  )
}

describe('TimelineItem', () => {
  it('renders the type badge, summary and occurred-on time', () => {
    renderItem()
    expect(screen.getByText('Delivery')).toBeInTheDocument()
    expect(screen.getByText('50 bags cement received')).toBeInTheDocument()
    expect(screen.getByText('Today 09:42')).toBeInTheDocument()
  })

  it('shows the confidence meter only when confidence < 1', () => {
    const { rerender } = renderItem({ confidence: 0.62 })
    expect(screen.getByLabelText(/confidence 62 percent/i)).toBeInTheDocument()

    rerender(
      <ol>
        <TimelineItem
          typeLabel="Delivery"
          summary="x"
          occurredOn="t"
          confidence={1}
        />
      </ol>,
    )
    expect(screen.queryByLabelText(/confidence/i)).not.toBeInTheDocument()
  })

  it('renders the evidence link and fires the handler when evidence exists', async () => {
    const onViewEvidence = vi.fn()
    renderItem({ hasEvidence: true, onViewEvidence })
    await userEvent.click(screen.getByRole('button', { name: /view evidence/i }))
    expect(onViewEvidence).toHaveBeenCalledTimes(1)
  })

  it('shows "No evidence" when none is attached', () => {
    renderItem({ hasEvidence: false })
    expect(screen.getByText(/no evidence/i)).toBeInTheDocument()
  })
})
