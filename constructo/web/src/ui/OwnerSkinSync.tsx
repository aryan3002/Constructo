import { useEffect } from 'react'
import { useMeRole } from '../auth/useCan'
import { NEEV_OWNER_ENABLED } from '../api/config'
import { useThemeMode } from './ThemeModeProvider'
import { skinForRole } from './themeSkin'

/**
 * Applies the Neev "Calm Cockpit" skin for owners once the role is known,
 * gated by VITE_NEEV_OWNER. Renders nothing. Mounted inside ThemeModeProvider
 * (for setSkin) and inside QueryClientProvider (for useMeRole). Reversible:
 * with the flag off, or for any non-owner role, it sets the blueprint skin.
 */
export function OwnerSkinSync() {
  const role = useMeRole()
  const { setSkin } = useThemeMode()
  useEffect(() => {
    setSkin(skinForRole(role, NEEV_OWNER_ENABLED))
  }, [role, setSkin])
  return null
}
