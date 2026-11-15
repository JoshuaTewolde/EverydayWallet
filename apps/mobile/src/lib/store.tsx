import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchPrice } from './api';
import { loadContacts, type Contact } from './contacts';
import { getActivity, getBalance, type Activity } from './solana';
import { loadWallet, type StoredWallet } from './vault';

interface Store {
  ready: boolean;
  wallet: StoredWallet | null;
  setWallet: (w: StoredWallet | null) => void;
  balance: bigint | null;
  activity: Activity[];
  price: number | null;
  contacts: Contact[];
  setContacts: (c: Contact[]) => void;
  refresh: () => Promise<void>;
  refreshError: string | null;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [price, setPrice] = useState<number | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setWallet(await loadWallet());
      } catch (e) {
        console.error('loadWallet failed', e);
      }
      setContacts(await loadContacts());
      setReady(true);
    })();
    void fetchPrice().then(setPrice);
    const t = setInterval(() => void fetchPrice().then((p) => p && setPrice(p)), 60_000);
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    try {
      const pub = wallet.keypair.publicKey;
      setBalance(await getBalance(pub));
      setRefreshError(null);
      setActivity(await getActivity(pub));
    } catch (e) {
      console.warn('refresh failed', e);
      setRefreshError("Can't reach Solana devnet right now.");
    }
  }, [wallet]);

  useEffect(() => {
    if (!wallet) return;
    void refresh();
    const t = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(t);
  }, [wallet, refresh]);

  const value = useMemo(
    () => ({
      ready,
      wallet,
      setWallet,
      balance,
      activity,
      price,
      contacts,
      setContacts,
      refresh,
      refreshError,
    }),
    [ready, wallet, balance, activity, price, contacts, refresh, refreshError],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

/** Wallet is guaranteed by the router guard on every screen except onboarding. */
export function useWallet(): StoredWallet {
  const w = useStore().wallet;
  if (!w) throw new Error('No wallet');
  return w;
}
