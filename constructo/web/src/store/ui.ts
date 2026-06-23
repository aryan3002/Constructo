import { create } from 'zustand'

/**
 * Cross-cutting UI state (vault 11/04 §3.4). Ephemeral view state only — NOT
 * server data (that's React Query) and NOT theme mode (that's ThemeModeProvider).
 */
export type GridDensity = 'compact' | 'default' | 'comfortable'

interface UiState {
  /** ⌘K command palette visibility. */
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
  toggleCommand: () => void
  /** Data-grid row density (DataGrid primitive). */
  gridDensity: GridDensity
  setGridDensity: (density: GridDensity) => void
  /** Desktop sidebar collapsed to an icon rail (neev). Persisted. */
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
}

const SIDEBAR_KEY = 'cstk.sidebar'
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}
function writeCollapsed(v: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, v ? '1' : '0')
  } catch {
    /* localStorage unavailable — runtime-only */
  }
}

export const useUiStore = create<UiState>((set) => ({
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  toggleCommand: () => set((s) => ({ commandOpen: !s.commandOpen })),
  gridDensity: 'default',
  setGridDensity: (gridDensity) => set({ gridDensity }),
  sidebarCollapsed: readCollapsed(),
  setSidebarCollapsed: (sidebarCollapsed) => {
    writeCollapsed(sidebarCollapsed)
    set({ sidebarCollapsed })
  },
  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarCollapsed
      writeCollapsed(next)
      return { sidebarCollapsed: next }
    }),
}))
