import { ReceiptSchema, type Receipt } from '@tap/shared';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import type { ServerConfig } from './config.js';

export interface Prices {
  usdPerSol: number;
  usdPerBtc: number;
}

export interface Deps {
  config: ServerConfig;
  /** USD per SOL and per BTC (uncached source). */
  fetchPrices: () => Promise<Prices>;
  /** Read a receipt image; null if no Gemini key configured. */
  readReceipt: ((image: string, mimeType: string) => Promise<Receipt>) | null;
  now?: () => number;
}

const ReceiptBody = z.object({
  // ~6 MB of base64 max; the app sends a ~1280px JPEG.
  image: z
    .string()
    .min(100)
    .max(8_000_000)
    .regex(/^[A-Za-z0-9+/=\s]+$/),
  mimeType: z.enum(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']),
});

export function createApp(deps: Deps) {
  const { config } = deps;
  const now = deps.now ?? Date.now;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const origins = new Set(config.CORS_ORIGINS.split(',').map((s) => s.trim()));
  app.use((req, res, next) => {
    const o = req.headers.origin;
    if (o && origins.has(o)) {
      res.setHeader('Access-Control-Allow-Origin', o);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'content-type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    }
    if (req.method === 'OPTIONS') return void res.sendStatus(204);
    next();
  });

  app.get('/health', (_req, res) => void res.json({ ok: true }));

  // ---- price (cached) ----
  let cache: (Prices & { at: number }) | null = null;
  let inflight: Promise<Prices> | null = null;
  app.get('/api/price', async (_req, res) => {
    const fresh = cache && now() - cache.at < config.PRICE_CACHE_SECONDS * 1000;
    if (!fresh) {
      try {
        inflight ??= deps.fetchPrices().finally(() => (inflight = null));
        cache = { ...(await inflight), at: now() };
      } catch (e) {
        console.warn('price fetch failed', e);
        if (!cache) return void res.status(503).json({ error: 'price unavailable' });
      }
    }
    res.json({ ...cache!, source: 'coingecko' });
  });

  // ---- receipt (Gemini), rate-limited per IP; photos are never stored ----
  const hits = new Map<string, number[]>();
  const limited = (ip: string) => {
    const t = now();
    const list = (hits.get(ip) ?? []).filter((x) => t - x < 60_000);
    list.push(t);
    hits.set(ip, list);
    if (hits.size > 10_000) hits.clear();
    return list.length > config.RECEIPTS_PER_MINUTE;
  };

  app.post('/api/receipt', express.json({ limit: '8mb' }), async (req: Request, res: Response) => {
    if (!deps.readReceipt)
      return void res.status(503).json({ error: 'receipt reader not configured' });
    if (limited(req.ip ?? 'unknown')) return void res.status(429).json({ error: 'slow down' });
    const body = ReceiptBody.safeParse(req.body);
    if (!body.success) return void res.status(400).json({ error: 'bad image' });
    try {
      const mime = body.data.mimeType === 'image/jpg' ? 'image/jpeg' : body.data.mimeType;
      const receipt = ReceiptSchema.parse(await deps.readReceipt(body.data.image, mime));
      res.json(receipt);
    } catch (e) {
      console.warn('receipt read failed', e instanceof Error ? e.message : e);
      res.status(502).json({ error: 'could not read receipt' });
    }
  });

  return app;
}
