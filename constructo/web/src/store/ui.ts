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
}

export const useUiStore = create<UiState>((set) => ({
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  toggleCommand: () => set((s) => ({ commandOpen: !s.commandOpen })),
  gridDensity: 'default',
  setGridDensity: (gridDensity) => set({ gridDensity }),
}))
