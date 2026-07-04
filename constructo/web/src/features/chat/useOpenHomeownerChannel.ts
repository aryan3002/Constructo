import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { chatApi } from '../../api/chat'

/** Open (get-or-create) a project's homeowner 1:1 channel and jump into it. */
export function useOpenHomeownerChannel() {
  const qc = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (siteId: string) => chatApi.openHomeownerChannel(siteId),
    onSuccess: (conversation) => {
      void qc.invalidateQueries({ queryKey: ['chat', 'conversations'] })
      navigate(`/chat?conversation=${conversation.id}`, { state: { conversation } })
    },
  })
}
