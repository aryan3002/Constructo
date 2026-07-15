/**
 * Shared "delete my account" flow: native confirm (caller's responsibility,
 * see `beginDelete`) -> step-up OTP -> DELETE /users/me -> sign out ->
 * redirect. Every role's settings/account screen that offers account
 * deletion should use this hook so the destructive path behaves identically
 * everywhere.
 */
import { useState } from 'react'
import { Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useMutation } from '@tanstack/react-query'

import { authApi } from '../api/auth'
import { ApiError } from '../api/client'
import { useAuth } from './AuthContext'

export function useDeleteAccount(opts: {
  /** Where to send the user after their account is gone, e.g. '/' or '/(auth)/login'. */
  afterDeleteHref: string
  /** Localized fallback message shown if the delete call fails for a non-ApiError reason. */
  genericErrorMessage: string
}) {
  const { signOut } = useAuth()
  const router = useRouter()
  const [stepUpVisible, setStepUpVisible] = useState(false)

  const deleteMut = useMutation({
    mutationFn: (stepUpToken: string) => authApi.deleteAccount(stepUpToken),
    onSuccess: async () => {
      setStepUpVisible(false)
      await signOut()
      router.replace(opts.afterDeleteHref)
    },
    onError: (err: unknown) => {
      setStepUpVisible(false)
      Alert.alert(
        '',
        err instanceof ApiError ? err.message : opts.genericErrorMessage,
      )
    },
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
