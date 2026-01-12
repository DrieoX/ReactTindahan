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
 * CREATE BACKUP - FIXED VERSION
 */
export async function createBackup(userId, username = 'System', backupName = 'Automatic Backup', isAutoBackup = false) {
  try {
    const backupData = {
      schema_version: '6',
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
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = isAutoBackup 
      ? `TindaTrack_Auto_${backupName.replace(/\s+/g, '_')}_${timestamp}.json`
      : `TindaTrack_${backupName.replace(/\s+/g, '_')}_${timestamp}.json`;
    const jsonString = JSON.stringify(backupData, null, 2);

    // Log the backup in database - FIXED: Store isAutoBackup in details instead of separate column
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
        checksum: checksum,
        details: JSON.stringify({
          isAutoBackup: isAutoBackup,
          tablesBackedUp: tables.length
        })
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
 * RESTORE BACKUP - FIXED VERSION
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
        username: username || 'System',
        backup_name: `Restore: ${file.name}`,
        backup_type: 'restore',
        created_at: new Date().toISOString(),
        schema_version: '6',
        file_name: file.name,
        file_size: text.length,
        checksum: generateChecksum(text),
        details: JSON.stringify({
          restoredTables: tableNames.length,
          originalBackupDate: parsed.created_at
        })
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
 * DOWNLOAD BACKUP FILE - FIXED VERSION
 */
export async function downloadBackupFile(json, fileName) {
  console.log(`📥 Starting download for: ${fileName}`);
  console.log(`📱 Platform: ${isCapacitor ? 'Capacitor Mobile' : 'Web'}`);
  
  try {
    // ALWAYS use web download method as primary - it works everywhere
    console.log('🌐 Using web download method...');
    return await webDownload(json, fileName);
    
  } catch (error) {
    console.error('Download failed:', error);
    return { 
      success: false, 
      error: error.message || 'Download failed',
      platform: 'web'
    };
  }
}

/**
 * Web download method - works on all platforms
 */
async function webDownload(json, fileName) {
  try {
    const blob = new Blob([json], { type: 'application/json' });
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
    
    // Revoke the object URL after a delay
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.log('Error revoking URL:', e);
      }
    }, 100);
    
    console.log(`✅ Backup downloaded: ${fileName}`);
    return { 
      success: true, 
      location: 'Browser downloads folder',
      platform: 'web'
    };
  } catch (webError) {
    console.error('Web download failed:', webError);
    throw new Error('Web download failed: ' + webError.message);
  }
}

/**
 * Optional mobile download method (not used as primary)
 */
async function mobileDownload(json, fileName) {
  try {
    console.log('📱 Attempting mobile download...');
    
    // Check if Filesystem is available
    if (!Filesystem) {
      console.log('Filesystem not available, falling back to web');
      return await webDownload(json, fileName);
    }
    
    // Try Cache directory first (usually has write permissions)
    try {
      console.log('Trying Cache directory...');
      const result = await Filesystem.writeFile({
        path: fileName,
        data: json,
        directory: Filesystem.Directory.Cache,
        recursive: true
      });
      
      console.log(`✅ Backup saved to Cache:`, result.uri);
      
      // Try to share the file
      if (Share) {
        try {
          await Share.share({
            title: 'TindaTrack Backup',
            text: `TindaTrack Backup: ${fileName}`,
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
        location: 'Cache folder',
        platform: 'capacitor'
      };
    } catch (cacheError) {
      console.log('Cache failed:', cacheError.message);
      
      // Fallback to Documents
      try {
        console.log('Trying Documents directory...');
        const result = await Filesystem.writeFile({
          path: fileName,
          data: json,
          directory: Filesystem.Directory.Documents,
          recursive: true
        });
        
        console.log(`✅ Backup saved to Documents:`, result.uri);
        return { 
          success: true, 
          uri: result.uri,
          location: 'Documents folder',
          platform: 'capacitor'
        };
      } catch (docError) {
        console.log('Documents failed:', docError.message);
        
        // Final fallback to web
        console.log('All mobile methods failed, falling back to web');
        return await webDownload(json, fileName);
      }
    }
  } catch (mobileError) {
    console.error('Mobile download failed:', mobileError);
    throw mobileError;
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