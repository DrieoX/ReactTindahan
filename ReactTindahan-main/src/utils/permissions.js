import { Filesystem } from '@capacitor/filesystem';
import { BluetoothLE } from '@capacitor-community/bluetooth-le';

export async function requestStoragePermissions() {
  try {
    const result = await Filesystem.requestPermissions();
    return result;
  } catch (err) {
    console.log("Filesystem Permission Error:", err);
  }
}

export async function requestBluetoothPermissions() {
  try {
    await BluetoothLE.requestLEScanPermissions();
    await BluetoothLE.requestBluetoothPermissions();
    return true;
  } catch (err) {
    console.log("Bluetooth Permission Error:", err);
    return false;
  }
}
