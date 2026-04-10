import axios, { type AxiosResponse } from 'axios';
import { api } from './api';
import { trackEvent } from './analytics';

export type EnsureEventTrigger = 'auto_first_login' | 'login_page' | 'auth_callback';

/**
 * 確保使用者有一個預設活動。沒有就建一個並回傳最新 `/events/mine` 結果；
 * 建立失敗回傳 null，呼叫端自行決定如何處理。
 */
export async function ensureDefaultEvent(
  trigger: EnsureEventTrigger,
): Promise<AxiosResponse | null> {
  try {
    return await api.get('/events/mine');
  } catch (err) {
    if (!axios.isAxiosError(err) || err.response?.status !== 404) {
      throw err;
    }
    try {
      await api.post('/events', { name: '我的排位' });
      trackEvent('create_event', { trigger });
    } catch {
      return null;
    }
    return api.get('/events/mine');
  }
}
