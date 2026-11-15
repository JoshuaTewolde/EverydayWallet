import { useState } from 'react';
import { Button, ButtonLink, Card, ErrorText, Loading, SolAmount } from '../design/components';
import { explorerTx, shortAddr } from '../lib/config';
import { nameFor } from '../lib/contacts';
import { airdrop, friendlyError } from '../lib/solana';
import { useStore, useWallet } from '../lib/store';

export function Home() {
  const wallet = useWallet();
  const { balance, price, activity, contacts, refresh, refreshError } = useStore();
  const [dropping, setDropping] = useState(false);
  const [dropMsg, setDropMsg] = useState<string | null>(null);

  async function getTestSol() {
    setDropping(true);
    setDropMsg(null);
    try {
      await airdrop(wallet.keypair.publicKey, 1);
      setDropMsg('+1 test SOL arrived.');
      await refresh();
    } catch (e) {
      setDropMsg(`${friendlyError(e)} You can also use faucet.solana.com with your address.`);
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
          <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className="muted">
            Airdrop limited? Use faucet.solana.com
          </a>
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
