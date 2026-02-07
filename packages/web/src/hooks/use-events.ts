import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useEvents() {
  return useQuery({
    queryKey: ['events'],
    queryFn: () => api.get('/events').then((r) => r.data),
  })
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: ['events', id],
    queryFn: () => api.get(`/events/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

export function useCreateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; date: string; type: string; categories?: string[] }) =>
      api.post('/events', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  })
}

export function useUpdateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; date?: string; type?: string; categories?: string[] }) =>
      api.put(`/events/${id}`, data).then((r) => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['events'] })
      qc.invalidateQueries({ queryKey: ['events', vars.id] })
    },
  })
}

export function useRenameCategory(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { oldName: string; newName: string }) =>
      api.post(`/events/${eventId}/rename-category`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events', eventId] })
      qc.invalidateQueries({ queryKey: ['guests', eventId] })
      qc.invalidateQueries({ queryKey: ['tags', eventId] })
    },
  })
}

export function useDeleteCategory(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      api.post(`/events/${eventId}/delete-category`, { name }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events', eventId] })
      qc.invalidateQueries({ queryKey: ['guests', eventId] })
      qc.invalidateQueries({ queryKey: ['tags', eventId] })
    },
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/events/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  })
}
