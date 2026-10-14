import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.pizzalog.pos',
  appName: 'Pizzalog TPV',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
};

export default config;
