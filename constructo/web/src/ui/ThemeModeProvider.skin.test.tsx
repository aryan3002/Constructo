import { useEffect } from 'react'
import { render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { ThemeModeProvider, useThemeMode } from './ThemeModeProvider'
import type { ThemeSkin } from './themeSkin'

function SetSkin({ skin }: { skin: ThemeSkin }) {
  const { setSkin } = useThemeMode()
  useEffect(() => {
    setSkin(skin)
  }, [setSkin, skin])
  return null
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('ThemeModeProvider skin', () => {
  it('applies data-theme="neev" when skin is set to neev (light default)', async () => {
    render(
      <ThemeModeProvider>
        <SetSkin skin="neev" />
      </ThemeModeProvider>,
    )
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('neev'),
    )
  })

  it('applies data-theme="light" for the blueprint skin', async () => {
    render(
      <ThemeModeProvider>
        <SetSkin skin="blueprint" />
      </ThemeModeProvider>,
    )
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('light'),
    )
  })

  it('persists the skin to localStorage', async () => {
    render(
      <ThemeModeProvider>
        <SetSkin skin="neev" />
      </ThemeModeProvider>,
    )
    await waitFor(() => expect(localStorage.getItem('cstk.skin')).toBe('neev'))
  })
})
