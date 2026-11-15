import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createReceiptReader } from './gemini.js';

const config = loadConfig();

async function fetchSolUsd(): Promise<number> {
  const r = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
    {
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  const j = (await r.json()) as { solana?: { usd?: unknown } };
  const usd = j.solana?.usd;
  if (typeof usd !== 'number' || !(usd > 0)) throw new Error('bad price');
  return usd;
}

const app = createApp({
  config,
  fetchSolUsd,
  readReceipt: config.GEMINI_API_KEY
    ? createReceiptReader(config.GEMINI_API_KEY, config.GEMINI_MODEL)
    : null,
});

app.listen(config.PORT, () => {
  console.info(
    `tap server on :${config.PORT} (gemini ${config.GEMINI_API_KEY ? config.GEMINI_MODEL : 'OFF'})`,
  );
});
