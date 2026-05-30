import { useCallback, useEffect, useState } from 'react'
import './contrast.css'

// Local-only display + notification preferences. Persisted to localStorage so
// they survive a refresh without a backend round-trip (notifications are a stub
// per the brief; the high-contrast/sunlight toggle is a real, applied setting).

const CONTRAST_KEY = 'cstk.highContrast'
const NOTIF_KEY = 'cstk.notifPrefs'

export interface NotifPrefs {
  dailyBrief: boolean
  riskAlerts: boolean
  mentions: boolean
}

const DEFAULT_NOTIFS: NotifPrefs = {
  dailyBrief: true,
  riskAlerts: true,
  mentions: true,
}

function readBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

/**
 * Sunlight / high-contrast toggle. Applies `data-contrast="high"` to the root
 * element; a small style rule (mounted by the Settings page) boosts contrast
 * and weight for bright outdoor screens — never relying on color alone.
 */
export function useHighContrast(): [boolean, (next: boolean) => void] {
  const [high, setHigh] = useState<boolean>(() => readBool(CONTRAST_KEY))

  useEffect(() => {
    const root = document.documentElement
    if (high) root.setAttribute('data-contrast', 'high')
    else root.removeAttribute('data-contrast')
    try {
      localStorage.setItem(CONTRAST_KEY, String(high))
    } catch {
      /* private mode */
    }
  }, [high])

  return [high, setHigh]
}

export function useNotifPrefs(): [NotifPrefs, (next: NotifPrefs) => void] {
  const [prefs, setPrefs] = useState<NotifPrefs>(() => {
    try {
      const raw = localStorage.getItem(NOTIF_KEY)
      return raw ? { ...DEFAULT_NOTIFS, ...JSON.parse(raw) } : DEFAULT_NOTIFS
    } catch {
      return DEFAULT_NOTIFS
    }
  })

  const update = useCallback((next: NotifPrefs) => {
    setPrefs(next)
    try {
      localStorage.setItem(NOTIF_KEY, JSON.stringify(next))
    } catch {
      /* private mode */
    }
  }, [])

  return [prefs, update]
}
