import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useContacts(q?: string) {
  return useQuery({
    queryKey: ['contacts', q ?? ''],
    queryFn: () => api.get('/contacts', { params: q ? { q } : undefined }).then((r) => r.data),
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; aliases?: string[]; email?: string; phone?: string }) =>
      api.post('/contacts', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; aliases?: string[]; email?: string; phone?: string }) =>
      api.put(`/contacts/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/contacts/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}
