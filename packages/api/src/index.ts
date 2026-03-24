import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { healthRoute } from './routes/health'
import { events } from './routes/events'
import { sessionMiddleware } from './middleware/session'

const app = new Hono()

app.use('*', logger())
app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  }),
)

// Public routes
app.route('/api/health', healthRoute)
app.get('/', (c) => c.json({ name: 'Seatern API', version: '0.1.0' }))

// Session-aware routes（匿名 + 登入都能用）
app.use('/api/events/*', sessionMiddleware)
app.route('/api/events', events)

const port = Number(process.env.PORT) || 3001

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Seatern API listening on http://localhost:${info.port}`)
})
