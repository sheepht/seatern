import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { healthRoute } from './routes/health'
import { authMiddleware, type AuthEnv } from './middleware/auth'

const app = new Hono()

app.use('*', logger())
app.use(
  '/api/*',
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  }),
)

// Public routes
app.route('/api/health', healthRoute)
app.get('/', (c) => c.json({ name: 'Seatern API', version: '0.0.1' }))

// Auth-protected routes
const authed = new Hono<AuthEnv>()
authed.use('*', authMiddleware)
authed.get('/me', (c) => c.json({ userId: c.get('userId') }))
app.route('/api', authed)

const port = Number(process.env.PORT) || 3001

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Seatern API listening on http://localhost:${info.port}`)
})
