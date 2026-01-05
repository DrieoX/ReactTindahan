import { dataService } from '../services/DataService';
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
      'backup'
    ];

    // CHANGED: Use DataService to get all table data
    for (const table of tables) {
      try {
        data[table] = await dataService.getAll(table);
      } catch (err) {
        console.warn(`Table ${table} not found or error:`, err);
        data[table] = [];
      }
    }

    const payload = {
      schema_version: '5',
      created_at: new Date().toISOString(),
      created_by: userId,
      created_by_name: username,
      backup_name: backupName,
      data
    };

    const json = JSON.stringify(payload, null, 2);
    const fileName =
      `TindaTrack_${backupName.replace(/\s+/g, '_')}_${Date.now()}.json`;

    // CHANGED: Use DataService to log backup
    await dataService.add('backup', {
      user_id: userId,
      username,
      backup_name: backupName,
      backup_type: 'full',
      created_at: new Date().toISOString(),
      schema_version: '5',
      file_name: fileName,
      file_size: json.length,
      checksum: checksum(json)
    });

    return { success: true, json, fileName };
  } catch (error) {
    console.error('Backup creation error:', error);
    return { success: false, error };
  }
}

/* --------------------------------------------------
   RESTORE BACKUP WITH OPTIONS
-------------------------------------------------- */
export async function restoreBackup(file, userId, username, restoreOption = 'merge', tablesToRestore = {}) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!parsed.data) {
      throw new Error('Invalid backup file format');
    }

    let stats = {
      restored: 0,
      skipped: 0,
      errors: 0
    };

    // If overwrite mode, clear selected tables first
    if (restoreOption === 'overwrite') {
      for (const tableName of Object.keys(tablesToRestore)) {
        if (tablesToRestore[tableName]) {
          try {
            // Get all records in the table
            const allRecords = await dataService.getAll(tableName);
            
            // Delete all records one by one (since DataService.delete doesn't support clear all)
            // For better performance in owner mode, we'll use batch operations
            if (dataService.isOwner) {
              // For IndexedDB (owner mode), we can use a more efficient approach
              for (const record of allRecords) {
                const idField = getPrimaryKeyField(tableName);
                if (record[idField]) {
                  await dataService.delete(tableName, record[idField]);
                }
              }
            }
            stats.skipped += allRecords.length; // These are being deleted, not skipped
          } catch (error) {
            console.warn(`Failed to clear table ${tableName}:`, error);
          }
        }
      }
    }

    // Process each table
    for (const [tableName, backupData] of Object.entries(parsed.data)) {
      // Skip if not selected for restore
      if (!tablesToRestore[tableName] && Object.keys(tablesToRestore).length > 0) {
        console.log(`Skipping ${tableName} - not selected for restore`);
        continue;
      }

      if (!Array.isArray(backupData)) {
        console.warn(`Invalid data format for ${tableName}, skipping`);
        continue;
      }

      console.log(`Restoring ${tableName}: ${backupData.length} records (${restoreOption} mode)`);

      for (const record of backupData) {
        try {
          // For merge mode, check if record already exists
          if (restoreOption === 'merge') {
            const existing = await findExistingRecord(tableName, record);
            if (existing) {
              stats.skipped++;
              continue; // Skip duplicates in merge mode
            }
          }

          // Prepare record for insertion
          const recordToInsert = prepareRecordForRestore(record, userId, username);

          // Insert record
          await dataService.add(tableName, recordToInsert);
          stats.restored++;
        } catch (error) {
          console.error(`Error restoring record in ${tableName}:`, error);
          stats.errors++;
        }
      }
    }

    // Log the restore operation
    await dataService.add('backup', {
      user_id: userId,
      username,
      backup_name: `Restore: ${file.name} (${restoreOption})`,
      backup_type: 'restore',
      created_at: new Date().toISOString(),
      schema_version: '5',
      file_name: file.name,
      file_size: text.length,
      checksum: checksum(text),
      restore_mode: restoreOption,
      tables_restored: Object.keys(tablesToRestore).filter(t => tablesToRestore[t]),
      stats: stats
    });

    return { success: true, stats };
  } catch (error) {
    console.error('Restore error:', error);
    return { success: false, error };
  }
}

