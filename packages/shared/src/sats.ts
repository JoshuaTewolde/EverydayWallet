/** Bitcoin amounts: integer sats on the money path; BTC/USD are display conversions. */
export const SATS_PER_BTC = 100_000_000;
/** Upper bound for a single regtest request/transfer in this app. */
export const MAX_SATS = 10_000_000;

/** Parse a whole-number sats amount ("1500", "1,500"). Null if invalid, zero, or too large. */
export function parseSats(input: string): number | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(/,/g, '');
  if (!/^\d{1,9}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= MAX_SATS ? n : null;
}

export function formatSats(sats: number): string {
  return `${Math.trunc(sats).toLocaleString('en-US')} sats`;
}

/** "0.00012345" BTC string for display. */
export function satsToBtc(sats: number): string {
  const neg = sats < 0;
  const abs = Math.abs(Math.trunc(sats));
  const whole = Math.floor(abs / SATS_PER_BTC);
  const frac = String(abs % SATS_PER_BTC).padStart(8, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

export function satsToUsd(sats: number, usdPerBtc: number): number {
  return (sats / SATS_PER_BTC) * usdPerBtc;
}

/** Fiat to sats (rounded down). Null if not positive or over the cap. */
export function usdToSats(usd: number, usdPerBtc: number): number | null {
  if (!Number.isFinite(usd) || !Number.isFinite(usdPerBtc) || usd <= 0 || usdPerBtc <= 0) {
    return null;
  }
  const sats = Math.floor((usd / usdPerBtc) * SATS_PER_BTC);
  return sats > 0 && sats <= MAX_SATS ? sats : null;
}
