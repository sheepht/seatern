import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useTags(eventId: string) {
  return useQuery({
    queryKey: ['events', eventId, 'tags'],
    queryFn: () => api.get(`/events/${eventId}/tags`).then((r) => r.data),
    enabled: !!eventId,
  })
}

export function useCreateTag(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; category?: string }) =>
      api.post(`/events/${eventId}/tags`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events', eventId, 'tags'] }),
  })
}

export function useUpdateTag(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tagId, ...data }: { tagId: string; name?: string; category?: string }) =>
      api.put(`/events/${eventId}/tags/${tagId}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events', eventId, 'tags'] }),
  })
}

export function useDeleteTag(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tagId: string) =>
      api.delete(`/events/${eventId}/tags/${tagId}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events', eventId, 'tags'] }),
  })
}
