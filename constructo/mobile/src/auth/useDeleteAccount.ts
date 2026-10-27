/**
 * Shared "delete my account" flow: confirm (caller's responsibility,
 * see `beginDelete`) -> step-up OTP -> DELETE /users/me -> sign out ->
 * redirect. Every role's settings/account screen that offers account
 * deletion should use this hook so the destructive path behaves identically
 * everywhere.
 */
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { useMutation } from '@tanstack/react-query'

import { authApi } from '../api/auth'
import { errorText } from '../api/errorText'
import { getActiveLang } from '../i18n/activeLang'
import { showToast } from '../ui/toastBus'
import { clearOutboxFor } from '../offline/outbox'
import { unregisterDevicePushToken } from '../push/register'
import { getToken } from '../store/secure'
import { useAuth } from './AuthContext'

export function useDeleteAccount(opts: {
  /** Where to send the user after their account is gone, e.g. '/' or '/(auth)/login'. */
  afterDeleteHref: string
}) {
  const { signOut, me } = useAuth()
  const router = useRouter()
  const [stepUpVisible, setStepUpVisible] = useState(false)

  const deleteMut = useMutation({
    mutationFn: async (stepUpToken: string) => {
      // Unregister this phone's push token while the account can still
      // authenticate; signOut()'s own attempt would be refused once it's gone.
      await unregisterDevicePushToken(await getToken())
      return authApi.deleteAccount(stepUpToken)
    },
    onSuccess: async () => {
      setStepUpVisible(false)
      const userId = me?.id
      // signOut() runs resetSession(): query cache, user storage, queues, socket.
      await signOut()
      // Sign-out keeps a person's unsent captures; a deleted account doesn't.
      if (userId) await clearOutboxFor(userId).catch(() => undefined)
      router.replace(opts.afterDeleteHref)
    },
    onError: (err: unknown) => {
      setStepUpVisible(false)
      // Plain en/hi text, never the raw server message (T8).
      showToast(errorText(err, getActiveLang()), { tone: 'error' })
    },
    meta: { errorHandled: true },
  })

  return {
    /** Pass to <StepUpModal visible={stepUpVisible} .../>. */
    stepUpVisible,
    /** Call this from the destructive button of your own native confirm Alert. */
    beginDelete: () => setStepUpVisible(true),
    /** Pass as StepUpModal's onCancel. */
    cancelStepUp: () => setStepUpVisible(false),
    /** Pass as StepUpModal's onVerified. */
    onStepUpVerified: (token: string) => deleteMut.mutate(token),
  }
}
