import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.tapwallet.app',
  appName: 'Tap',
  webDir: 'dist',
  android: { allowMixedContent: false },
};

export default config;
