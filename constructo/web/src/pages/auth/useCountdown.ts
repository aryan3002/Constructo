import { useCallback, useEffect, useRef, useState } from 'react'

export const RESEND_COOLDOWN_S = 30

/**
 * Resend-code cooldown. `start(s)` arms a 1Hz countdown from `s` (default 30)
 * to 0; re-arming resets it. Cleared on unmount. `seconds === 0` means "resend
 * available".
 */
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
    (s: number = RESEND_COOLDOWN_S) => {
      clear()
      setSeconds(s)
      if (s <= 0) return
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
