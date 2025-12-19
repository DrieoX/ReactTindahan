import { db } from '../db';

/**
 * Utility: Generate checksum (simple but acceptable for capstone)
 */
function generateChecksum(data) {
  return btoa(
    JSON.stringify(data)
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0)
  );
}

/**
 * CREATE BACKUP
 * @param {number} userId - ID of logged-in user
 * @param {string} username - Username of logged-in user
 * @param {string} backupName - Friendly name for backup
 */
export async function createBackup(userId, username = 'System', backupName = 'Manual Backup') {
  try {
    const backupData = {
      schema_version: db.verno,
      created_at: new Date().toISOString(),
      created_by: userId,
      created_by_name: username, // ✅ Store username
      data: {}
    };

    // Tables to back up
    const tables = [
      'users',
      'suppliers',
      'categories',
      'products',
      'product_units',
      'inventory',
      'resupplied_items',
      'sales',
      'sale_items',
      'stock_card',
      'backup' // Include backup table for history
    ];

    for (const table of tables) {
      try {
        backupData.data[table] = await db.table(table).toArray();
      } catch (err) {
        console.warn(`Table ${table} not found or error:`, err);
        backupData.data[table] = [];
      }
    }

    const checksum = generateChecksum(backupData);
    const fileName = `TindaTrack_Backup_${backupName.replace(/\s+/g, '_')}_${Date.now()}.json`;
    const jsonString = JSON.stringify(backupData, null, 2);

    // ✅ FIXED: Store username in backup metadata
    await db.backup.add({
      user_id: userId,
      username: username, // ✅ Store username
      backup_name: backupName,
      backup_type: 'full',
      created_at: new Date().toISOString(),
      schema_version: db.verno,
      file_name: fileName,
      file_size: jsonString.length,
      checksum: checksum
    });

    return {
      success: true,
      backupData: jsonString,
      fileName: fileName,
      backupId: Date.now()
    };
  } catch (error) {
    console.error('Backup failed:', error);
    return { success: false, error };
  }
}

/**
 * RESTORE BACKUP
 * @param {File} file - Uploaded backup JSON file
 * @param {number} userId - User performing restore
 * @param {string} username - Username performing restore
 */
export async function restoreBackup(file, userId, username = 'System') {
  try {
    const text = await file.text();
    const backupJson = JSON.parse(text);

    // Validate schema
    if (backupJson.schema_version !== db.verno) {
      throw new Error('Schema version mismatch. Please use a backup from this version.');
    }

    const checksum = generateChecksum(backupJson);
    if (!checksum) {
      throw new Error('Invalid backup file.');
    }

    await db.transaction('rw',
      db.users,
      db.suppliers,
      db.categories,
      db.products,
      db.product_units,
      db.inventory,
      db.resupplied_items,
      db.sales,
      db.sale_items,
      db.stock_card,
      async () => {

        // Clear tables first (keep backup table for history)
        await Promise.all([
          db.users.clear(),
          db.suppliers.clear(),
          db.categories.clear(),
          db.products.clear(),
          db.product_units.clear(),
          db.inventory.clear(),
          db.resupplied_items.clear(),
          db.sales.clear(),
          db.sale_items.clear(),
          db.stock_card.clear()
        ]);

        // Restore data
        for (const tableName in backupJson.data) {
          if (tableName !== 'backup') { // Don't restore old backup records
            await db.table(tableName).bulkAdd(backupJson.data[tableName]);
          }
        }
      }
    );

    // ✅ FIXED: Store username in restore log
    await db.backup.add({
      user_id: userId,
      username: username, // ✅ Store username
      backup_name: 'Restore Operation - ' + file.name,
      backup_type: 'restore',
      created_at: new Date().toISOString(),
      schema_version: db.verno,
      file_name: file.name,
      file_size: text.length,
      checksum: checksum,
      details: JSON.stringify({
        original_backup_date: backupJson.created_at,
        original_backup_by: backupJson.created_by_name || 'Unknown',
        restored_by: username
      })
    });

    return { success: true };
  } catch (error) {
    console.error('Restore failed:', error);
    return { success: false, error };
  }
}

/**
 * Download backup file immediately (for auto backup)
 */
export function downloadBackupFile(backupData, fileName) {
  try {
    const blob = new Blob([backupData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    
    // Trigger download
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    console.log(`✅ Auto backup downloaded: ${fileName}`);
    return true;
  } catch (error) {
    console.error('Auto backup download failed:', error);
    return false;
  }
}