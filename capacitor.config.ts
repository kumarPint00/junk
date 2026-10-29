import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.plottoghar.app',
  appName: 'Plot to Ghar',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false
  }
};

export default config;
