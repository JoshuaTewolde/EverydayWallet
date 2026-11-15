import { useState } from 'react';
import { BREEZ_ENABLED } from './breez';

export type Rail = 'solana' | 'bitcoin';
const KEY = 'tap.lastRail';

function read(): Rail {
  if (!BREEZ_ENABLED) return 'solana';
  try {
    return localStorage.getItem(KEY) === 'bitcoin' ? 'bitcoin' : 'solana';
  } catch {
    return 'solana';
  }
}

/** "Bitcoin or SOL?", remembering the last choice on this device. */
export function useRail(): [Rail, (r: Rail) => void] {
  const [rail, setRail] = useState<Rail>(read);
  return [
    rail,
    (r) => {
      setRail(r);
      try {
        localStorage.setItem(KEY, r);
      } catch {
        // per-device convenience only
      }
    },
  ];
}
