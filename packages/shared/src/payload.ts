/**
 * Tap payload: what the receiver's phone serves over NFC (and what its QR code shows).
 * Versioned envelope with a `rail`:
 *   solana  -> `url` is a Solana Pay transfer-request URL
 *   bitcoin -> `url` is a Breez/Spark payment request (Spark address/invoice or BOLT11)
 * Unknown rails are reported as unsupported rather than as garbage.
 */
import { z } from 'zod';
import { MAX_TEXT, parseTransferUrl, type TransferRequest } from './solanaPay.js';

export const TapPayloadSchema = z
  .object({
    v: z.literal(1),
    rail: z.string().min(1).max(20),
    label: z.string().max(MAX_TEXT),
    url: z.string().min(1).max(1024),
  })
  .strict();
export type TapPayload = z.infer<typeof TapPayloadSchema>;

export type ParsedTap =
  | { ok: true; rail: 'solana'; label: string; request: TransferRequest; url: string }
  | { ok: true; rail: 'bitcoin'; label: string; url: string }
  | { ok: false; error: string };

export function encodeTapPayload(p: TapPayload): string {
  return JSON.stringify(TapPayloadSchema.parse(p));
}

const BECH32_DATA = /^[02-9ac-hj-np-z]{6,}$/;

/**
 * Cheap shape check for a Spark address/invoice or BOLT11 invoice (bech32/bech32m with an
 * `sp…` or `ln…` prefix). The Breez SDK does the real parse + network check before paying.
 * Returns the normalized (lowercase, no `lightning:` prefix) request, or null.
 */
export function normalizeBtcRequest(input: string): string | null {
  if (typeof input !== 'string' || input.length > 1024) return null;
  let s = input.trim();
  if (/^lightning:/i.test(s)) s = s.slice('lightning:'.length);
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return null; // bech32 forbids mixed case
  s = s.toLowerCase();
  const sep = s.lastIndexOf('1');
  if (sep < 2) return null;
  const hrp = s.slice(0, sep);
  if (!/^(sp|ln)[a-z0-9]{0,18}$/.test(hrp)) return null;
  return BECH32_DATA.test(s.slice(sep + 1)) ? s : null;
}

/**
 * Parse anything a tap or QR scan might produce: our JSON payload, a bare `solana:` URL
 * (another wallet's QR), or a bare Spark/Lightning request (e.g. the games app's QR).
 */
export function parseTapPayload(raw: unknown): ParsedTap {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4096) {
    return { ok: false, error: 'Empty or oversized data' };
  }
  const text = raw.trim();
  try {
    if (text.startsWith('solana:')) {
      const request = parseTransferUrl(text);
      return { ok: true, rail: 'solana', label: request.label ?? '', request, url: text };
    }
    const bareBtc = normalizeBtcRequest(text);
    if (bareBtc) return { ok: true, rail: 'bitcoin', label: '', url: bareBtc };
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: 'Not a Tap payment code' };
    }
    const p = TapPayloadSchema.safeParse(json);
    if (!p.success) return { ok: false, error: 'Not a Tap payment code' };
    if (p.data.rail === 'solana') {
      const request = parseTransferUrl(p.data.url);
      return { ok: true, rail: 'solana', label: p.data.label, request, url: p.data.url };
    }
    if (p.data.rail === 'bitcoin') {
      const url = normalizeBtcRequest(p.data.url);
      if (!url) return { ok: false, error: 'Invalid bitcoin payment request' };
      return { ok: true, rail: 'bitcoin', label: p.data.label, url };
    }
    return { ok: false, error: `This app can't pay "${p.data.rail}" requests yet` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid payment code' };
  }
}
