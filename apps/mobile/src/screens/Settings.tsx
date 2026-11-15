import { NfcTap, type NfcStatus } from '@tap/capacitor-nfc-tap';
import { useEffect, useState } from 'react';
import { Button, Card, DevnetBadge, Qr, ScreenHead } from '../design/components';
import { RPC_URL, explorerAddress } from '../lib/config';
import { useStore, useWallet } from '../lib/store';
import { BREEZ_ENABLED, exportMnemonic, sparkAddress, wipeBreez } from '../lib/breez';
import { exportSecret, setNickname, wipeWallet } from '../lib/vault';

export function Settings() {
  const wallet = useWallet();
  const { setWallet } = useStore();
  const address = wallet.keypair.publicKey.toBase58();
  const [copied, setCopied] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [nfc, setNfc] = useState<{ status: NfcStatus; hce: boolean } | null>(null);
  const [name, setName] = useState(wallet.nickname);
  const [spark, setSpark] = useState<string | null>(null);
  const [seed, setSeed] = useState<string | null>(null);

  useEffect(() => {
    void NfcTap.getStatus()
      .then(setNfc)
      .catch(() => setNfc({ status: 'unsupported', hce: false }));
  }, []);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this:', text);
    }
  }

  return (
    <main className="screen">
      <ScreenHead title="Settings" />
      <DevnetBadge />

      <Card raised>
        <div className="stack">
          <span className="eyebrow">Your address</span>
          <span className="mono">{address}</span>
          <Qr value={address} label="Your Solana address" />
          <div className="actions">
            <Button onClick={() => void copy(address)}>{copied ? 'Copied!' : 'Copy'}</Button>
            <a className="btn" href={explorerAddress(address)} target="_blank" rel="noreferrer">
              Explorer
            </a>
          </div>
        </div>
      </Card>

      <Card>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim().slice(0, 40);
            if (!n) return;
            void setNickname(n).then(() => setWallet({ ...wallet, nickname: n }));
          }}
        >
          <label className="field">
            Nickname
            <input
              className="input"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button type="submit" block disabled={name.trim() === wallet.nickname}>
            Save nickname
          </Button>
        </form>
      </Card>

      <Card>
        <div className="stack">
          <span className="eyebrow">NFC</span>
          <span>
            {nfc === null
              ? 'Checking…'
              : nfc.status === 'enabled'
                ? `On${nfc.hce ? '' : ' (this phone can pay but cannot be tapped)'}`
                : nfc.status === 'disabled'
                  ? 'Off'
                  : 'Not available on this phone'}
          </span>
          {nfc?.status === 'disabled' && (
            <Button variant="accent" onClick={() => void NfcTap.openSettings()}>
              Open NFC settings
            </Button>
          )}
          <span className="muted">Network: Solana devnet ({RPC_URL})</span>
        </div>
      </Card>

      {BREEZ_ENABLED && (
        <Card>
          <div className="stack">
            <span className="eyebrow">Bitcoin · regtest (Breez Spark)</span>
            {spark ? (
              <>
                <span className="mono">{spark}</span>
                <Button onClick={() => void copy(spark)}>Copy Spark address</Button>
              </>
            ) : (
              <Button
                onClick={() =>
                  void sparkAddress().then(setSpark, (e: unknown) =>
                    window.alert(e instanceof Error ? e.message : 'Bitcoin wallet unavailable'),
                  )
                }
              >
                Show Spark address
              </Button>
            )}
            <span className="muted">
              The Breez API key ships inside this APK (it identifies the app, it is not a wallet
              key).
            </span>
          </div>
        </Card>
      )}

      <Card tone="sun">
        <div className="stack">
          <span className="eyebrow">Danger zone</span>
          {secret ? (
            <>
              <p>
                Anyone with this key controls this wallet. Devnet only. Never paste it into a
                mainnet wallet.
              </p>
              <span className="mono">{secret}</span>
              <Button onClick={() => void copy(secret)}>Copy key</Button>
              <Button onClick={() => setSecret(null)}>Hide</Button>
            </>
          ) : (
            <Button
              onClick={() => {
                if (window.confirm('Show your secret key? Anyone who sees it can take your funds.'))
                  setSecret(exportSecret(wallet));
              }}
            >
              Export secret key
            </Button>
          )}
          {BREEZ_ENABLED &&
            (seed ? (
              <>
                <p>Bitcoin recovery words (regtest only). Anyone with them controls your sats.</p>
                <span className="mono">{seed}</span>
                <Button onClick={() => setSeed(null)}>Hide words</Button>
              </>
            ) : (
              <Button
                onClick={() => {
                  if (
                    window.confirm(
                      'Show your bitcoin recovery words? Anyone who sees them can take your sats.',
                    )
                  )
                    void exportMnemonic().then((m) => setSeed(m ?? 'No bitcoin wallet yet.'));
                }}
              >
                Export bitcoin recovery words
              </Button>
            ))}
          <Button
            onClick={() => {
              if (
                window.confirm(
                  'Delete this wallet from the phone? Without an exported key the test SOL is gone.',
                )
              )
                void wipeBreez()
                  .catch(() => {})
                  .then(() => wipeWallet())
                  .then(() => setWallet(null));
            }}
          >
            Delete wallet
          </Button>
        </div>
      </Card>
    </main>
  );
}
