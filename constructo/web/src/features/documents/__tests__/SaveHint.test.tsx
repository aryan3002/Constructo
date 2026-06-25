import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SaveHint } from '../SaveHint'

describe('SaveHint', () => {
  it('shows the first unmet check in order', () => {
    render(
      <SaveHint
        checks={[
          { ok: true, msg: 'need site' },
          { ok: false, msg: 'need version' },
          { ok: false, msg: 'need file' },
        ]}
      />,
    )
    expect(screen.getByText('need version')).toBeInTheDocument()
    expect(screen.queryByText('need file')).not.toBeInTheDocument()
  })

  it('renders nothing once every check passes', () => {
    const { container } = render(
      <SaveHint
        checks={[
          { ok: true, msg: 'need title' },
          { ok: true, msg: 'need file' },
        ]}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when hidden, even with an unmet check', () => {
    const { container } = render(
      <SaveHint hidden checks={[{ ok: false, msg: 'need file' }]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
