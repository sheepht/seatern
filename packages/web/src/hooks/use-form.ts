import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { publicApi } from '@/lib/public-api'

export function useFormData(token: string) {
  return useQuery({
    queryKey: ['form', token],
    queryFn: () => publicApi.get(`/form/${token}`).then((r) => r.data),
    enabled: !!token,
    retry: false,
  })
}

export function useFormSubmit(token: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => publicApi.post(`/form/${token}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['form', token] }),
  })
}

export function useFormGuestSearch(token: string, query: string) {
  return useQuery({
    queryKey: ['form', token, 'guests', query],
    queryFn: () => publicApi.get(`/form/${token}/guests`, { params: { q: query } }).then((r) => r.data),
    enabled: !!token && query.length >= 1,
  })
}

export function useEventInfo(eventId: string) {
  return useQuery({
    queryKey: ['form', 'event', eventId],
    queryFn: () => publicApi.get(`/form/event/${eventId}`).then((r) => r.data),
    enabled: !!eventId,
    retry: false,
  })
}

export function useEventGuestSearch(eventId: string, query: string) {
  return useQuery({
    queryKey: ['form', 'event', eventId, 'search', query],
    queryFn: () => publicApi.get(`/form/event/${eventId}/search`, { params: { q: query } }).then((r) => r.data),
    enabled: !!eventId && query.length >= 1,
  })
}
