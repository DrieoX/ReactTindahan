import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tindatrack.app',
  appName: 'TindaTrack',
  webDir: 'build',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'small',
      spinnerColor: '#3b82f6',
      splashFullScreen: true,
      splashImmersive: true
    }
  }
} as CapacitorConfig; // Type assertion to bypass strict type checking

// For Android network permissions, you might need to add them in AndroidManifest.xml instead
// Or use a different approach based on your Capacitor version

export default config;