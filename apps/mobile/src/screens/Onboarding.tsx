import { useState } from 'react';
import { Button, Card, DevnetBadge, ErrorText } from '../design/components';
import { useStore } from '../lib/store';
import { createWallet } from '../lib/vault';

export function Onboarding() {
  const { setWallet } = useStore();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const n = name.trim();
    if (!n) return setError('Pick a nickname so people know who they are paying.');
    setBusy(true);
    try {
      setWallet(await createWallet(n.slice(0, 40)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the wallet');
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <DevnetBadge />
      <h1 className="logo logo--big">Tap</h1>
      <p>Pay a friend by touching phones. Runs on Solana devnet with test money.</p>
      <Card raised>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label className="field">
            Your nickname
            <input
              className="input"
              value={name}
              maxLength={40}
              autoFocus
              placeholder="e.g. Sam"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="primary" size="lg" block busy={busy}>
            Create my wallet
          </Button>
        </form>
      </Card>
      <p className="muted">
        A new key is generated on this phone and stored in Android secure storage. It never leaves
        the device.
      </p>
    </main>
  );
}
