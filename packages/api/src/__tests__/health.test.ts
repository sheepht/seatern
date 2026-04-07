import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { healthRoute } from '../routes/health';

const app = new Hono();
app.route('/api/health', healthRoute);

describe('GET /api/health', () => {
  it('回傳 status ok', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});
