import { ReceiptSchema, type Receipt } from '@tap/shared';
import { API_URL } from './config';

async function timed(url: string, init: RequestInit = {}, ms = 8000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

const pos = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null);

/** USD rates, or nulls if the server is unreachable (UI just hides USD). */
export async function fetchPrices(): Promise<{
  usdPerSol: number | null;
  usdPerBtc: number | null;
}> {
  try {
    const r = await timed(`${API_URL}/api/price`);
    if (!r.ok) return { usdPerSol: null, usdPerBtc: null };
    const j = (await r.json()) as { usdPerSol?: unknown; usdPerBtc?: unknown };
    return { usdPerSol: pos(j.usdPerSol), usdPerBtc: pos(j.usdPerBtc) };
  } catch {
    return { usdPerSol: null, usdPerBtc: null };
  }
}

export async function scanReceipt(imageBase64: string, mimeType: string): Promise<Receipt> {
  let r: Response;
  try {
    r = await timed(
      `${API_URL}/api/receipt`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: imageBase64, mimeType }),
      },
      30_000,
    );
  } catch {
    throw new Error("Couldn't reach the receipt reader. Type the amount instead.");
  }
  if (r.status === 429) throw new Error('Too many scans. Wait a minute or type the amount.');
  if (!r.ok) throw new Error("Couldn't read that receipt. Type the amount instead.");
  return ReceiptSchema.parse(await r.json());
}
