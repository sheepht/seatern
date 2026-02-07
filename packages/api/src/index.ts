import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { healthRoute } from './routes/health'
import { authMiddleware } from './middleware/auth'
import { eventsRoute } from './routes/events'
import { contactsRoute } from './routes/contacts'
import { authLineRoute } from './routes/auth-line'

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
app.route('/api/auth/line', authLineRoute)
app.get('/', (c) => c.json({ name: 'Seatern API', version: '0.0.1' }))

// Auth-protected routes
const authed = new Hono()
authed.use('*', authMiddleware)
authed.route('/events', eventsRoute)
authed.route('/contacts', contactsRoute)
app.route('/api', authed)

const port = Number(process.env.PORT) || 3001

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Seatern API listening on http://localhost:${info.port}`)
})
