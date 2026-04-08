import { handle } from '@hono/node-server/vercel';
import app from '../packages/api/src/app';

export default handle(app);
