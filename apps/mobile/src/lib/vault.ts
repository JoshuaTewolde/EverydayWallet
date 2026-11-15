/**
 * Key storage. On Android, @aparajita/capacitor-secure-storage encrypts with an Android
 * Keystore key; in the browser (dev only) it falls back to localStorage. Devnet only.
 */
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const KEY = 'tap.solana.secret';
const NAME = 'tap.nickname';

export interface StoredWallet {
  keypair: Keypair;
  nickname: string;
}

export async function loadWallet(): Promise<StoredWallet | null> {
  const secret = await SecureStorage.getItem(KEY);
  if (!secret) return null;
  const nickname = (await SecureStorage.getItem(NAME)) ?? 'Me';
  return { keypair: Keypair.fromSecretKey(bs58.decode(secret)), nickname };
}

export async function createWallet(nickname: string): Promise<StoredWallet> {
  const keypair = Keypair.generate();
  await SecureStorage.setItem(KEY, bs58.encode(keypair.secretKey));
  await SecureStorage.setItem(NAME, nickname);
  return { keypair, nickname };
}

export async function importWallet(nickname: string, secretB58: string): Promise<StoredWallet> {
  const bytes = bs58.decode(secretB58.trim());
  if (bytes.length !== 64) throw new Error('That is not a Solana secret key');
  const keypair = Keypair.fromSecretKey(bytes);
  await SecureStorage.setItem(KEY, bs58.encode(keypair.secretKey));
  await SecureStorage.setItem(NAME, nickname);
  return { keypair, nickname };
}

export async function setNickname(nickname: string): Promise<void> {
  await SecureStorage.setItem(NAME, nickname);
}

export function exportSecret(w: StoredWallet): string {
  return bs58.encode(w.keypair.secretKey);
}

export async function wipeWallet(): Promise<void> {
  await SecureStorage.removeItem(KEY);
  await SecureStorage.removeItem(NAME);
}
