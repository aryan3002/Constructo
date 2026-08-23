/**
 * useCountdown — the 30-second "Resend code" cooldown.
 *
 * `start()` arms the timer (default 30s); `seconds` ticks down to 0 once per
 * second. Re-arming mid-count restarts it. The interval is cleared on unmount
 * so a screen routed away mid-cooldown never leaks a timer.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export const RESEND_SECONDS = 30

export function useCountdown(): { seconds: number; start: (s?: number) => void } {
  const [seconds, setSeconds] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const clear = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current)
      timer.current = null
    }
  }, [])

  const start = useCallback(
    (s: number = RESEND_SECONDS) => {
      clear()
      setSeconds(s)
      timer.current = setInterval(() => {
        setSeconds((prev) => {
          if (prev <= 1) {
            clear()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    },
    [clear],
  )

  useEffect(() => clear, [clear])

  return { seconds, start }
}
