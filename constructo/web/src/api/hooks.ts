import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type {
  CreateWhatsappGroupRequest,
  RunBriefRequest,
} from './types'

export function useSites() {
  return useQuery({
    queryKey: ['sites'],
    queryFn: () => api.listSites(),
  })
}

export function useSite(id: string) {
  return useQuery({
    queryKey: ['site', id],
    queryFn: () => api.getSite(id),
    enabled: Boolean(id),
  })
}

export function useBrief(date: string) {
  return useQuery({
    queryKey: ['brief', date],
    queryFn: () => api.getBrief(date),
  })
}

export function useSiteEvents(siteId: string, date: string) {
  return useQuery({
    queryKey: ['site-events', siteId, date],
    queryFn: () => api.listSiteEvents(siteId, date),
    enabled: Boolean(siteId),
  })
}

export function useGroups() {
  return useQuery({
    queryKey: ['groups'],
    queryFn: () => api.listGroups(),
  })
}

export function useRunBrief() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: RunBriefRequest) => api.runBrief(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief'] })
    },
  })
}

export function useCreateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateWhatsappGroupRequest) => api.createGroup(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}
