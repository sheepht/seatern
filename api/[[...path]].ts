import { handle } from 'hono/vercel';
import app from '../packages/api/src/app';

export const runtime = 'edge';
export default handle(app);
