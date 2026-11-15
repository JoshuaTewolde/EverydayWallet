import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { Keypair } from '@solana/web3.js';
import { NfcTap, type NfcStatus } from '@tap/capacitor-nfc-tap';
import {
  buildTransferUrl,
  encodeTapPayload,
  formatSol,
  formatUsd,
  parseSats,
  parseSol,
  satsToUsd,
  solToUsd,
  usdToLamports,
  usdToSats,
} from '@tap/shared';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Button,
  Card,
  ErrorText,
  Qr,
  RailToggle,
  SatsAmount,
  ScreenHead,
  SolAmount,
  TapPulse,
} from '../design/components';
import { scanReceipt } from '../lib/api';
import {
  BREEZ_ENABLED,
  createBtcRequest,
  friendlyBtcError,
  matchesRequest,
  onBtcEvent,
  recentBtcPayments,
  sparkAddress,
} from '../lib/breez';
import { explorerTx, shortAddr } from '../lib/config';
import { nameFor } from '../lib/contacts';
import { useRail } from '../lib/rail';
import { findPayment } from '../lib/solana';
import { useStore, useWallet } from '../lib/store';

interface Paid {
  title: string;
  amount: ReactNode;
  link?: string;
}

/** A live request: what we serve over NFC/QR, and how we find out it was paid. */
interface Request {
  payload: string;
  qr: string;
  amount: ReactNode;
  memo: string;
  /** Start watching for payment; returns a cleanup. */
  watch: (onPaid: (p: Paid) => void) => () => void;
}

export function Receive() {
  const wallet = useWallet();
  const { price, btcPrice, contacts, refresh, refreshBtc } = useStore();
  const [rail, setRail] = useRail();
  const [amountText, setAmountText] = useState('');
  const [memo, setMemo] = useState('');
  const [request, setRequest] = useState<Request | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const isBtc = rail === 'bitcoin';
  const solAmount = !isBtc && amountText.trim() ? parseSol(amountText) : undefined;
  const satsAmount = isBtc && amountText.trim() ? parseSats(amountText) : undefined;
  const amountInvalid = solAmount === null || solAmount === 0n || satsAmount === null;

  function startSol() {
    const reference = Keypair.generate().publicKey.toBase58();
    const recipient = wallet.keypair.publicKey.toBase58();
    const amount = solAmount ?? undefined;
    const url = buildTransferUrl({
      recipient,
      amount,
      reference: [reference],
      label: wallet.nickname,
      message: memo.trim() || undefined,
    });
    setRequest({
      payload: encodeTapPayload({ v: 1, rail: 'solana', label: wallet.nickname, url }),
      qr: url,
      memo: memo.trim(),
      amount: amount ? (
        <SolAmount lamports={amount} price={price} size="lg" />
      ) : (
        <strong>Any amount of SOL</strong>
      ),
      watch: (onPaid) => {
        let live = true;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
          try {
            const found = await findPayment(reference, recipient, amount);
            if (found && live) {
              const who =
                nameFor(contacts, found.counterparty) ??
                found.fromName ??
                (found.counterparty ? shortAddr(found.counterparty) : 'someone');
              void refresh();
              return onPaid({
                title: `Paid by ${who}`,
                amount: <SolAmount lamports={found.delta} price={price} size="lg" />,
                link: explorerTx(found.sig),
              });
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
      },
    });
  }

  async function startBtc() {
    const amount = satsAmount ?? undefined;
    const since = Math.floor(Date.now() / 1000);
    const req = await createBtcRequest(amount, memo.trim() || undefined);
    setRequest({
      payload: encodeTapPayload({ v: 1, rail: 'bitcoin', label: wallet.nickname, url: req }),
      qr: req,
      memo: memo.trim(),
      amount: amount ? (
        <SatsAmount sats={amount} price={btcPrice} size="lg" />
      ) : (
        <strong>Any amount of sats</strong>
      ),
      watch: (onPaid) => {
        let done = false;
        const hit = (sats: number) => {
          if (done) return;
          done = true;
          void refreshBtc();
          onPaid({
            title: 'Paid ✓',
            amount: <SatsAmount sats={sats} price={btcPrice} size="lg" />,
          });
        };
        const off = onBtcEvent((e) => {
          if (e.payment && matchesRequest(e.payment, req, since, amount))
            hit(Number(e.payment.amount));
        });
        // Belt and braces: events can be missed while the WebView is paused.
        const t = setInterval(() => {
          void recentBtcPayments(10)
            .then((ps) => {
              const p = ps.find((x) => matchesRequest(x, req, since, amount));
              if (p) hit(Number(p.amount));
            })
            .catch(() => {});
        }, 5000);
        return () => {
          done = true;
          off();
          clearInterval(t);
        };
      },
    });
  }

  async function start() {
    if (amountInvalid) return setError('Enter a valid amount, or leave it empty.');
    setError(null);
    setBusy(true);
    try {
      if (isBtc) await startBtc();
      else startSol();
    } catch (e) {
      setError(friendlyBtcError(e));
    } finally {
      setBusy(false);
    }
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
      const rate = isBtc ? btcPrice : price;
      const unit = isBtc ? 'sats' : 'SOL';
      if (r.total == null || r.confidence < 0.6) {
        setScanNote("Couldn't read the total confidently. Please type the amount.");
      } else if (cur !== 'USD') {
        setScanNote(
          `Total is ${r.total} ${cur}. Only USD converts automatically; type the ${unit}.`,
        );
      } else if (!rate) {
        setScanNote(`Total ${formatUsd(r.total)}. No price feed right now; type the ${unit}.`);
      } else {
        if (isBtc) {
          const sats = usdToSats(r.total, rate);
          if (sats) setAmountText(String(sats));
        } else {
          const lamports = usdToLamports(r.total, rate);
          if (lamports) setAmountText(formatSol(lamports));
        }
        setScanNote(
          `${r.merchant ?? 'Receipt'}: ${formatUsd(r.total)} at ${formatUsd(rate)}/${isBtc ? 'BTC' : 'SOL'}. Check before sharing.`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(msg)) setScanNote(msg);
    } finally {
      setScanning(false);
    }
  }

  const usdHint =
    solAmount && price
      ? formatUsd(solToUsd(solAmount, price))
      : satsAmount && btcPrice
        ? formatUsd(satsToUsd(satsAmount, btcPrice))
        : null;

  return (
    <main className="screen">
      <ScreenHead title="Receive" back="/" />
      {!request ? (
        <>
          {BREEZ_ENABLED && (
            <RailToggle
              rail={rail}
              onChange={(r) => {
                setRail(r);
                setAmountText('');
              }}
            />
          )}
          <Card raised>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                void start();
              }}
            >
              <label className="field">
                {isBtc ? 'Amount in sats (optional)' : 'Amount in SOL (optional)'}
                <input
                  className="input"
                  inputMode={isBtc ? 'numeric' : 'decimal'}
                  placeholder="Payer chooses"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                />
              </label>
              {usdHint && <span className="muted">≈ {usdHint}</span>}
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
              <Button type="submit" variant="teal" size="lg" block busy={busy}>
                Ready to be tapped
              </Button>
            </form>
          </Card>
          {isBtc && <SparkAddressCard />}
        </>
      ) : (
        <Waiting request={request} onNew={() => setRequest(null)} />
      )}
    </main>
  );
}

