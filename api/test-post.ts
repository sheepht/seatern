export default function handler(
  req: { method: string; body: unknown },
  res: { status: (code: number) => { json: (data: unknown) => void } },
) {
  res.status(200).json({ method: req.method, body: req.body });
}
