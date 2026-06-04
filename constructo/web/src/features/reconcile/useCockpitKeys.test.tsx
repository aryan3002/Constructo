import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useCockpitKeys, type CockpitKeyHandlers } from './useCockpitKeys'

function Harness(props: Omit<CockpitKeyHandlers, 'keys'> & { keys: string[] }) {
  useCockpitKeys(props)
  return <div data-testid="cockpit" />
}

function press(key: string, opts: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }))
}

const KEYS = ['a', 'b', 'c']

describe('useCockpitKeys', () => {
  it('↓ moves the cursor down, ↑ moves up (clamped at the ends)', () => {
    const onMove = vi.fn()
    const { rerender } = render(<Harness keys={KEYS} selectedKey="a" onMove={onMove} />)
    press('ArrowDown')
    expect(onMove).toHaveBeenLastCalledWith('b')

    rerender(<Harness keys={KEYS} selectedKey="c" onMove={onMove} />)
    press('ArrowDown') // clamp at the last row
    expect(onMove).toHaveBeenLastCalledWith('c')

    rerender(<Harness keys={KEYS} selectedKey="a" onMove={onMove} />)
    press('ArrowUp') // clamp at the first row
    expect(onMove).toHaveBeenLastCalledWith('a')
  })

  it('Enter opens, H holds, F flags the selected row', () => {
    const onOpen = vi.fn()
    const onHold = vi.fn()
    const onFlag = vi.fn()
    render(
      <Harness
        keys={KEYS}
        selectedKey="b"
        onMove={vi.fn()}
        onOpen={onOpen}
        onHold={onHold}
        onFlag={onFlag}
      />,
    )
    press('Enter')
    expect(onOpen).toHaveBeenCalledWith('b')
    press('h')
    expect(onHold).toHaveBeenCalledWith('b')
    press('F')
    expect(onFlag).toHaveBeenCalledWith('b')
  })

  it('ignores keys while a modifier is held (e.g. ⌘K) or a field is focused', () => {
    const onMove = vi.fn()
    render(
      <>
        <input data-testid="field" />
        <Harness keys={KEYS} selectedKey="a" onMove={onMove} />
      </>,
    )
    press('ArrowDown', { metaKey: true })
    expect(onMove).not.toHaveBeenCalled()

    const field = document.querySelector('[data-testid=field]') as HTMLInputElement
    field.focus()
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(onMove).not.toHaveBeenCalled()
  })

  it('does nothing when disabled', () => {
    const onMove = vi.fn()
    render(<Harness keys={KEYS} selectedKey="a" onMove={onMove} enabled={false} />)
    press('ArrowDown')
    expect(onMove).not.toHaveBeenCalled()
  })
})
