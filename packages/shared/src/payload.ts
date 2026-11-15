/**
 * Tap payload: what the receiver's phone serves over NFC (and what its QR code shows).
 * Versioned. Unknown rails are reported as unsupported rather than as garbage, so a
 * future `rail: "bitcoin"` doesn't break v1 readers.
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
  | { ok: false; error: string };

export function encodeTapPayload(p: TapPayload): string {
  return JSON.stringify(TapPayloadSchema.parse(p));
}

/**
 * Parse anything a tap or QR scan might produce: our JSON payload, or a bare
 * `solana:` URL (e.g. another wallet's QR).
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
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: 'Not a Tap payment code' };
    }
    const p = TapPayloadSchema.safeParse(json);
    if (!p.success) return { ok: false, error: 'Not a Tap payment code' };
    if (p.data.rail !== 'solana') {
      return { ok: false, error: `This app can't pay "${p.data.rail}" requests yet` };
    }
    const request = parseTransferUrl(p.data.url);
    return { ok: true, rail: 'solana', label: p.data.label, request, url: p.data.url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid payment code' };
  }
}
