import { Capacitor } from '@capacitor/core';

export const RPC_URL: string = import.meta.env.VITE_SOLANA_RPC || 'https://api.devnet.solana.com';

/** Absolute API origin for the APK; empty in browser dev (Vite proxies /api). */
export const API_URL: string =
  import.meta.env.VITE_API_URL || (Capacitor.isNativePlatform() ? 'https://tap.example.com' : '');

export const IS_NATIVE = Capacitor.isNativePlatform();

export function explorerTx(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

export function explorerAddress(addr: string): string {
  return `https://explorer.solana.com/address/${addr}?cluster=devnet`;
}

export function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}
