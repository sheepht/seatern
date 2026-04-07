import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function adminAxios(token: string) {
  return axios.create({
    baseURL: `${API}/api/admin`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
}

interface PlanEvent {
  id: string;
  name: string;
  planType: string | null;
  planStatus: string | null;
  planExpiresAt: string | null;
  planCreatedAt: string | null;
  planNote: string | null;
  ownerName: string;
  ownerEmail: string;
  guestCount: number;
  tableCount: number;
  updatedAt: string;
}

export function useAdminPlans(token: string) {
  return useQuery({
    queryKey: ['admin', 'plans', token],
    queryFn: async () => {
      const client = adminAxios(token);
      const [pendingRes, allRes] = await Promise.all([
        client.get<PlanEvent[]>('/pending-plans'),
        client.get<PlanEvent[]>('/all-plans'),
      ]);
      return { pending: pendingRes.data, all: allRes.data };
    },
    enabled: !!token,
    retry: false,
  });
}

export function useAdminApprove(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => adminAxios(token).post(`/approve/${eventId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'plans'] }),
  });
}

export function useAdminReject(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => adminAxios(token).post(`/reject/${eventId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'plans'] }),
  });
}

export function useAdminUpdateEvent(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, patch }: { eventId: string; patch: Record<string, unknown> }) =>
      adminAxios(token).patch(`/events/${eventId}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'plans'] }),
  });
}

export type { PlanEvent };
