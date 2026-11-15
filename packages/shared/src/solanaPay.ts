/**
 * Solana Pay transfer-request URLs (native SOL only):
 *   solana:<recipient>?amount=<sol>&reference=<pubkey>&label=<..>&message=<..>&memo=<..>
 * https://docs.solanapay.com/spec
 */
import bs58 from 'bs58';
import { formatSol, parseSol } from './amount.js';

export interface TransferRequest {
  recipient: string;
  /** Lamports; undefined = payer chooses the amount. */
  amount?: bigint;
  /** Reference public keys (base58), used to find the transaction on-chain. */
  reference?: string[];
  label?: string;
  message?: string;
  memo?: string;
}

export const MAX_TEXT = 140;
const MAX_URL = 1024;

/** True if `s` is base58 that decodes to exactly 32 bytes (an ed25519 public key). */
export function isPublicKey(s: unknown): s is string {
  if (typeof s !== 'string' || s.length < 32 || s.length > 44) return false;
  try {
    return bs58.decode(s).length === 32;
  } catch {
    return false;
  }
}

function cleanText(s: string | null, field: string): string | undefined {
  if (s == null) return undefined;
  if (s.length > MAX_TEXT) throw new Error(`The ${field} is too long`);
  // Strip control characters so nothing odd reaches the confirm screen.
  // eslint-disable-next-line no-control-regex
  const v = s.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '').trim();
  return v || undefined;
}

export function buildTransferUrl(req: TransferRequest): string {
  if (!isPublicKey(req.recipient)) throw new Error('Invalid recipient');
  const params = new URLSearchParams();
  if (req.amount !== undefined) {
    if (req.amount <= 0n) throw new Error('Amount must be positive');
    params.append('amount', formatSol(req.amount));
  }
  for (const r of req.reference ?? []) {
    if (!isPublicKey(r)) throw new Error('Invalid reference');
    params.append('reference', r);
  }
  if (req.label) params.append('label', req.label.slice(0, MAX_TEXT));
  if (req.message) params.append('message', req.message.slice(0, MAX_TEXT));
  if (req.memo) params.append('memo', req.memo.slice(0, MAX_TEXT));
  const q = params.toString().replace(/\+/g, '%20');
  return `solana:${req.recipient}${q ? `?${q}` : ''}`;
}

/** Strictly parse a Solana Pay transfer URL. Throws an Error with a user-readable message. */
export function parseTransferUrl(url: string): TransferRequest {
  if (typeof url !== 'string' || url.length > MAX_URL) throw new Error('Invalid payment link');
  if (!url.startsWith('solana:')) throw new Error('Not a Solana payment link');
  const rest = url.slice('solana:'.length);
  const qIdx = rest.indexOf('?');
  let recipient: string;
  try {
    recipient = decodeURIComponent(qIdx === -1 ? rest : rest.slice(0, qIdx));
  } catch {
    throw new Error('Invalid recipient address');
  }
  // Transaction-request URLs (solana:https://...) are not supported.
  if (!isPublicKey(recipient)) throw new Error('Invalid recipient address');
  const params = new URLSearchParams(qIdx === -1 ? '' : rest.slice(qIdx + 1));
  if (params.has('spl-token')) throw new Error('Token payments are not supported yet');

  const req: TransferRequest = { recipient };
  const amounts = params.getAll('amount');
  if (amounts.length > 1) throw new Error('Invalid amount');
  if (amounts.length === 1) {
    const lamports = parseSol(amounts[0]!);
    if (lamports === null || lamports <= 0n) throw new Error('Invalid amount');
    req.amount = lamports;
  }
  const refs = params.getAll('reference');
  if (refs.length > 4) throw new Error('Too many references');
  for (const r of refs) if (!isPublicKey(r)) throw new Error('Invalid reference');
  if (refs.length) req.reference = refs;
  for (const k of ['label', 'message', 'memo'] as const) {
    if (params.getAll(k).length > 1) throw new Error(`Invalid ${k}`);
    const v = cleanText(params.get(k), k);
    if (v) req[k] = v;
  }
  return req;
}
