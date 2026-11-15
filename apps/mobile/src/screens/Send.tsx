import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { NfcTap } from '@tap/capacitor-nfc-tap';
import {
  formatUsd,
  isPublicKey,
  parseSol,
  parseTapPayload,
  solToUsd,
  type TransferRequest,
} from '@tap/shared';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, ErrorText, ScreenHead, SolAmount, TapPulse } from '../design/components';
import { IS_NATIVE, explorerTx, shortAddr } from '../lib/config';
import { nameFor, saveContact } from '../lib/contacts';
import { FEE_LAMPORTS, friendlyError, sendSol } from '../lib/solana';
import { useStore, useWallet } from '../lib/store';

interface Target {
  label: string;
  request: TransferRequest;
}

type Phase =
  | { kind: 'pick' }
  | { kind: 'confirm'; target: Target }
  | { kind: 'sending'; target: Target; lamports: bigint }
  | { kind: 'done'; target: Target; lamports: bigint; sig: string };

export function Send() {
  const location = useLocation();
  const prefill = (location.state as { address?: string; name?: string } | null) ?? null;
  const [phase, setPhase] = useState<Phase>(() =>
    prefill?.address && isPublicKey(prefill.address)
      ? {
          kind: 'confirm',
          target: { label: prefill.name ?? '', request: { recipient: prefill.address } },
        }
      : { kind: 'pick' },
  );

  return (
    <main className="screen">
      <ScreenHead title="Pay" back="/" />
      {phase.kind === 'pick' && (
        <Pick onTarget={(target) => setPhase({ kind: 'confirm', target })} />
      )}
      {(phase.kind === 'confirm' || phase.kind === 'sending') && (
        <Confirm
          target={phase.target}
          sending={phase.kind === 'sending'}
          onCancel={() => setPhase({ kind: 'pick' })}
          onSending={(lamports) => setPhase({ kind: 'sending', target: phase.target, lamports })}
          onDone={(lamports, sig) =>
            setPhase({ kind: 'done', target: phase.target, lamports, sig })
          }
          onFailed={() => setPhase({ kind: 'confirm', target: phase.target })}
        />
      )}
      {phase.kind === 'done' && <Done {...phase} />}
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
    onTarget({ label: p.label, request: p.request });
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
    if (isPublicKey(v)) return onTarget({ label: '', request: { recipient: v } });
    const p = parseTapPayload(v);
    if (p.ok) return onTarget({ label: p.label, request: p.request });
    setManualError('Paste a Solana address or a solana: payment link.');
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
            Or paste an address / payment link
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

function Confirm({
  target,
  sending,
  onCancel,
  onSending,
  onDone,
  onFailed,
}: {
  target: Target;
  sending: boolean;
  onCancel: () => void;
  onSending: (lamports: bigint) => void;
  onDone: (lamports: bigint, sig: string) => void;
  onFailed: () => void;
}) {
  const wallet = useWallet();
  const { balance, price, contacts, refresh } = useStore();
  const fixed = target.request.amount;
  const [amountText, setAmountText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const lamports = fixed ?? (amountText.trim() ? parseSol(amountText) : null);
  const recipient = target.request.recipient;
  const name = target.label || nameFor(contacts, recipient) || shortAddr(recipient);
  const self = recipient === wallet.keypair.publicKey.toBase58();

  async function pay() {
    if (!lamports || lamports <= 0n) return setError('Enter an amount.');
    if (self) return setError("That's your own address.");
    if (balance !== null && balance < lamports + FEE_LAMPORTS) {
      return setError('Not enough SOL for this payment plus the network fee. Get test SOL first.');
    }
    setError(null);
    onSending(lamports);
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
      onDone(lamports, sig);
    } catch (e) {
      void Haptics.notification({ type: NotificationType.Error }).catch(() => {});
      setError(friendlyError(e));
      onFailed();
    }
  }

  return (
    <Card raised>
      <div className="stack">
        <span className="eyebrow">Pay</span>
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

function Done({ target, lamports, sig }: { target: Target; lamports: bigint; sig: string }) {
  const navigate = useNavigate();
  const { price, contacts, setContacts } = useStore();
  const recipient = target.request.recipient;
  const known = nameFor(contacts, recipient);
  const [name, setName] = useState(target.label);
  return (
    <Card raised tone="teal">
      <div className="stack center">
        <div className="big-check">✓</div>
        <h2>Sent to {known ?? (target.label || shortAddr(recipient))}</h2>
        <SolAmount lamports={lamports} price={price} size="lg" />
        <a href={explorerTx(sig)} target="_blank" rel="noreferrer">
          View on explorer
        </a>
        {!known && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim())
                void saveContact({ name: name.trim(), address: recipient }).then(setContacts);
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
