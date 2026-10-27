/**
 * The app-wide fallback for failed mutations: most contractor mutations have no
 * error handling of their own, so a failure used to be silent. The root
 * QueryClient's MutationCache calls {@link reportMutationError}, which shows an
 * error toast — unless the mutation already shows its error itself.
 */
import { ApiError } from './client'
import { errorText } from './errorText'
import { getActiveLang } from '../i18n/activeLang'
import { showToast } from '../ui/toastBus'

/** What the fallback reads from a mutation's options. */
export interface MutationErrorOptions {
  onError?: unknown
  meta?: Record<string, unknown>
}

/** Skip mutations that show their own error: an `onError` in their options, or
 *  `meta: { errorHandled: true }` (screens that render `isError` inline). An
 *  expired login (401) is already handled by sending the user to sign in. */
export function shouldReportMutationError(err: unknown, options: MutationErrorOptions): boolean {
  if (options.onError) return false
  if (options.meta?.errorHandled === true) return false
  if (err instanceof ApiError && err.status === 401) return false
  return true
}

export function reportMutationError(err: unknown, options: MutationErrorOptions): void {
  if (!shouldReportMutationError(err, options)) return
  showToast(errorText(err, getActiveLang()), { tone: 'error' })
}
