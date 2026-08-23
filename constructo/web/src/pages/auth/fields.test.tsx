import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { LanguageProvider } from '../../i18n'
import { AuthError, OtpField, PhoneField, ResendCode, StepDots } from './fields'
import { useCountdown } from './useCountdown'

function wrap(ui: React.ReactNode) {
  return render(<LanguageProvider defaultLanguage="en">{ui}</LanguageProvider>)
}

describe('auth/fields PhoneField', () => {
  function Harness({ onChange }: { onChange: (d: string) => void }) {
    const [digits, setDigits] = useState('')
    return (
      <PhoneField
        label="Phone number"
        hint="Use the number your company invited."
        digits={digits}
        onChange={(d) => {
          setDigits(d)
          onChange(d)
        }}
      />
    )
  }

  it('shows a fixed +91 prefix, groups 5+5 as you type and emits raw digits', async () => {
    const onChange = vi.fn()
    wrap(<Harness onChange={onChange} />)
    const input = screen.getByLabelText(/phone number/i)
    expect(screen.getByText('+91')).toBeInTheDocument()
    expect(input).toHaveAttribute('inputmode', 'tel')

    await userEvent.type(input, '9876543210')
    expect(input).toHaveValue('98765 43210')
    expect(onChange).toHaveBeenLastCalledWith('9876543210')
  })

  it('caps at 10 digits and drops a pasted +91 / leading 0', async () => {
    const onChange = vi.fn()
    wrap(<Harness onChange={onChange} />)
    const input = screen.getByLabelText(/phone number/i)
    await userEvent.click(input)
    await userEvent.paste('+91 98765 43210')
    expect(input).toHaveValue('98765 43210')
    expect(onChange).toHaveBeenLastCalledWith('9876543210')

    await userEvent.type(input, '9')
    expect(onChange).toHaveBeenLastCalledWith('9876543210')
  })

  it('renders the hint and links it to the input', () => {
    wrap(<Harness onChange={() => {}} />)
    const input = screen.getByLabelText(/phone number/i)
    expect(screen.getByText(/use the number your company invited/i)).toBeInTheDocument()
    expect(input).toHaveAccessibleDescription(/use the number your company invited/i)
  })
})

describe('auth/fields OtpField', () => {
  function Harness({ onComplete }: { onComplete: (v: string) => void }) {
    const [value, setValue] = useState('')
    return (
      <OtpField label="One-time code" value={value} onChange={setValue} onComplete={onComplete} />
    )
  }

  it('accepts only digits, stops at 6 and calls onComplete exactly once', async () => {
    const onComplete = vi.fn()
    wrap(<Harness onComplete={onComplete} />)
    const input = screen.getByLabelText(/one-time code/i)
    expect(input).toHaveAttribute('autocomplete', 'one-time-code')
    expect(input).toHaveAttribute('inputmode', 'numeric')

    await userEvent.type(input, '12ab34')
    expect(input).toHaveValue('1234')
    expect(onComplete).not.toHaveBeenCalled()

    await userEvent.type(input, '567')
    expect(input).toHaveValue('123456')
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it('marks the field invalid in the error state', () => {
    wrap(<OtpField label="One-time code" value="" onChange={() => {}} error />)
    expect(screen.getByLabelText(/one-time code/i)).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('auth/fields ResendCode + useCountdown', () => {
  beforeEach(() =>
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] }),
  )
  afterEach(() => vi.useRealTimers())

  function Harness({ onResend }: { onResend: () => void }) {
    const { seconds, start } = useCountdown()
    const [resent, setResent] = useState(false)
    return (
      <div>
        <button onClick={() => start(30)}>arm</button>
        <ResendCode
          seconds={seconds}
          resent={resent}
          onResend={() => {
            onResend()
            setResent(true)
            start()
          }}
        />
      </div>
    )
  }

  it('counts down from 30s, then offers "Resend code"', () => {
    const onResend = vi.fn()
    wrap(<Harness onResend={onResend} />)

    fireEvent.click(screen.getByText('arm'))
    expect(screen.getByText('Resend in 30s')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /resend code/i })).toBeNull()

    act(() => {
      vi.advanceTimersByTime(29_000)
    })
    expect(screen.getByText('Resend in 1s')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    fireEvent.click(screen.getByRole('button', { name: /resend code/i }))
    expect(onResend).toHaveBeenCalledTimes(1)
    // Confirmation + a fresh cooldown.
    expect(screen.getByText('Code sent again')).toBeInTheDocument()
    expect(screen.getByText('Resend in 30s')).toBeInTheDocument()
  })
})

describe('auth/fields AuthError', () => {
  it('renders nothing for a null view', () => {
    wrap(<AuthError view={null} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders the translated message with an icon and an action button', async () => {
    const onAction = vi.fn()
    wrap(
      <AuthError
        view={{ messageKey: 'auth.err.not_allowed', action: 'help', helpSection: 'notEnabled' }}
        onAction={onAction}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("This number isn't enabled for Neev yet.")
    expect(alert.querySelector('svg')).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /what's what/i }))
    expect(onAction).toHaveBeenCalledWith('help')
  })
})

describe('auth/fields StepDots', () => {
  it('announces "Step n of total" and marks the active dot', () => {
    wrap(<StepDots n={2} total={3} />)
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
    const dots = screen.getAllByTestId('step-dot')
    expect(dots).toHaveLength(3)
    expect(dots[1]).toHaveAttribute('data-state', 'active')
    expect(dots[0]).toHaveAttribute('data-state', 'done')
    expect(dots[2]).toHaveAttribute('data-state', 'idle')
  })
})
