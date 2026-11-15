import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.tapwallet.app',
  appName: 'Tap',
  webDir: 'dist',
  // Public Solana RPC returns 403 for Origin https://localhost (Capacitor's default), so serve
  // the app from a non-localhost hostname. Verified with curl: tap.local -> 200.
  server: { hostname: 'tap.local', androidScheme: 'https' },
  android: { allowMixedContent: false },
};

export default config;
