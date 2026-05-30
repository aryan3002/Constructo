// React Query hooks for the Approval Inbox. Kept inside the owned approvals
// page dir (the shared api/hooks.ts is left untouched for a clean merge).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  approvalsApi,
  type Decision,
  type DecisionState,
} from '../../api/approvals'

const KEY = ['approvals'] as const

export function useApprovals(state?: DecisionState) {
  return useQuery({
    queryKey: [...KEY, state ?? 'all'],
    queryFn: () => approvalsApi.list(state),
  })
}

export function useApprovalAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      id: string
      action: 'approve' | 'reject'
      note?: string
    }): Promise<Decision> =>
      input.action === 'approve'
        ? approvalsApi.approve(input.id, input.note)
        : approvalsApi.reject(input.id, input.note),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useBatchAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      action: 'resolve' | 'reject'
      ids: string[]
      note?: string
    }) => approvalsApi.batch(input.action, input.ids, input.note),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
