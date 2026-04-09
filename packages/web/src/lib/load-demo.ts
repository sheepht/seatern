const DEMO_LOADED_KEY = 'seatern-demo-loaded';

export function hasDemoLoaded(): boolean {
  return localStorage.getItem(DEMO_LOADED_KEY) === '1';
}

export function resetDemoFlag(): void {
  localStorage.removeItem(DEMO_LOADED_KEY);
}

import { api } from './api';
import { useSeatingStore } from '@/stores/seating';
import type { SeedPayload } from '@seatern/shared';

const DEMO_TEMPLATES = [
  '/seatern-demo-mix.json',
  '/seatern-demo-entertainment.json',
  '/seatern-demo-youtuber.json',
  '/seatern-demo-politics.json',
  '/seatern-demo-sports.json',
];

/**
 * 為未登入的新使用者載入範例資料：
 * 1. 隨機挑選一個 build-time 預算的 JSON fixture
 * 2. POST /events/:id/seed 一次寫入所有資料
 * 3. 重新載入 store
 */
export async function loadDemoData(eventId: string): Promise<void> {
  try {
    // 1. 隨機挑選一個 JSON fixture
    const template = DEMO_TEMPLATES[Math.floor(Math.random() * DEMO_TEMPLATES.length)];
    const res = await fetch(template);
    if (!res.ok) return;
    const payload: SeedPayload = await res.json();

    // 2. 一次送到後端
    await api.post(`/events/${eventId}/seed`, payload);

    // 3. 成功後才設 flag（修正原本的時序 bug）
    localStorage.setItem(DEMO_LOADED_KEY, '1');

    // 4. 重新載入 store（後端已有完整資料，不需要再呼叫 randomAssignGuests）
    await useSeatingStore.getState().loadEvent();
  } catch (err) {
    console.warn('[Demo] Failed to load demo data:', err);
  }
}
