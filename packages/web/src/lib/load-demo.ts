const DEMO_LOADED_KEY = 'seatern-demo-loaded';

export function hasDemoLoaded(): boolean {
  return localStorage.getItem(DEMO_LOADED_KEY) === '1';
}

export function resetDemoFlag(): void {
  localStorage.removeItem(DEMO_LOADED_KEY);
}

import { api } from './api';
import { useSeatingStore } from '@/stores/seating';

/**
 * 為未登入的新使用者載入範例資料：
 * 1. 呼叫 clone-demo（server 端從 DB template 複製，最快）
 * 2. 成功後設 localStorage flag + 重新載入 store
 */
export async function loadDemoData(eventId: string): Promise<void> {
  try {
    await api.post(`/events/${eventId}/clone-demo`);

    localStorage.setItem(DEMO_LOADED_KEY, '1');
    await useSeatingStore.getState().loadEvent();
  } catch (err) {
    console.warn('[Demo] Failed to load demo data:', err);
  }
}
