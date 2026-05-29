import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CaptureBar } from './CaptureBar'

describe('CaptureBar', () => {
  it('fires onPhoto when the photo button is tapped', async () => {
    const onPhoto = vi.fn()
    render(<CaptureBar onPhoto={onPhoto} />)
    await userEvent.click(screen.getByRole('button', { name: /photo/i }))
    expect(onPhoto).toHaveBeenCalledTimes(1)
  })

  it('fires talk start/end around a press-and-hold gesture', () => {
    const onTalkStart = vi.fn()
    const onTalkEnd = vi.fn()
    render(<CaptureBar onTalkStart={onTalkStart} onTalkEnd={onTalkEnd} />)
    const mic = screen.getByRole('button', { name: /hold to talk/i })

    fireEvent.pointerDown(mic, { pointerId: 1 })
    expect(onTalkStart).toHaveBeenCalledTimes(1)
    expect(mic).toHaveAttribute('aria-pressed', 'true')

    fireEvent.pointerUp(mic, { pointerId: 1 })
    expect(onTalkEnd).toHaveBeenCalledTimes(1)
    expect(typeof onTalkEnd.mock.calls[0][0]).toBe('number')
    expect(mic).toHaveAttribute('aria-pressed', 'false')
  })

  it('supports keyboard hold-to-talk via Space', () => {
    const onTalkStart = vi.fn()
    const onTalkEnd = vi.fn()
    render(<CaptureBar onTalkStart={onTalkStart} onTalkEnd={onTalkEnd} />)
    const mic = screen.getByRole('button', { name: /hold to talk/i })
    fireEvent.keyDown(mic, { key: ' ' })
    expect(onTalkStart).toHaveBeenCalledTimes(1)
    fireEvent.keyUp(mic, { key: ' ' })
    expect(onTalkEnd).toHaveBeenCalledTimes(1)
  })

  it('fires onType from the escape-hatch link', async () => {
    const onType = vi.fn()
    render(<CaptureBar onType={onType} />)
    await userEvent.click(screen.getByRole('button', { name: /type instead/i }))
    expect(onType).toHaveBeenCalledTimes(1)
  })
})
