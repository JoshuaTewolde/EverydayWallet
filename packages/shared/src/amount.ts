/** Exact SOL <-> lamports conversions (no floating point on the money path). */
export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const SOL_DECIMALS = 9;
/** Upper bound for any single request/transfer on this devnet app. */
export const MAX_SOL = 1_000_000n;

const DECIMAL_RE = /^(\d+)(?:\.(\d+))?$/;

/** Parse a user/URL SOL amount like "1", "0.5", "1.000000001". Returns null if invalid. */
export function parseSol(input: string): bigint | null {
  if (typeof input !== 'string') return null;
  const m = DECIMAL_RE.exec(input.trim());
  if (!m) return null;
  const whole = m[1]!;
  const frac = m[2] ?? '';
  if (frac.length > SOL_DECIMALS || whole.length > 12) return null;
  const lamports = BigInt(whole) * LAMPORTS_PER_SOL + BigInt(frac.padEnd(SOL_DECIMALS, '0'));
  if (lamports > MAX_SOL * LAMPORTS_PER_SOL) return null;
  return lamports;
}

/** Format lamports as a plain decimal SOL string, no trailing zeros ("1.5", "0.000000001"). */
export function formatSol(lamports: bigint): string {
  const neg = lamports < 0n;
  const abs = neg ? -lamports : lamports;
  const whole = abs / LAMPORTS_PER_SOL;
  const frac = (abs % LAMPORTS_PER_SOL).toString().padStart(SOL_DECIMALS, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** Approximate USD for a lamport amount at a USD/SOL rate. Display only. */
export function solToUsd(lamports: bigint, usdPerSol: number): number {
  return (Number(lamports) / 1e9) * usdPerSol;
}

/** Convert a fiat amount to lamports at a rate (rounded down). Null if not positive. */
export function usdToLamports(usd: number, usdPerSol: number): bigint | null {
  if (!Number.isFinite(usd) || !Number.isFinite(usdPerSol) || usd <= 0 || usdPerSol <= 0) {
    return null;
  }
  const lamports = BigInt(Math.floor((usd / usdPerSol) * 1e9));
  if (lamports <= 0n || lamports > MAX_SOL * LAMPORTS_PER_SOL) return null;
  return lamports;
}

export function formatUsd(usd: number): string {
  return usd.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(usd) < 1 ? 4 : 2,
  });
}
