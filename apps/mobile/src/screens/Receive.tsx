import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { Keypair } from '@solana/web3.js';
import { NfcTap, type NfcStatus } from '@tap/capacitor-nfc-tap';
import {
  buildTransferUrl,
  encodeTapPayload,
  formatSol,
  formatUsd,
  parseSol,
  solToUsd,
  usdToLamports,
} from '@tap/shared';
import { useEffect, useState } from 'react';
import { Button, Card, ErrorText, Qr, ScreenHead, SolAmount, TapPulse } from '../design/components';
import { scanReceipt } from '../lib/api';
import { explorerTx, shortAddr } from '../lib/config';
import { nameFor } from '../lib/contacts';
import { findPayment, type Activity } from '../lib/solana';
import { useStore, useWallet } from '../lib/store';

interface Request {
  amount?: bigint;
  memo: string;
  reference: string;
  payload: string;
  url: string;
}

export function Receive() {
  const wallet = useWallet();
  const { price, contacts, refresh } = useStore();
  const [amountText, setAmountText] = useState('');
  const [memo, setMemo] = useState('');
  const [request, setRequest] = useState<Request | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const amount = amountText.trim() ? parseSol(amountText) : undefined;
  const amountInvalid = amount === null || amount === 0n;

  function start() {
    if (amountInvalid) return setError('Enter a valid amount, or leave it empty.');
    setError(null);
    const reference = Keypair.generate().publicKey.toBase58();
    const url = buildTransferUrl({
      recipient: wallet.keypair.publicKey.toBase58(),
      amount: amount ?? undefined,
      reference: [reference],
      label: wallet.nickname,
      message: memo.trim() || undefined,
    });
    const payload = encodeTapPayload({ v: 1, rail: 'solana', label: wallet.nickname, url });
    setRequest({ amount: amount ?? undefined, memo: memo.trim(), reference, payload, url });
  }

  async function snapReceipt() {
    setScanNote(null);
    setScanning(true);
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        quality: 60,
        width: 1280,
        correctOrientation: true,
      });
      if (!photo.base64String) throw new Error('No photo taken');
      const r = await scanReceipt(photo.base64String, `image/${photo.format || 'jpeg'}`);
      if (r.merchant) setMemo(r.merchant.slice(0, 60));
      const cur = (r.currency ?? 'USD').toUpperCase();
      if (r.total == null || r.confidence < 0.6) {
        setScanNote("Couldn't read the total confidently. Please type the amount.");
      } else if (cur !== 'USD') {
        setScanNote(
          `Total is ${r.total} ${cur}. Only USD converts automatically; type the SOL amount.`,
        );
      } else if (!price) {
        setScanNote(`Total ${formatUsd(r.total)}. No SOL price right now; type the SOL amount.`);
      } else {
        const lamports = usdToLamports(r.total, price);
        if (lamports) setAmountText(formatSol(lamports));
        setScanNote(
          `${r.merchant ?? 'Receipt'}: ${formatUsd(r.total)} at ${formatUsd(price)}/SOL. Check before sharing.`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(msg)) setScanNote(msg);
    } finally {
      setScanning(false);
    }
  }

  return (
    <main className="screen">
      <ScreenHead title="Receive" back="/" />
      {!request ? (
        <Card raised>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              start();
            }}
          >
            <label className="field">
              Amount in SOL (optional)
              <input
                className="input"
                inputMode="decimal"
                placeholder="Payer chooses"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
              />
            </label>
            {amount && price ? (
              <span className="muted">≈ {formatUsd(solToUsd(amount, price))}</span>
            ) : null}
            <label className="field">
              What's it for? (optional)
              <input
                className="input"
                maxLength={60}
                placeholder="Pizza"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </label>
            <Button variant="accent" block busy={scanning} onClick={() => void snapReceipt()}>
              Scan a receipt
            </Button>
            {scanNote && <p className="muted">{scanNote}</p>}
            <ErrorText>{error}</ErrorText>
            <Button type="submit" variant="teal" size="lg" block>
              Ready to be tapped
            </Button>
          </form>
        </Card>
      ) : (
        <Waiting
          request={request}
          recipient={wallet.keypair.publicKey.toBase58()}
          contactsName={(a) => nameFor(contacts, a)}
          price={price}
          onPaid={refresh}
          onNew={() => {
            setRequest(null);
          }}
        />
      )}
    </main>
  );
}

