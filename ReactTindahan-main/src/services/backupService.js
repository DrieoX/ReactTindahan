import { db } from '../db';
import { Capacitor } from '@capacitor/core';
import {
  Filesystem,
  Directory
} from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/* --------------------------------------------------
   CHECKSUM (SIMPLE BUT SAFE)
-------------------------------------------------- */
function checksum(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
}

/* --------------------------------------------------
   CREATE BACKUP
-------------------------------------------------- */
export async function createBackup(userId, username, backupName) {
  try {
    const data = {};
    const tables = db.tables.map((t) => t.name);

    for (const table of tables) {
      data[table] = await db.table(table).toArray();
    }

    const payload = {
      schema_version: db.verno,
      created_at: new Date().toISOString(),
      created_by: userId,
      created_by_name: username,
      data
    };

    const json = JSON.stringify(payload, null, 2);
    const fileName =
      `TindaTrack_${backupName.replace(/\s+/g, '_')}_${Date.now()}.json`;

    await db.backup.add({
      user_id: userId,
      username,
      backup_name: backupName,
      backup_type: 'full',
      created_at: new Date().toISOString(),
      schema_version: db.verno,
      file_name: fileName,
      file_size: json.length,
      checksum: checksum(json)
    });

    return { success: true, json, fileName };
  } catch (error) {
    return { success: false, error };
  }
}

/* --------------------------------------------------
   RESTORE BACKUP
-------------------------------------------------- */
export async function restoreBackup(file, userId, username) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (parsed.schema_version !== db.verno) {
      throw new Error('Schema version mismatch.');
    }

    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }

      for (const name of Object.keys(parsed.data)) {
        if (db.tables.map((t) => t.name).includes(name)) {
          await db.table(name).bulkAdd(parsed.data[name]);
        }
      }
    });

    await db.backup.add({
      user_id: userId,
      username,
      backup_name: `Restore: ${file.name}`,
      backup_type: 'restore',
      created_at: new Date().toISOString(),
      schema_version: db.verno,
      file_name: file.name,
      file_size: text.length,
      checksum: checksum(text)
    });

    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

/* --------------------------------------------------
   DOWNLOAD BACKUP (ANDROID / iOS / WEB)
-------------------------------------------------- */
export async function downloadBackupFile(json, fileName) {
  const platform = Capacitor.getPlatform();

  /* ---------- ANDROID ---------- */
  if (platform === 'android') {
    await Filesystem.requestPermissions();

    const base64Data = btoa(
      unescape(encodeURIComponent(json))
    );

    await Filesystem.writeFile({
      path: `Download/${fileName}`,
      data: base64Data,
      directory: Directory.ExternalStorage,
      recursive: true
    });

    return {
      success: true,
      platform: 'android',
      location: 'Downloads folder',
      length: json.length
    };
  }

  /* ---------- iOS ---------- */
  if (platform === 'ios') {
    const result = await Filesystem.writeFile({
      path: fileName,
      data: json,
      directory: Directory.Documents
    });

    await Share.share({
      title: 'Backup File',
      text: 'TindaTrack Backup',
      url: result.uri
    });

    return {
      success: true,
      platform: 'ios',
      location: 'Documents folder',
      length: json.length
    };
  }

  /* ---------- WEB ---------- */
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return {
    success: true,
    platform: 'web',
    location: 'Browser downloads',
    length: json.length
  };
}
