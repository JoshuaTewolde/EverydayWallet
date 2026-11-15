import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { NfcTap } from '@tap/capacitor-nfc-tap';
import {
  formatUsd,
  isPublicKey,
  parseSats,
  parseSol,
  parseTapPayload,
  satsToUsd,
  solToUsd,
  type ParsedTap,
  type TransferRequest,
} from '@tap/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  ErrorText,
  SatsAmount,
  ScreenHead,
  SolAmount,
  TapPulse,
} from '../design/components';
import {
  BREEZ_ENABLED,
  friendlyBtcError,
  quoteBtc,
  requestAmount,
  sendBtc,
  type BtcQuote,
} from '../lib/breez';
import { IS_NATIVE, explorerTx, shortAddr } from '../lib/config';
import { nameFor, saveContact } from '../lib/contacts';
import { FEE_LAMPORTS, friendlyError, sendSol } from '../lib/solana';
import { useStore, useWallet } from '../lib/store';

type Target =
  | { rail: 'solana'; label: string; request: TransferRequest }
  | { rail: 'bitcoin'; label: string; url: string };

interface Sent {
  title: string;
  amount: ReactNode;
  link?: string;
  /** Solana recipient, offered as a contact. */
  saveAddress?: string;
  label: string;
}

type Phase = { kind: 'pick' } | { kind: 'confirm'; target: Target } | { kind: 'done'; sent: Sent };

function toTarget(p: Extract<ParsedTap, { ok: true }>): Target {
  return p.rail === 'solana'
    ? { rail: 'solana', label: p.label, request: p.request }
    : { rail: 'bitcoin', label: p.label, url: p.url };
}

export function Send() {
  const location = useLocation();
  const prefill = (location.state as { address?: string; name?: string } | null) ?? null;
  const [phase, setPhase] = useState<Phase>(() =>
    prefill?.address && isPublicKey(prefill.address)
      ? {
          kind: 'confirm',
          target: {
            rail: 'solana',
            label: prefill.name ?? '',
            request: { recipient: prefill.address },
          },
        }
      : { kind: 'pick' },
  );
  const back = () => setPhase({ kind: 'pick' });
  const done = (sent: Sent) => setPhase({ kind: 'done', sent });

  return (
    <main className="screen">
      <ScreenHead title="Pay" back="/" />
      {phase.kind === 'pick' && (
        <Pick onTarget={(target) => setPhase({ kind: 'confirm', target })} />
      )}
      {phase.kind === 'confirm' && phase.target.rail === 'solana' && (
        <ConfirmSol target={phase.target} onCancel={back} onDone={done} />
      )}
      {phase.kind === 'confirm' && phase.target.rail === 'bitcoin' && (
        <ConfirmBtc target={phase.target} onCancel={back} onDone={done} />
      )}
      {phase.kind === 'done' && <Done sent={phase.sent} />}
    </main>
  );
}

// ---------------------------------------------------------------------------

