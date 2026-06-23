import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from './ui'

describe('ui store — sidebar collapse', () => {
  beforeEach(() => {
    localStorage.clear()
    useUiStore.setState({ sidebarCollapsed: false })
  })

  it('toggles and persists to localStorage', () => {
    expect(useUiStore.getState().sidebarCollapsed).toBe(false)
    useUiStore.getState().toggleSidebar()
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
    expect(localStorage.getItem('cstk.sidebar')).toBe('1')
    useUiStore.getState().setSidebarCollapsed(false)
    expect(localStorage.getItem('cstk.sidebar')).toBe('0')
  })
})
