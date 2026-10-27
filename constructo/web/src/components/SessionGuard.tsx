import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { setSessionNavigator } from '../auth/session'

/** Lets an ended session send the person to /login without a page reload. */
export function SessionGuard() {
  const navigate = useNavigate()
  useEffect(() => {
    setSessionNavigator((to) => navigate(to, { replace: true }))
    return () => setSessionNavigator(null)
  }, [navigate])
  return null
}