function Pick({ onTarget }: { onTarget: (t: Target) => void }) {
  const [status, setStatus] = useState<'starting' | 'reading' | 'off' | 'none'>('starting');
  const [hint, setHint] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  const accept = (raw: string): boolean => {
    const p = parseTapPayload(raw);
    if (!p.ok) {
      setHint(p.error);
      return false;
    }
    if (p.rail === 'bitcoin' && !BREEZ_ENABLED) {
      setHint('This build has no bitcoin wallet.');
      return false;
    }
    onTarget(toTarget(p));
    return true;
  };

  useEffect(() => {
    let live = true;
    const subs = [
      NfcTap.addListener('payloadRead', ({ payload }) => {
        if (!live) return;
        void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
        if (!accept(payload)) void NfcTap.startReading().catch(() => {});
      }),
      NfcTap.addListener('readError', ({ message }) => live && setHint(message)),
    ];
    void (async () => {
      try {
        const s = await NfcTap.getStatus();
        if (!live) return;
        if (s.status === 'unsupported') return setStatus('none');
        if (s.status === 'disabled') return setStatus('off');
        await NfcTap.startReading();
        if (live) setStatus('reading');
      } catch (e) {
        if (live) {
          setStatus('none');
          setHint(e instanceof Error ? e.message : 'NFC unavailable');
        }
      }
    })();
    return () => {
      live = false;
      subs.forEach((s) => void s.then((h) => h.remove()));
      void NfcTap.stopReading().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function scanQr() {
    setHint(null);
    try {
      if (!IS_NATIVE) {
        const raw = window.prompt('Paste the QR contents');
        if (raw) accept(raw);
        return;
      }
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        await BarcodeScanner.installGoogleBarcodeScannerModule();
        setHint('Installing the QR scanner (one time). Try again in a few seconds.');
        return;
      }
      const { barcodes } = await BarcodeScanner.scan();
      const raw = barcodes[0]?.rawValue;
      if (raw) accept(raw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(msg)) setHint(`QR scan failed: ${msg}`);
    }
  }

  function submitManual() {
    setManualError(null);
    const v = manual.trim();
    if (isPublicKey(v)) return onTarget({ rail: 'solana', label: '', request: { recipient: v } });
    const p = parseTapPayload(v);
    if (p.ok && (p.rail === 'solana' || BREEZ_ENABLED)) return onTarget(toTarget(p));
    setManualError(
      BREEZ_ENABLED
        ? 'Paste a Solana address, a solana: link, or a Spark address/invoice.'
        : 'Paste a Solana address or a solana: payment link.',
    );
  }

  const recheck = async () => {
    const s = await NfcTap.getStatus();
    if (s.status === 'enabled') {
      await NfcTap.startReading();
      setStatus('reading');
    }
  };

  return (
    <div className="stack">
      {status === 'reading' || status === 'starting' ? (
        <TapPulse label="Hold the back of your phone to theirs" />
      ) : status === 'off' ? (
        <Card tone="sun">
          <div className="stack">
            <strong>NFC is off</strong>
            <Button variant="accent" block onClick={() => void NfcTap.openSettings()}>
              Turn on NFC
            </Button>
            <Button block onClick={() => void recheck()}>
              I turned it on
            </Button>
          </div>
        </Card>
      ) : (
        <p className="muted">This phone has no NFC. Scan their QR code or paste an address.</p>
      )}
      {hint && (
        <p className="error" role="alert">
          {hint}
        </p>
      )}

      <Button variant="accent" block onClick={() => void scanQr()}>
        Scan QR code
      </Button>

      <Card dashed>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            submitManual();
          }}
        >
          <label className="field">
            {BREEZ_ENABLED
              ? 'Or paste a Solana address / Spark address or invoice'
              : 'Or paste an address / payment link'}
            <input
              className="input mono"
              value={manual}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setManual(e.target.value)}
            />
          </label>
          <ErrorText>{manualError}</ErrorText>
          <Button type="submit" block disabled={!manual.trim()}>
            Continue
          </Button>
        </form>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ConfirmSol({
  target,
  onCancel,
  onDone,
}: {
  target: Extract<Target, { rail: 'solana' }>;
  onCancel: () => void;
  onDone: (s: Sent) => void;
}) {
  const wallet = useWallet();
  const { balance, price, contacts, refresh } = useStore();
  const fixed = target.request.amount;
  const [amountText, setAmountText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lamports = fixed ?? (amountText.trim() ? parseSol(amountText) : null);
  const recipient = target.request.recipient;
  const name = target.label || nameFor(contacts, recipient) || shortAddr(recipient);
  const self = recipient === wallet.keypair.publicKey.toBase58();

  async function pay() {
    if (sending) return;
    if (!lamports || lamports <= 0n) return setError('Enter an amount.');
    if (self) return setError("That's your own address.");
    if (balance !== null && balance < lamports + FEE_LAMPORTS) {
      return setError('Not enough SOL for this payment plus the network fee. Get test SOL first.');
    }
    setError(null);
    setSending(true);
    try {
      const sig = await sendSol({
        from: wallet.keypair,
        to: recipient,
        lamports,
        reference: target.request.reference,
        memo: target.request.memo,
        senderName: wallet.nickname,
      });
      void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      void refresh();
      onDone({
        title: `Sent to ${nameFor(contacts, recipient) ?? name}`,
        amount: <SolAmount lamports={lamports} price={price} size="lg" />,
        link: explorerTx(sig),
        saveAddress: nameFor(contacts, recipient) ? undefined : recipient,
        label: target.label,
      });
    } catch (e) {
      void Haptics.notification({ type: NotificationType.Error }).catch(() => {});
      setError(friendlyError(e));
      setSending(false);
    }
  }

  return (
    <Card raised>
      <div className="stack">
        <span className="eyebrow">Pay with SOL · devnet</span>
        <h2>{name}</h2>
        <span className="mono">{recipient}</span>
        {target.request.message && <span>“{target.request.message}”</span>}
        {fixed ? (
          <SolAmount lamports={fixed} price={price} size="lg" />
        ) : (
          <label className="field">
            Amount in SOL
            <input
              className="input"
              inputMode="decimal"
              autoFocus
              value={amountText}
              disabled={sending}
              onChange={(e) => setAmountText(e.target.value)}
            />
            {lamports && price ? (
              <span className="muted">≈ {formatUsd(solToUsd(lamports, price))}</span>
            ) : null}
          </label>
        )}
        {balance !== null && (
          <span className="muted">
            Your balance: <SolAmount lamports={balance} size="sm" />
          </span>
        )}
        <ErrorText>{error}</ErrorText>
        <Button
          variant="primary"
          size="lg"
          block
          busy={sending}
          disabled={!lamports || self}
          onClick={() => void pay()}
        >
          {sending ? 'Sending…' : error ? 'Retry' : 'Confirm & pay'}
        </Button>
        <Button block disabled={sending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function ConfirmBtc({
  target,
  onCancel,
  onDone,
}: {
  target: Extract<Target, { rail: 'bitcoin' }>;
  onCancel: () => void;
  onDone: (s: Sent) => void;
}) {
  const { btcBalance, btcPrice, refreshBtc } = useStore();
  /** undefined = still checking; null = payer chooses. */
  const [fixed, setFixed] = useState<number | null | undefined>(undefined);
  const [amountText, setAmountText] = useState('');
  const [quote, setQuote] = useState<BtcQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sats = fixed ?? (amountText.trim() ? parseSats(amountText) : null);
  const name = target.label || shortAddr(target.url);

  useEffect(() => {
    requestAmount(target.url).then(
      (a) => setFixed(a),
      (e) => {
        setFixed(null);
        setError(friendlyBtcError(e));
      },
    );
  }, [target.url]);

  // Re-quote (fee + validation) whenever the amount settles.
  useEffect(() => {
    setQuote(null);
    if (fixed === undefined || !sats) return;
    let live = true;
    const t = setTimeout(() => {
      setQuoting(true);
      quoteBtc(target.url, fixed ? undefined : sats)
        .then((q) => live && (setQuote(q), setError(null)))
        .catch((e) => live && setError(friendlyBtcError(e)))
        .finally(() => live && setQuoting(false));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [target.url, fixed, sats]);

  async function pay() {
    if (sending || !quote) return;
    if (btcBalance !== null && btcBalance < quote.amountSats + quote.feeSats) {
      return setError('Not enough sats for this payment plus fees.');
    }
    setError(null);
    setSending(true);
    try {
      await sendBtc(quote, crypto.randomUUID());
      void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      void refreshBtc();
      onDone({
        title: `Sent to ${name}`,
        amount: <SatsAmount sats={quote.amountSats} price={btcPrice} size="lg" />,
        label: target.label,
      });
    } catch (e) {
      void Haptics.notification({ type: NotificationType.Error }).catch(() => {});
      setError(friendlyBtcError(e));
      setSending(false);
    }
  }

  return (
    <Card raised>
      <div className="stack">
        <span className="eyebrow">Pay with bitcoin · regtest</span>
        <h2>{name}</h2>
        <span className="mono">{shortAddr(target.url)}</span>
        {fixed === undefined ? (
          <span className="muted">Checking request…</span>
        ) : fixed ? (
          <SatsAmount sats={fixed} price={btcPrice} size="lg" />
        ) : (
          <label className="field">
            Amount in sats
            <input
              className="input"
              inputMode="numeric"
              autoFocus
              value={amountText}
              disabled={sending}
              onChange={(e) => setAmountText(e.target.value)}
            />
            {sats && btcPrice ? (
              <span className="muted">≈ {formatUsd(satsToUsd(sats, btcPrice))}</span>
            ) : null}
          </label>
        )}
        {quote && <span className="muted">Network fee: {quote.feeSats} sats</span>}
        {btcBalance !== null && (
          <span className="muted">
            Your balance: <SatsAmount sats={btcBalance} size="sm" />
          </span>
        )}
        <ErrorText>{error}</ErrorText>
        <Button
          variant="primary"
          size="lg"
          block
          busy={sending || quoting}
          disabled={!quote}
          onClick={() => void pay()}
        >
          {sending ? 'Sending…' : error && quote ? 'Retry' : 'Confirm & pay'}
        </Button>
        <Button block disabled={sending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function Done({ sent }: { sent: Sent }) {
  const navigate = useNavigate();
  const { setContacts } = useStore();
  const [name, setName] = useState(sent.label);
  const [saved, setSaved] = useState(false);
  return (
    <Card raised tone="teal">
      <div className="stack center">
        <div className="big-check">✓</div>
        <h2>{sent.title}</h2>
        {sent.amount}
        {sent.link && (
          <a href={sent.link} target="_blank" rel="noreferrer">
            View on explorer
          </a>
        )}
        {sent.saveAddress && !saved && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && sent.saveAddress)
                void saveContact({ name: name.trim(), address: sent.saveAddress }).then((c) => {
                  setContacts(c);
                  setSaved(true);
                });
            }}
          >
            <input
              className="input"
              placeholder="Name"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" block>
              Save contact
            </Button>
          </form>
        )}
        <Button variant="primary" block onClick={() => navigate('/')}>
          Done
        </Button>
      </div>
    </Card>
  );
}
