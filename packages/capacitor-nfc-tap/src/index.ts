import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type NfcStatus = 'enabled' | 'disabled' | 'unsupported';

export type NfcErrorCode =
  'NFC_DISABLED' | 'NFC_UNSUPPORTED' | 'TAG_LOST' | 'WRONG_APP' | 'READ_FAILED' | 'HCE_UNSUPPORTED';

export interface NfcTapPlugin {
  /** NFC hardware/setting state. `hce` = this phone can be tapped (card emulation). */
  getStatus(): Promise<{ status: NfcStatus; hce: boolean }>;
  /** Open Android's NFC settings screen. */
  openSettings(): Promise<void>;

  // ---- Receiver (card emulation) ----
  /** Serve this payload to readers and make our HCE service preferred while in the foreground. */
  setPayload(options: { payload: string }): Promise<void>;
  /** Stop serving a payload and release the preferred service. */
  clearPayload(): Promise<void>;

  // ---- Sender (reader) ----
  /** Enable reader mode; emits `payloadRead` or `readError`. */
  startReading(): Promise<void>;
  stopReading(): Promise<void>;

  addListener(
    eventName: 'tapServed',
    listener: (e: { at: number }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'payloadRead',
    listener: (e: { payload: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'readError',
    listener: (e: { code: NfcErrorCode; message: string }) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export const NfcTap = registerPlugin<NfcTapPlugin>('NfcTap', {
  web: () => import('./web.js').then((m) => new m.NfcTapWeb()),
});