/** Our reusable Spark address: lets the games app send sats here with its manual send. */
function SparkAddressCard() {
  const [addr, setAddr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!show || addr) return;
    sparkAddress().then(setAddr, (e) => setErr(friendlyBtcError(e)));
  }, [show, addr]);
  return (
    <Card dashed>
      <div className="stack">
        <strong>Move sats in from the games app</strong>
        <span className="muted">
          In the games app, use Send and paste or scan this Spark address (regtest).
        </span>
        {!show ? (
          <Button block onClick={() => setShow(true)}>
            Show my Spark address
          </Button>
        ) : addr ? (
          <>
            <Qr value={addr} label="Your Spark address" />
            <span className="mono">{addr}</span>
            <Button
              block
              onClick={() =>
                void navigator.clipboard.writeText(addr).catch(() => window.prompt('Copy:', addr))
              }
            >
              Copy address
            </Button>
          </>
        ) : (
          <ErrorText>{err ?? 'Loading…'}</ErrorText>
        )}
      </div>
    </Card>
  );
}

function Waiting({ request, onNew }: { request: Request; onNew: () => void }) {
  const [nfc, setNfc] = useState<{ status: NfcStatus; hce: boolean } | null>(null);
  const [served, setServed] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [paid, setPaid] = useState<Paid | null>(null);
  const [nfcError, setNfcError] = useState<string | null>(null);

  // Serve the payload over NFC while this screen is open and unpaid.
  useEffect(() => {
    if (paid) return;
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
  }, [request.payload, paid]);

  // Watch for the payment.
  useEffect(() => {
    if (paid) return;
    return request.watch((p) => {
      setPaid(p);
      void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    });
  }, [request, paid]);

  const recheckNfc = async () => {
    const s = await NfcTap.getStatus();
    setNfc(s);
    if (s.status === 'enabled' && s.hce) await NfcTap.setPayload({ payload: request.payload });
  };

  if (paid) {
    return (
      <Card raised tone="teal">
        <div className="stack center">
          <div className="big-check">✓</div>
          <h2>{paid.title}</h2>
          {paid.amount}
          {paid.link && (
            <a href={paid.link} target="_blank" rel="noreferrer">
              View on explorer
            </a>
          )}
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
          {request.amount}
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
        <Qr value={request.qr} label="Payment request QR code" />
      ) : (
        <Button block onClick={() => setShowQr(true)}>
          Show QR code instead
        </Button>
      )}
      <p className="muted center">Waiting for payment…</p>
      <Button block onClick={onNew}>
        Cancel
      </Button>
    </div>
  );
}
