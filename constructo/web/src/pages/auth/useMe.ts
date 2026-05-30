import { useCallback, useEffect, useState } from 'react'
import { authApi, type Me } from '../../api/auth'

/** Load the current user (GET /api/v1/auth/me). Used by Settings + onboarding. */
export function useMe() {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setMe(await authApi.me())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { me, loading, error, reload, setMe }
}
