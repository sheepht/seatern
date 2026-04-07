import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSeatingStore } from '@/stores/seating';

export function useNotifyPayment() {
  return useMutation({
    mutationFn: ({ eventId, planType }: { eventId: string; planType: string }) =>
      api.post(`/events/${eventId}/notify-payment`, { planType }),
    onSuccess: () => {
      useSeatingStore.setState({ planStatus: 'pending' });
    },
  });
}
