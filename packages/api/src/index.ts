import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { healthRoute } from './routes/health'

const app = new Hono()

app.use('*', logger())
app.use(
  '/api/*',
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  }),
)

app.route('/api/health', healthRoute)

app.get('/', (c) => c.json({ name: 'Seatern API', version: '0.0.1' }))

const port = Number(process.env.PORT) || 3001

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Seatern API listening on http://localhost:${info.port}`)
})
