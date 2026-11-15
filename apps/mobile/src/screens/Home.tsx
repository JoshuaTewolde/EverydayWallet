import { useState } from 'react';
import {
  Button,
  ButtonLink,
  Card,
  ErrorText,
  Loading,
  SatsAmount,
  SolAmount,
} from '../design/components';
import { BREEZ_ENABLED } from '../lib/breez';
import { explorerTx, shortAddr } from '../lib/config';
import { nameFor } from '../lib/contacts';
import { airdrop, friendlyError } from '../lib/solana';
import { useStore, useWallet } from '../lib/store';

export function Home() {
  const wallet = useWallet();
  const {
    balance,
    price,
    activity,
    contacts,
    refresh,
    refreshError,
    btcBalance,
    btcPrice,
    btcError,
  } = useStore();
  const [dropping, setDropping] = useState(false);
  const [dropMsg, setDropMsg] = useState<string | null>(null);

  async function openFaucet() {
    const addr = wallet.keypair.publicKey.toBase58();
    try {
      await navigator.clipboard.writeText(addr);
      setDropMsg('Address copied. Paste it on the faucet page, pick devnet, then come back.');
    } catch {
      setDropMsg(`Your address: ${addr}`);
    }
    window.open('https://faucet.solana.com', '_blank');
  }

  async function getTestSol() {
    setDropping(true);
    setDropMsg(null);
    try {
      await airdrop(wallet.keypair.publicKey, 1);
      setDropMsg('+1 test SOL arrived.');
      await refresh();
    } catch (e) {
      // Public devnet RPC no longer airdrops (HTTP 410), so fall back to the web faucet.
      setDropMsg(`${friendlyError(e)} Use the web faucet below.`);
    } finally {
      setDropping(false);
    }
  }

  return (
    <main className="screen">
      <Card raised tone="sun">
        <div className="balance">
          <span className="eyebrow">Hi {wallet.nickname} · balance</span>
          {balance === null ? (
            <Loading />
          ) : (
            <SolAmount lamports={balance} price={price} size="lg" />
          )}
        </div>
      </Card>
      <ErrorText>{refreshError}</ErrorText>
      {BREEZ_ENABLED && (
        <Card raised>
          <div className="balance">
            <span className="eyebrow">Bitcoin · regtest (Breez)</span>
            {btcBalance !== null ? (
              <SatsAmount sats={btcBalance} price={btcPrice} size="lg" />
            ) : btcError ? (
              <span className="muted">Bitcoin unavailable: {btcError}</span>
            ) : (
              <Loading label="Starting bitcoin wallet" />
            )}
          </div>
        </Card>
      )}

      <div className="actions">
        <ButtonLink to="/send" variant="primary" size="lg" block>
          Tap to pay
        </ButtonLink>
        <ButtonLink to="/receive" variant="teal" size="lg" block>
          Receive
        </ButtonLink>
      </div>

      <Card>
        <div className="stack">
          <Button variant="accent" block busy={dropping} onClick={() => void getTestSol()}>
            Get 1 test SOL
          </Button>
          {dropMsg && <p className="muted">{dropMsg}</p>}
          <Button block onClick={() => void openFaucet()}>
            Copy my address &amp; open faucet.solana.com
          </Button>
        </div>
      </Card>

      <section className="stack">
        <h2 className="section-title">Activity</h2>
        {activity.length === 0 ? (
          <p className="muted">No transactions yet.</p>
        ) : (
          <ul className="activity">
            {activity.map((a) => {
              const who =
                nameFor(contacts, a.counterparty) ??
                a.fromName ??
                (a.counterparty ? shortAddr(a.counterparty) : 'Airdrop');
              const incoming = a.delta > 0n;
              return (
                <li key={a.sig}>
                  <a href={explorerTx(a.sig)} target="_blank" rel="noreferrer">
                    <strong>{incoming ? `From ${who}` : `To ${who}`}</strong>
                    <br />
                    <span className="muted">
                      {a.time ? new Date(a.time).toLocaleString() : 'pending'}
                      {a.ok ? '' : ' · failed'}
                    </span>
                  </a>
                  <SolAmount
                    lamports={incoming ? a.delta : -a.delta}
                    sign={incoming ? '+' : '-'}
                    size="sm"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
