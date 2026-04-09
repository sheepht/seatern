import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { healthRoute } from './routes/health.ts';
import { events } from './routes/events.ts';
import { auth } from './routes/auth.ts';
import { users } from './routes/users.ts';
import { admin } from './routes/admin.ts';
import { sessionMiddleware } from './middleware/session.ts';
import { authMiddleware } from './middleware/auth.ts';

const app = new Hono();

app.use('*', logger());
app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  }),
);

// Public routes
app.route('/api/health', healthRoute);
app.get('/', (c) => c.json({ name: 'Seatern API', version: '0.1.0' }));

// Debug: test POST body through Hono
app.post('/api/debug-post', async (c) => {
  const body = await c.req.json();
  return c.json({ received: body });
});

// Auth routes（LINE OAuth + claim-event）
app.use('/api/auth/*', sessionMiddleware);
app.route('/api/auth', auth);

// Authenticated routes（僅登入用戶）
app.use('/api/users/*', authMiddleware);
app.route('/api/users', users);

// Admin routes（無驗證，靠 URL 隱藏）
app.route('/api/admin', admin);

// Session-aware routes（匿名 + 登入都能用）
app.use('/api/events/*', sessionMiddleware);
app.route('/api/events', events);

export default app;
