import { useEffect, useState } from 'react'
import './contrast.css'

// Local-only display preference, persisted to localStorage so it survives a
// refresh without a backend round-trip (the high-contrast/sunlight toggle is a
// real, applied setting). Notifications are set on the server, per company, in
// Setup & administration.

const CONTRAST_KEY = 'cstk.highContrast'

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
