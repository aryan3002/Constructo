import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import {
  Body,
  Button,
  Display,
  Micro,
  Small,
  ThemeProvider,
} from '../ui'

export function Login() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('000000')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await api.login({ phone, otp })
      navigate('/', { replace: true })
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Login failed. Try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const fieldClass =
    'mt-1 w-full min-h-tap rounded-control border border-line bg-paper-2 px-3 ' +
    'font-body text-body text-text placeholder:text-text-mute ' +
    'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40'

  return (
    <ThemeProvider defaultTheme="site">
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-sheet border border-line bg-card p-6 shadow-card">
          <Micro className="font-semibold uppercase tracking-widest text-primary-deep">
            Constructo
          </Micro>
          <Display as="h1" className="mt-1 !text-h1">
            Sign in
          </Display>
          <Body className="mt-1">
            <Small as="span">Your site command center. Demo OTP: </Small>
            <span className="cstk-mono font-semibold text-text">000000</span>
          </Body>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="phone"
                className="block font-body text-small font-semibold text-text"
              >
                Phone number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className={`${fieldClass} cstk-mono`}
              />
            </div>

            <div>
              <label
                htmlFor="otp"
                className="block font-body text-small font-semibold text-text"
              >
                OTP
              </label>
              <input
                id="otp"
                name="otp"
                type="text"
                inputMode="numeric"
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className={`${fieldClass} cstk-mono tracking-widest`}
              />
            </div>

            {error && (
              <p role="alert" className="font-body text-small font-medium text-risk">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" size="lg" block disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </ThemeProvider>
  )
}
