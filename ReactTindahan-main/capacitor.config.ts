import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.TindaTrack.app',
  appName: 'TindaTrack',
  webDir: 'build',
  server: {
    androidScheme: 'http',
    cleartext: true  // Allow HTTP traffic
  },
  android: {
    allowMixedContent: true,  // Allow HTTP/HTTPS mixed content
    webContentsDebuggingEnabled: true
  },
  ios: {
    scheme: 'TindaTrack',
    contentInset: 'always'
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      iosKeychainPrefix: 'TindaTrack',
      iosBiometric: {
        biometricAuth: false,
        biometricTitle: "Biometric login for TindaTrack"
      },
      androidDatabaseLocation: 'databases',
      androidIsEncryption: false,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: "Biometric login for TindaTrack",
        biometricSubTitle: "Log in using your biometric"
      },
      electronDatabaseLocation: 'TindaTrack/databases',
      electronIsEncryption: false
    }
  }
};

export default config;