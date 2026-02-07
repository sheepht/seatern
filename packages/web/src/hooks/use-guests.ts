import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useGuests(eventId: string) {
  return useQuery({
    queryKey: ['events', eventId, 'guests'],
    queryFn: () => api.get(`/events/${eventId}/guests`).then((r) => r.data),
    enabled: !!eventId,
  })
}

export function useCreateGuest(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { contactId: string; category?: string; relationScore: number; tagIds?: string[] }) =>
      api.post(`/events/${eventId}/guests`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events', eventId, 'guests'] })
      qc.invalidateQueries({ queryKey: ['events', eventId, 'tags'] })
    },
  })
}

export function useUpdateGuest(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ guestId, ...data }: { guestId: string; category?: string; relationScore?: number }) =>
      api.put(`/events/${eventId}/guests/${guestId}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events', eventId, 'guests'] }),
  })
}

export function useDeleteGuest(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (guestId: string) =>
      api.delete(`/events/${eventId}/guests/${guestId}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events', eventId, 'guests'] })
      qc.invalidateQueries({ queryKey: ['events', eventId, 'tags'] })
    },
  })
}

export function useUpdateGuestTags(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ guestId, addTagIds, removeTagIds }: { guestId: string; addTagIds: string[]; removeTagIds: string[] }) =>
      api.post(`/events/${eventId}/guests/${guestId}/tags`, { addTagIds, removeTagIds }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events', eventId, 'guests'] })
      qc.invalidateQueries({ queryKey: ['events', eventId, 'tags'] })
    },
  })
}
