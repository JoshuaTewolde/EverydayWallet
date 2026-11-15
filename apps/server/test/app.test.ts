import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({ RECEIPTS_PER_MINUTE: '2' });
const receipt = {
  merchant: 'Cafe',
  date: null,
  currency: 'USD',
  total: 12.5,
  items: [],
  confidence: 0.9,
};
const image = 'A'.repeat(200);

describe('server', () => {
  it('caches the price', async () => {
    const fetchSolUsd = vi.fn().mockResolvedValue(150);
    const app = createApp({ config, fetchSolUsd, readReceipt: null });
    await request(app).get('/api/price').expect(200, /150/);
    await request(app).get('/api/price').expect(200);
    expect(fetchSolUsd).toHaveBeenCalledTimes(1);
  });

  it('503s on receipt without a Gemini key', async () => {
    const app = createApp({ config, fetchSolUsd: async () => 1, readReceipt: null });
    await request(app).post('/api/receipt').send({ image, mimeType: 'image/jpeg' }).expect(503);
  });

  it('validates input, validates model output, and rate-limits', async () => {
    const readReceipt = vi.fn().mockResolvedValue(receipt);
    const app = createApp({ config, fetchSolUsd: async () => 1, readReceipt });
    await request(app)
      .post('/api/receipt')
      .send({ image: 'x', mimeType: 'image/jpeg' })
      .expect(400);
    const ok = await request(app).post('/api/receipt').send({ image, mimeType: 'image/jpeg' });
    expect(ok.status).toBe(200);
    expect(ok.body.total).toBe(12.5);
    await request(app).post('/api/receipt').send({ image, mimeType: 'image/jpeg' }).expect(429);
  });

  it('rejects malformed model output', async () => {
    const readReceipt = vi.fn().mockResolvedValue({ ...receipt, confidence: 7 });
    const app = createApp({ config, fetchSolUsd: async () => 1, readReceipt });
    await request(app).post('/api/receipt').send({ image, mimeType: 'image/png' }).expect(502);
  });
});
