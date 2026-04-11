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
 * 1. 設定 demoLoading 狀態（畫面顯示「載入展示用賓客...」）
 * 2. 呼叫 clone-demo（server 端從 DB template 複製）
 * 3. 成功後設 localStorage flag + reloadEvent 強制繞過快取
 */
export async function loadDemoData(eventId: string): Promise<void> {
  useSeatingStore.setState({ demoLoading: true });
  try {
    await api.post(`/events/${eventId}/clone-demo`);
    localStorage.setItem(DEMO_LOADED_KEY, '1');
    await useSeatingStore.getState().reloadEvent();
  } catch (err) {
    console.warn('[Demo] Failed to load demo data:', err);
  } finally {
    useSeatingStore.setState({ demoLoading: false });
  }
}
