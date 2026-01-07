import { dataService } from './DataService';

// Using try-catch for Capacitor to handle version issues
let Filesystem;
let Share;

// Check if we're in a Capacitor environment
const isCapacitor = typeof window !== 'undefined' && window.Capacitor;

if (isCapacitor) {
  try {
    import('@capacitor/filesystem').then(module => {
      Filesystem = module.Filesystem;
    }).catch(() => {
      console.log('Filesystem plugin not available');
    });
    
    import('@capacitor/share').then(module => {
      Share = module.Share;
    }).catch(() => {
      console.log('Share plugin not available');
    });
  } catch (error) {
    console.log('Capacitor plugins not available:', error);
  }
}

/**
 * Utility: Generate checksum
 */
function generateChecksum(data) {
  try {
    return btoa(
      JSON.stringify(data)
        .split('')
        .reduce((acc, char) => acc + char.charCodeAt(0), 0)
    );
  } catch (error) {
    return 'no-checksum';
  }
}

/**
 * CREATE BACKUP
 */
export async function createBackup(userId, username = 'System', backupName = 'Automatic Backup') {
  try {
    const backupData = {
      schema_version: '6', // Your current schema version
      created_at: new Date().toISOString(),
      created_by: userId,
      created_by_name: username,
      data: {}
    };

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
      'backup',
      'deleted_items'
    ];

    // Collect data from all tables using dataService
    for (const table of tables) {
      try {
        backupData.data[table] = await dataService.getAll(table);
      } catch (err) {
        console.warn(`Table ${table} not found or error:`, err);
        backupData.data[table] = [];
      }
    }

    const checksum = generateChecksum(backupData);
    const fileName = `TindaTrack_Auto_${backupName.replace(/\s+/g, '_')}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const jsonString = JSON.stringify(backupData, null, 2);

    // Log the backup in database
    try {
      await dataService.add('backup', {
        user_id: userId,
        username: username,
        backup_name: backupName,
        backup_type: 'full',
        created_at: new Date().toISOString(),
        schema_version: '6',
        file_name: fileName,
        file_size: jsonString.length,
        checksum,
        is_auto_backup: false
      });
    } catch (dbError) {
      console.warn('Could not log backup to database:', dbError);
    }

    return { success: true, json: jsonString, fileName, backupId: Date.now() };
  } catch (error) {
    console.error('Backup creation failed:', error);
    return { success: false, error };
  }
}

/**
 * RESTORE BACKUP
 */
export async function restoreBackup(file, userId, username) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    // Verify it's a valid backup file
    if (!parsed.data || !parsed.schema_version) {
      throw new Error('Invalid backup file format.');
    }

    // Show warning about data overwrite
    if (!window.confirm(`⚠️ WARNING: This will overwrite ALL current data.\n\nTables to restore: ${Object.keys(parsed.data).join(', ')}\n\nContinue?`)) {
      return { success: false, error: 'Restore cancelled by user' };
    }

    // Restore each table
    const tableNames = Object.keys(parsed.data);
    
    for (const tableName of tableNames) {
      try {
        const tableData = parsed.data[tableName];
        
        if (tableData && Array.isArray(tableData) && tableData.length > 0) {
          console.log(`Restoring ${tableData.length} records to ${tableName}...`);
          
          // Clear existing data (skip for backup table to keep history)
          if (tableName !== 'backup') {
            try {
              // For web/API mode, we can't clear tables directly
              // We'll just overwrite with new data
              await dataService.bulkAdd(tableName, tableData);
            } catch (bulkError) {
              console.log(`Bulk add failed for ${tableName}, trying individual inserts...`);
              
              // Fallback to individual inserts
              for (const record of tableData) {
                try {
                  await dataService.add(tableName, record);
                } catch (recordError) {
                  console.warn(`Failed to insert record into ${tableName}:`, recordError);
                }
              }
            }
          }
        }
      } catch (tableError) {
        console.error(`Error restoring ${tableName}:`, tableError);
        // Continue with other tables
      }
    }

    // Log the restore operation
    try {
      await dataService.add('backup', {
        user_id: userId,
        username,
        backup_name: `Restore: ${file.name}`,
        backup_type: 'restore',
        created_at: new Date().toISOString(),
        schema_version: '6',
        file_name: file.name,
        file_size: text.length,
        checksum: generateChecksum(text),
        details: `Restored ${tableNames.length} tables with data from backup file`
      });
    } catch (logError) {
      console.warn('Could not log restore to database:', logError);
    }

    return { success: true, restoredTables: tableNames.length };
  } catch (error) {
    console.error('Restore error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * DOWNLOAD BACKUP FILE
 */
export async function downloadBackupFile(json, fileName) {
  try {
    // For Capacitor (mobile)
    if (isCapacitor && Filesystem) {
      try {
        console.log('Downloading backup to device...');
        
        // Try Documents directory first
        try {
          const result = await Filesystem.writeFile({
            path: fileName,
            data: json,
            directory: Filesystem.Directory.Documents,
            recursive: true
          });
          
          console.log(`✅ Backup saved to Documents:`, result.uri);
          
          // Try to share the file
          if (Share) {
            try {
              await Share.share({
                title: 'TindaTrack Backup',
                text: 'Backup file',
                url: result.uri,
                dialogTitle: 'Save or share backup file'
              });
            } catch (shareError) {
              console.log('Share not available:', shareError);
            }
          }
          
          return { 
            success: true, 
            uri: result.uri,
            location: 'Documents folder',
            platform: 'capacitor'
          };
        } catch (docError) {
          console.log('Failed to save to Documents:', docError);
          
          // Fallback to Data directory
          try {
            const result = await Filesystem.writeFile({
              path: fileName,
              data: json,
              directory: Filesystem.Directory.Data,
              recursive: true
            });
            
            console.log(`✅ Backup saved to Data:`, result.uri);
            return { 
              success: true, 
              uri: result.uri,
              location: 'App Data folder',
              platform: 'capacitor'
            };
          } catch (dataError) {
            console.log('Failed to save to Data:', dataError);
            throw new Error('Could not save to device storage');
          }
        }
      } catch (mobileError) {
        console.error('Mobile download failed:', mobileError);
        throw mobileError;
      }
    }
    
    // For Web (fallback)
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      
      link.click();
      
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
      
      console.log(`✅ Backup downloaded via web: ${fileName}`);
      return { 
        success: true, 
        location: 'Browser downloads folder',
        platform: 'web'
      };
    } catch (webError) {
      console.error('Web download failed:', webError);
      throw webError;
    }
  } catch (error) {
    console.error('Download failed:', error);
    return { 
      success: false, 
      error: error.message,
      platform: 'unknown'
    };
  }
}

/**
 * Audit logging function
 */
export async function logAudit(action, details = {}, userId = null, username = null) {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    await dataService.add('backup', {
      user_id: userId || user?.user_id,
      username: username || user?.username,
      backup_name: `AUDIT_${action}`,
      backup_type: 'audit',
      created_at: new Date().toISOString(),
      schema_version: '6',
      details: JSON.stringify(details)
    });
    
    return true;
  } catch (error) {
    console.error('Audit logging failed:', error);
    return false;
  }
}