function Waiting({
  request,
  recipient,
  contactsName,
  price,
  onPaid,
  onNew,
}: {
  request: Request;
  recipient: string;
  contactsName: (a: string | null) => string | null;
  price: number | null;
  onPaid: () => Promise<void>;
  onNew: () => void;
}) {
  const [nfc, setNfc] = useState<{ status: NfcStatus; hce: boolean } | null>(null);
  const [served, setServed] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [paid, setPaid] = useState<Activity | null>(null);
  const [nfcError, setNfcError] = useState<string | null>(null);

  // Serve the payload over NFC while this screen is open.
  useEffect(() => {
    let live = true;
    const handle = NfcTap.addListener('tapServed', () => {
      setServed(true);
      void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    });
    void (async () => {
      try {
        const s = await NfcTap.getStatus();
        if (!live) return;
        setNfc(s);
        if (s.status === 'unsupported' || !s.hce) {
          setShowQr(true);
          return;
        }
        await NfcTap.setPayload({ payload: request.payload });
      } catch (e) {
        if (live) setNfcError(e instanceof Error ? e.message : 'NFC unavailable; use the QR code.');
        setShowQr(true);
      }
    })();
    return () => {
      live = false;
      void handle.then((h) => h.remove());
      void NfcTap.clearPayload().catch(() => {});
    };
  }, [request.payload]);

  // Watch the chain for a payment carrying our reference.
  useEffect(() => {
    if (paid) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const found = await findPayment(request.reference, recipient, request.amount);
        if (found && live) {
          setPaid(found);
          void NfcTap.clearPayload().catch(() => {});
          void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
          void onPaid();
          return;
        }
      } catch {
        // transient RPC error: keep polling
      }
      if (live) timer = setTimeout(() => void poll(), 2500);
    };
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [request.reference, request.amount, recipient, paid, onPaid]);

  const recheckNfc = async () => {
    const s = await NfcTap.getStatus();
    setNfc(s);
    if (s.status === 'enabled' && s.hce) await NfcTap.setPayload({ payload: request.payload });
  };

  if (paid) {
    const who =
      contactsName(paid.counterparty) ??
      paid.fromName ??
      (paid.counterparty ? shortAddr(paid.counterparty) : 'someone');
    return (
      <Card raised tone="teal">
        <div className="stack center">
          <div className="big-check">✓</div>
          <h2>Paid by {who}</h2>
          <SolAmount lamports={paid.delta} price={price} size="lg" />
          <a href={explorerTx(paid.sig)} target="_blank" rel="noreferrer">
            View on explorer
          </a>
          <Button variant="primary" block onClick={onNew}>
            New request
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="stack">
      <Card raised>
        <div className="stack center">
          {request.amount ? (
            <SolAmount lamports={request.amount} price={price} size="lg" />
          ) : (
            <strong>Any amount</strong>
          )}
          {request.memo && <span className="muted">for {request.memo}</span>}
        </div>
      </Card>

      {nfc?.status === 'disabled' ? (
        <Card tone="sun">
          <div className="stack">
            <strong>NFC is off</strong>
            <Button variant="accent" block onClick={() => void NfcTap.openSettings()}>
              Turn on NFC
            </Button>
            <Button block onClick={() => void recheckNfc()}>
              I turned it on
            </Button>
          </div>
        </Card>
      ) : nfc && (nfc.status === 'unsupported' || !nfc.hce) ? (
        <p className="muted">This phone can't be tapped. Show the QR code instead.</p>
      ) : (
        <TapPulse
          label={
            served
              ? 'Sent your details… waiting for payment'
              : 'Ready to be tapped. Hold phones back to back.'
          }
        />
      )}
      <ErrorText>{nfcError}</ErrorText>

      {showQr ? (
        <Qr value={request.url} label="Payment request QR code" />
      ) : (
        <Button block onClick={() => setShowQr(true)}>
          Show QR code instead
        </Button>
      )}
      <p className="muted center">Waiting for payment on devnet…</p>
      <Button block onClick={onNew}>
        Cancel
      </Button>
    </div>
  );
}
