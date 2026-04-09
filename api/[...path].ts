import type { IncomingMessage, ServerResponse } from 'http';
import app from '../packages/api/dist/app.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `${protocol}://${host}`);

  // Read body from Vercel's buffered request
  const body = await new Promise<string>((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });

  const request = new Request(url.toString(), {
    method: req.method,
    headers: Object.entries(req.headers).reduce((h, [k, v]) => {
      if (v) h.set(k, Array.isArray(v) ? v.join(', ') : v);
      return h;
    }, new Headers()),
    body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : body || undefined,
  });

  const response = await app.fetch(request);

  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  const resBody = await response.arrayBuffer();
  res.end(Buffer.from(resBody));
}
