/**
 * Bitcoin balance via Breez SDK (Spark), regtest, running as WASM inside the Capacitor WebView.
 * Seed: a BIP39 mnemonic generated on-device, kept in the same secure storage as the Solana key.
 * API key: VITE_BREEZ_API_KEY, baked into the APK at build time (it is not a wallet secret).
 *
 * Verified against @breeztech/breez-sdk-spark 0.28.4 (same version as the games app).
 */
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import initBreez, {
  connect,
  defaultConfig,
  type BreezSdk,
  type Payment,
  type PrepareSendPaymentResponse,
} from '@breeztech/breez-sdk-spark/web';
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

export const BREEZ_NETWORK = 'regtest' as const;
export const BREEZ_API_KEY: string = import.meta.env.VITE_BREEZ_API_KEY ?? '';
export const BREEZ_ENABLED = BREEZ_API_KEY.length > 0;

const SEED_KEY = 'tap.breez.mnemonic';

let wasmReady: Promise<void> | null = null;
let sdkPromise: Promise<BreezSdk> | null = null;

async function getOrCreateMnemonic(): Promise<string> {
  const existing = await SecureStorage.getItem(SEED_KEY);
  if (existing && validateMnemonic(existing, wordlist)) return existing;
  const m = generateMnemonic(wordlist, 128);
  await SecureStorage.setItem(SEED_KEY, m);
  return m;
}

export async function exportMnemonic(): Promise<string | null> {
  return SecureStorage.getItem(SEED_KEY);
}

export async function wipeBreez(): Promise<void> {
  try {
    if (sdkPromise) await (await sdkPromise).disconnect();
  } catch {
    // ignore
  }
  sdkPromise = null;
  await SecureStorage.removeItem(SEED_KEY);
}

/** Connect once per app session. Throws a readable error if Breez is unavailable. */
export function getSdk(): Promise<BreezSdk> {
  if (!BREEZ_ENABLED) return Promise.reject(new Error('Bitcoin is not configured in this build.'));
  sdkPromise ??= (async () => {
    wasmReady ??= initBreez();
    await wasmReady;
    const mnemonic = await getOrCreateMnemonic();
    const config = defaultConfig(BREEZ_NETWORK);
    config.apiKey = BREEZ_API_KEY;
    return connect({
      config,
      seed: { type: 'mnemonic', mnemonic },
      storageDir: `tap-breez-${BREEZ_NETWORK}`,
    });
  })().catch((e) => {
    sdkPromise = null; // allow retry
    throw e;
  });
  return sdkPromise;
}

export async function btcBalance(): Promise<number> {
  const sdk = await getSdk();
  return (await sdk.getInfo({ ensureSynced: false })).balanceSats;
}

/** Reusable Spark address (no amount): for direct transfers from the games app. */
export async function sparkAddress(): Promise<string> {
  const sdk = await getSdk();
  return (await sdk.receivePayment({ paymentMethod: { type: 'sparkAddress' } })).paymentRequest;
}

/** Payment request for a tap: a Spark invoice if an amount is set, else our Spark address. */
export async function createBtcRequest(amountSats?: number, description?: string): Promise<string> {
  const sdk = await getSdk();
  if (!amountSats) return sparkAddress();
  const r = await sdk.receivePayment({
    paymentMethod: {
      type: 'sparkInvoice',
      amount: BigInt(amountSats),
      description: description || undefined,
      expiryTime: Math.floor(Date.now() / 1000) + 3600,
    },
  });
  return r.paymentRequest;
}

export interface BtcQuote {
  prepare: PrepareSendPaymentResponse;
  amountSats: number;
  feeSats: number;
}

/** Validate + price a payment request. `amountSats` only needed for amount-less requests. */
export async function quoteBtc(request: string, amountSats?: number): Promise<BtcQuote> {
  const sdk = await getSdk();
  const prepare = await sdk.prepareSendPayment({
    paymentRequest: { type: 'input', input: request.trim() },
    amount: amountSats ? BigInt(amountSats) : undefined,
  });
  const m = prepare.paymentMethod;
  const feeSats =
    m.type === 'sparkAddress' || m.type === 'sparkInvoice'
      ? Number(m.fee)
      : m.type === 'bolt11Invoice'
        ? m.lightningFeeSats + (m.sparkTransferFeeSats ?? 0)
        : 0;
  return { prepare, amountSats: Number(prepare.amount), feeSats };
}

/** Does this request already carry an amount? (Spark invoice / BOLT11 with amount.) */
export async function requestAmount(request: string): Promise<number | null> {
  const sdk = await getSdk();
  const input = await sdk.parse(request.trim());
  if (input.type === 'sparkInvoice' && input.amount) return Number(input.amount);
  if (input.type === 'bolt11Invoice' && input.amountMsat)
    return Math.floor(input.amountMsat / 1000);
  if (
    input.type === 'sparkAddress' ||
    input.type === 'sparkInvoice' ||
    input.type === 'bolt11Invoice'
  )
    return null;
  throw new Error('That is not a Spark address or invoice.');
}

export async function sendBtc(quote: BtcQuote, idempotencyKey: string): Promise<Payment> {
  const sdk = await getSdk();
  const { payment } = await sdk.sendPayment({ prepareResponse: quote.prepare, idempotencyKey });
  if (payment.status === 'failed') throw new Error('Bitcoin payment failed');
  return payment;
}

/** Listen for received payments; returns an unsubscribe. */
export function onBtcEvent(
  listener: (e: { kind: 'received' | 'changed'; payment?: Payment }) => void,
) {
  let id: string | null = null;
  let cancelled = false;
  void getSdk()
    .then((sdk) =>
      sdk.addEventListener({
        onEvent: (e) => {
          if (e.type === 'paymentSucceeded' && e.payment.paymentType === 'receive') {
            listener({ kind: 'received', payment: e.payment });
          } else if (
            e.type === 'synced' ||
            e.type === 'paymentSucceeded' ||
            e.type === 'paymentFailed' ||
            e.type === 'claimedDeposits'
          ) {
            listener({ kind: 'changed' });
          }
        },
      }),
    )
    .then((x) => {
      id = x;
      if (cancelled) void getSdk().then((s) => s.removeEventListener(x));
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    if (id) void getSdk().then((s) => s.removeEventListener(id!));
  };
}

/** Did a receive payment matching this request land (after `since`, unix seconds)? */
export function matchesRequest(p: Payment, request: string, since: number, amountSats?: number) {
  if (p.paymentType !== 'receive' || p.status !== 'completed') return false;
  if (p.timestamp < since - 5) return false;
  const inv = p.details?.type === 'spark' ? p.details.invoiceDetails?.invoice : undefined;
  if (inv) return inv === request;
  return amountSats ? Number(p.amount) >= amountSats : true;
}

export async function recentBtcPayments(limit = 15): Promise<Payment[]> {
  const sdk = await getSdk();
  return (await sdk.listPayments({ limit })).payments;
}

export function friendlyBtcError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/insufficient|not enough/i.test(msg)) return 'Not enough sats for this payment plus fees.';
  if (/network|fetch|connect|timeout/i.test(msg))
    return "Can't reach the Breez/Spark network. Try again.";
  if (/invalid|parse|unsupported/i.test(msg))
    return 'That bitcoin request is not valid on regtest.';
  return msg.length > 160 ? `${msg.slice(0, 160)}…` : msg;
}
