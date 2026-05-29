import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Body, Display, H1, H2, Micro, Mono, Small } from './Typography'

describe('Typography', () => {
  it('renders each primitive with its default tag and content', () => {
    render(
      <>
        <Display>display</Display>
        <H2>h2</H2>
        <Body>body</Body>
        <Mono>1234</Mono>
      </>,
    )
    expect(screen.getByText('display').tagName).toBe('H1')
    expect(screen.getByText('h2').tagName).toBe('H2')
    expect(screen.getByText('body').tagName).toBe('P')
    expect(screen.getByText('1234').tagName).toBe('SPAN')
  })

  it('honors the `as` override for correct semantics', () => {
    render(<Display as="h2">title</Display>)
    expect(screen.getByText('title').tagName).toBe('H2')
  })

  it('merges custom className with the base classes', () => {
    render(<H1 className="custom-x">t</H1>)
    const el = screen.getByText('t')
    expect(el).toHaveClass('custom-x')
    expect(el).toHaveClass('font-display')
  })

  it('Mono uses the tabular-figure helper class', () => {
    render(<Mono>9</Mono>)
    expect(screen.getByText('9')).toHaveClass('cstk-mono')
  })

  it('Small and Micro render', () => {
    render(
      <>
        <Small>s</Small>
        <Micro>m</Micro>
      </>,
    )
    expect(screen.getByText('s')).toBeInTheDocument()
    expect(screen.getByText('m')).toBeInTheDocument()
  })
})
