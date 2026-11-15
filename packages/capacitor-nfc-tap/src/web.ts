import { WebPlugin } from '@capacitor/core';
import type { NfcStatus } from './index.js';

/**
 * Browser mock so UI flows work without phones. Two tabs on the same origin simulate a tap:
 * the "receiver" tab publishes its payload on a BroadcastChannel; a "reader" tab picks it up.
 */
export class NfcTapWeb extends WebPlugin {
  private payload: string | null = null;
  private reading = false;
  private chan: BroadcastChannel | null =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('nfc-tap-mock') : null;

  constructor() {
    super();
    this.chan?.addEventListener('message', (e: MessageEvent) => {
      const msg = e.data as { type: string; payload?: string };
      if (msg.type === 'request' && this.payload) {
        this.chan?.postMessage({ type: 'payload', payload: this.payload });
        this.notifyListeners('tapServed', { at: Date.now() });
      } else if (msg.type === 'payload' && this.reading && msg.payload) {
        this.reading = false;
        this.notifyListeners('payloadRead', { payload: msg.payload });
      }
    });
  }

  async getStatus(): Promise<{ status: NfcStatus; hce: boolean }> {
    return { status: 'enabled', hce: true };
  }
  async openSettings(): Promise<void> {}
  async setPayload({ payload }: { payload: string }): Promise<void> {
    this.payload = payload;
  }
  async clearPayload(): Promise<void> {
    this.payload = null;
  }
  async startReading(): Promise<void> {
    this.reading = true;
    // Simulate "hold phones together" after a short delay.
    setTimeout(() => this.reading && this.chan?.postMessage({ type: 'request' }), 800);
  }
  async stopReading(): Promise<void> {
    this.reading = false;
  }
}
