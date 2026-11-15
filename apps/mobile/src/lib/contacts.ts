import { Preferences } from '@capacitor/preferences';
import { isPublicKey } from '@tap/shared';

export interface Contact {
  name: string;
  address: string;
  addedAt: number;
}

const KEY = 'tap.contacts';

export async function loadContacts(): Promise<Contact[]> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    const list = value ? (JSON.parse(value) as Contact[]) : [];
    return Array.isArray(list) ? list.filter((c) => isPublicKey(c.address)) : [];
  } catch {
    return [];
  }
}

export async function saveContact(c: Omit<Contact, 'addedAt'>): Promise<Contact[]> {
  const list = (await loadContacts()).filter((x) => x.address !== c.address);
  const next = [{ ...c, name: c.name.slice(0, 40), addedAt: Date.now() }, ...list].slice(0, 100);
  await Preferences.set({ key: KEY, value: JSON.stringify(next) });
  return next;
}

export async function removeContact(address: string): Promise<Contact[]> {
  const next = (await loadContacts()).filter((x) => x.address !== address);
  await Preferences.set({ key: KEY, value: JSON.stringify(next) });
  return next;
}

export function nameFor(contacts: Contact[], address: string | null): string | null {
  if (!address) return null;
  return contacts.find((c) => c.address === address)?.name ?? null;
}
