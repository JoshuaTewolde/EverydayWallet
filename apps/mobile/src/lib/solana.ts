import type { Keypair } from '@solana/web3.js';
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type ParsedTransactionWithMeta,
} from '@solana/web3.js';
import { Buffer } from 'buffer';
import { RPC_URL } from './config';

export const connection = new Connection(RPC_URL, 'confirmed');
const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
/** Memo prefix the sender adds so the receiver can show "Paid by <name>". */
const FROM_PREFIX = 'tap:from:';
/** Rough fee buffer so we can warn before signing. */
export const FEE_LAMPORTS = 5000n;

export async function getBalance(pub: PublicKey): Promise<bigint> {
  return BigInt(await connection.getBalance(pub, 'confirmed'));
}

export async function airdrop(pub: PublicKey, sol = 1): Promise<string> {
  const sig = await connection.requestAirdrop(pub, sol * LAMPORTS_PER_SOL);
  const bh = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
  return sig;
}

export interface SendParams {
  from: Keypair;
  to: string;
  lamports: bigint;
  reference?: string[];
  memo?: string;
  senderName?: string;
}

/** Build, sign, send a native SOL transfer (Solana Pay style), wait for `confirmed`. */
export async function sendSol(p: SendParams): Promise<string> {
  const ix = SystemProgram.transfer({
    fromPubkey: p.from.publicKey,
    toPubkey: new PublicKey(p.to),
    lamports: p.lamports,
  });
  // Solana Pay: references are read-only non-signer keys on the transfer instruction.
  for (const r of p.reference ?? []) {
    ix.keys.push({ pubkey: new PublicKey(r), isSigner: false, isWritable: false });
  }
  const tx = new Transaction();
  if (p.memo) tx.add(memoIx(p.memo, p.from.publicKey));
  if (p.senderName) tx.add(memoIx(FROM_PREFIX + p.senderName.slice(0, 40), p.from.publicKey));
  tx.add(ix);
  const bh = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = bh.blockhash;
  tx.feePayer = p.from.publicKey;
  tx.sign(p.from);
  const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  const res = await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
  if (res.value.err) throw new Error('Transaction failed on-chain');
  return sig;
}

function memoIx(text: string, signer: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM,
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    data: Buffer.from(text, 'utf8'),
  });
}

/** Plain-English error for anything thrown while sending. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (
    /insufficient (funds|lamports)|0x1\b|Attempt to debit an account but found no record/i.test(msg)
  )
    return 'Not enough SOL (remember the small network fee). Get test SOL and try again.';
  if (/blockhash|block height exceeded|expired/i.test(msg))
    return 'The network took too long. Nothing was sent; try again.';
  if (/failed to fetch|network|ECONN|timeout/i.test(msg))
    return "Can't reach Solana devnet. Check your connection and try again.";
  if (/429|too many requests|rate/i.test(msg))
    return 'Devnet is rate-limiting us. Wait a moment, or use faucet.solana.com.';
  return msg.length > 160 ? `${msg.slice(0, 160)}…` : msg;
}

export interface Activity {
  sig: string;
  time: number | null;
  /** + received, - sent (lamports, including fee for sends). */
  delta: bigint;
  counterparty: string | null;
  fromName: string | null;
  ok: boolean;
}

function memoName(tx: ParsedTransactionWithMeta): string | null {
  for (const ix of tx.transaction.message.instructions) {
    if ('parsed' in ix && ix.program === 'spl-memo' && typeof ix.parsed === 'string') {
      if (ix.parsed.startsWith(FROM_PREFIX)) return ix.parsed.slice(FROM_PREFIX.length);
    }
  }
  // Logs fallback: 'Program log: Memo (len N): "tap:from:Sam"'
  for (const l of tx.meta?.logMessages ?? []) {
    const m = /Memo \(len \d+\): "tap:from:(.*)"$/.exec(l);
    if (m) return m[1] ?? null;
  }
  return null;
}

function toActivity(
  sig: string,
  me: string,
  tx: ParsedTransactionWithMeta | null,
): Activity | null {
  if (!tx?.meta) return null;
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  const i = keys.indexOf(me);
  if (i < 0) return null;
  const delta = BigInt(tx.meta.postBalances[i]! - tx.meta.preBalances[i]!);
  let counterparty: string | null = null;
  for (const ix of tx.transaction.message.instructions) {
    if ('parsed' in ix && ix.program === 'system' && ix.parsed?.type === 'transfer') {
      const info = ix.parsed.info as { source: string; destination: string };
      counterparty = info.source === me ? info.destination : info.source;
    }
  }
  return {
    sig,
    time: tx.blockTime ? tx.blockTime * 1000 : null,
    delta,
    counterparty,
    fromName: memoName(tx),
    ok: tx.meta.err == null,
  };
}

export async function getActivity(pub: PublicKey, limit = 15): Promise<Activity[]> {
  const sigs = await connection.getSignaturesForAddress(pub, { limit });
  if (!sigs.length) return [];
  const txs = await connection.getParsedTransactions(
    sigs.map((s) => s.signature),
    { maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
  );
  const me = pub.toBase58();
  return sigs
    .map((s, i) => toActivity(s.signature, me, txs[i] ?? null))
    .filter((a): a is Activity => a !== null);
}

/**
 * Solana Pay `findReference` + validate: look for a confirmed tx carrying `reference`
 * that paid `recipient` at least `amount`. Returns null if not (yet) found.
 */
export async function findPayment(
  reference: string,
  recipient: string,
  amount?: bigint,
): Promise<Activity | null> {
  const sigs = await connection.getSignaturesForAddress(
    new PublicKey(reference),
    { limit: 5 },
    'confirmed',
  );
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await connection.getParsedTransaction(s.signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
    const a = toActivity(s.signature, recipient, tx);
    if (a && a.ok && a.delta > 0n && (amount === undefined || a.delta >= amount)) return a;
  }
  return null;
}
