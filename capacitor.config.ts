import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'vn.angelbk.clbnhay',
  appName: 'CLB NHẢY ANGEL BK',
  webDir: 'out',
  server: {
    url: 'https://clb-nhay-manager-web.vercel.app',
    cleartext: false,
  },
};

export default config;
