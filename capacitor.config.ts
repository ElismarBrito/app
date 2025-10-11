import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pbxmobile.app',
  appName: 'PBX Mobile',
  webDir: 'dist',
  startUrl: '/mobile',
  server: {
    androidScheme: 'http'
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    PbxMobile: {
      enabled: true
    }
  }
};

export default config;