/* --------------------------------------------------
   HELPER: Find existing record (for merge mode)
-------------------------------------------------- */
async function findExistingRecord(tableName, record) {
  try {
    // Different lookup strategies for different tables
    switch (tableName) {
      case 'users':
        if (record.user_id) {
          return await dataService.getById('users', record.user_id);
        }
        if (record.username) {
          const users = await dataService.getAll('users', { where: { username: record.username } });
          return users[0];
        }
        break;
      
      case 'products':
        if (record.product_id) {
          return await dataService.getById('products', record.product_id);
        }
        if (record.sku) {
          const products = await dataService.getAll('products', { where: { sku: record.sku } });
          return products[0];
        }
        if (record.name) {
          const products = await dataService.getAll('products', { where: { name: record.name } });
          return products[0];
        }
        break;
      
      case 'suppliers':
        if (record.supplier_id) {
          return await dataService.getById('suppliers', record.supplier_id);
        }
        if (record.name) {
          const suppliers = await dataService.getAll('suppliers', { where: { name: record.name } });
          return suppliers[0];
        }
        break;
      
      case 'categories':
        if (record.category_id) {
          return await dataService.getById('categories', record.category_id);
        }
        if (record.name) {
          const categories = await dataService.getAll('categories', { where: { name: record.name } });
          return categories[0];
        }
        break;
      
      default:
        // For other tables, try to find by primary key
        const idField = getPrimaryKeyField(tableName);
        if (record[idField]) {
          return await dataService.getById(tableName, record[idField]);
        }
    }
    
    return null;
  } catch (error) {
    console.warn(`Error finding existing record in ${tableName}:`, error);
    return null;
  }
}

/* --------------------------------------------------
   HELPER: Prepare record for restoration
-------------------------------------------------- */
function prepareRecordForRestore(record, userId, username) {
  const prepared = { ...record };
  
  // Remove auto-increment IDs for fresh insertion
  const idFields = ['id', '_id'];
  idFields.forEach(field => {
    if (prepared[field] !== undefined) {
      delete prepared[field];
    }
  });
  
  // Add audit fields
  if (!prepared.created_at) {
    prepared.created_at = new Date().toISOString();
  }
  
  if (!prepared.created_by) {
    prepared.created_by = username || 'System (Restored)';
  }
  
  if (!prepared.updated_at) {
    prepared.updated_at = new Date().toISOString();
  }
  
  if (!prepared.updated_by) {
    prepared.updated_by = username || 'System (Restored)';
  }
  
  return prepared;
}

/* --------------------------------------------------
   HELPER: Get primary key field for a table
-------------------------------------------------- */
function getPrimaryKeyField(tableName) {
  const primaryKeys = {
    'users': 'user_id',
    'products': 'product_id',
    'categories': 'category_id',
    'suppliers': 'supplier_id',
    'inventory': 'product_id', // inventory uses product_id as primary key
    'sales': 'sales_id',
    'sale_items': 'sale_items_id',
    'stock_card': 'stock_card_id',
    'product_units': 'product_units_id',
    'resupplied_items': 'resupplied_items_id',
    'backup': 'backup_id'
  };
  
  return primaryKeys[tableName] || 'id';
}

/* --------------------------------------------------
   DOWNLOAD BACKUP (ANDROID / iOS / WEB)
-------------------------------------------------- */
export async function downloadBackupFile(json, fileName) {
  const platform = Capacitor.getPlatform();

  /* ---------- ANDROID ---------- */
  if (platform === 'android') {
    try {
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
    } catch (error) {
      console.error('Android download failed:', error);
      // Fall back to web download
    }
  }

  /* ---------- iOS ---------- */
  if (platform === 'ios') {
    try {
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
    } catch (error) {
      console.error('iOS download failed:', error);
      // Fall back to web download
    }
  }

  /* ---------- WEB (Fallback) ---------- */
  try {
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
  } catch (error) {
    console.error('Web download failed:', error);
    return {
      success: false,
      error: error.message,
      platform: 'unknown'
    };
  }
}

/* --------------------------------------------------
   ANALYZE BACKUP FILE
-------------------------------------------------- */
export async function analyzeBackupFile(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    
    if (!parsed.data) {
      throw new Error('Invalid backup file format');
    }
    
    const stats = {
      file_name: file.name,
      file_size: file.size,
      schema_version: parsed.schema_version || 'unknown',
      created_at: parsed.created_at || 'unknown',
      created_by: parsed.created_by_name || parsed.created_by || 'unknown',
      backup_name: parsed.backup_name || 'Unnamed Backup',
      tables: {},
      total_records: 0
    };
    
    Object.entries(parsed.data).forEach(([tableName, records]) => {
      if (Array.isArray(records)) {
        stats.tables[tableName] = records.length;
        stats.total_records += records.length;
      }
    });
    
    return { success: true, stats };
  } catch (error) {
    console.error('Analyze backup error:', error);
    return { success: false, error };
  }
}

/* --------------------------------------------------
   LOG AUDIT (for compatibility)
-------------------------------------------------- */
export async function logAudit(action, details = {}) {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    // Simply log to console
    console.log(`[AUDIT] ${action}`, {
      user_id: user?.user_id,
      username: user?.username,
      details,
      timestamp: new Date().toISOString()
    });
    
    return { success: true };
  } catch (error) {
    console.error('Failed to log audit:', error);
    return { success: false, error };
  }
}