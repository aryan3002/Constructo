/**
 * Open the homeowner's own builder thread with a message already typed, so a
 * question about a photo or drawing is one tap from being sent. Resolves the
 * thread the way the Messages inbox does (get-or-create on the shared query
 * key); without a site, or if that fails, opens the inbox instead.
 */
import { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'

import { chatApi } from '../api/chat'
import { useAuth } from '../auth/AuthContext'
import { designChatRoute } from './design_profiler.util'

export function useBuilderChat(): (draft: string) => Promise<void> {
  const router = useRouter()
  const qc = useQueryClient()
  const { siteId } = useAuth()
  return useCallback(
    async (draft: string) => {
      if (!siteId) {
        router.push('/(homeowner)/messages')
        return
      }
      try {
        const conv = await qc.fetchQuery({
          queryKey: ['homeowner', 'channel', siteId],
          queryFn: () => chatApi.homeownerChannel(siteId),
        })
        router.push(designChatRoute(conv, draft))
      } catch {
        router.push('/(homeowner)/messages')
      }
    },
    [router, qc, siteId],
  )
}
