import { dataService } from './DataService';

// Using try-catch for Capacitor to handle version issues
let Filesystem;

// Check if we're in a Capacitor environment
const isCapacitor = typeof window !== 'undefined' && window.Capacitor;

if (isCapacitor) {
  try {
    import('@capacitor/filesystem').then(module => {
      Filesystem = module.Filesystem;
    }).catch(() => {
      console.log('Filesystem plugin not available');
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
 * CREATE BACKUP (local function for autoBackup) - FIXED VERSION
 */
async function createBackup(userId, username = 'System', backupName = 'Automatic Backup') {
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
    const fileName = `TindaTrack_Auto_${backupName.replace(/\s+/g, '_')}_${timestamp}.json`;
    const jsonString = JSON.stringify(backupData, null, 2);

    // Log the backup in database - FIXED: Store isAutoBackup in details
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
          isAutoBackup: true,
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
 * Download backup file for auto backup - SIMPLIFIED VERSION
 */
async function downloadBackupFile(json, fileName) {
  console.log(`📥 Auto backup - Starting download: ${fileName}`);
  
  try {
    // ALWAYS use web method for auto backup
    return await webDownload(json, fileName);
  } catch (error) {
    console.error('Auto backup download failed:', error);
    return { success: false, error: error.message };
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
    
    console.log(`✅ Auto backup downloaded: ${fileName}`);
    return { success: true, location: 'Browser downloads folder' };
  } catch (webError) {
    console.error('Web download failed:', webError);
    throw new Error('Web download failed: ' + webError.message);
  }
}

/**
 * Run daily backup automatically for owners
 */
export async function runDailyBackup() {
  try {
    // Check if database is ready by testing a simple query
    try {
      await dataService.getAll('users', { limit: 1 });
    } catch (dbError) {
      console.log('Database not ready, skipping auto backup');
      return false;
    }

    const userData = localStorage.getItem('user');
    if (!userData) {
      console.log('No user logged in, skipping auto backup');
      return false;
    }

    const user = JSON.parse(userData);
    
    // Check if user is owner
    const isOwner = user.role && user.role.toLowerCase() === 'owner';
    if (!isOwner) {
      console.log('User is not owner, skipping auto backup');
      return false;
    }

    // Check last backup date
    const lastBackup = localStorage.getItem('lastBackupDate');
    const today = new Date().toISOString().split('T')[0];

    if (lastBackup === today) {
      console.log('Already backed up today, skipping');
      return false;
    }

    console.log('Running automatic daily backup for user:', user.username);
    
    // Create backup
    const result = await createBackup(
      user.user_id, 
      user.username || 'System', 
      'Automatic Daily Backup'
    );

    if (result.success) {
      // Download the file using web method
      const downloadResult = await downloadBackupFile(result.json, result.fileName);
      
      if (downloadResult.success) {
        // Save backup date
        localStorage.setItem('lastBackupDate', today);
        console.log(`✅ Daily auto backup completed: ${result.fileName}`);
        console.log(`📍 Location: ${downloadResult.location}`);
        
        return true;
      } else {
        console.error('❌ Auto backup created but download failed:', downloadResult.error);
        return false;
      }
    } else {
      console.error('❌ Auto backup creation failed:', result.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Error running daily backup:', error);
    return false;
  }
}

/**
 * Check and run backup if needed (call this on app startup)
 */
export async function checkAndRunBackup() {
  try {
    // Wait a bit for app to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const userData = localStorage.getItem('user');
    if (!userData) {
      console.log('No user logged in, skipping backup check');
      return false;
    }

    const user = JSON.parse(userData);
    const isOwner = user.role && user.role.toLowerCase() === 'owner';
    if (!isOwner) {
      console.log('User is not owner, skipping backup check');
      return false;
    }

    // Check if auto backup is enabled (default: enabled)
    const autoBackupEnabled = localStorage.getItem('autoBackupEnabled');
    if (autoBackupEnabled === 'false') {
      console.log('Auto backup is disabled by user');
      return false;
    }

    // Check last backup date
    const lastBackup = localStorage.getItem('lastBackupDate');
    const today = new Date().toISOString().split('T')[0];
    
    if (lastBackup !== today) {
      console.log('Auto backup needed, last backup was:', lastBackup || 'Never');
      
      // Wait a bit more before running backup
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const result = await runDailyBackup();
      
      if (result) {
        console.log('✅ Auto backup completed successfully');
      } else {
        console.log('⚠️ Auto backup did not run or failed');
      }
      
      return result;
    } else {
      console.log('Already backed up today, last backup:', lastBackup);
      return false;
    }
  } catch (error) {
    console.error('Backup check failed:', error);
    return false;
  }
}

/**
 * Enable/disable auto backup
 */
export function setAutoBackupEnabled(enabled) {
  try {
    localStorage.setItem('autoBackupEnabled', enabled.toString());
    console.log('Auto backup setting updated:', enabled);
    
    // If enabling and today hasn't been backed up yet, run it
    if (enabled) {
      const lastBackup = localStorage.getItem('lastBackupDate');
      const today = new Date().toISOString().split('T')[0];
      
      if (lastBackup !== today) {
        // Schedule backup for soon
        setTimeout(async () => {
          const userData = localStorage.getItem('user');
          if (userData) {
            const user = JSON.parse(userData);
            const isOwner = user.role && user.role.toLowerCase() === 'owner';
            if (isOwner) {
              await runDailyBackup();
            }
          }
        }, 5000);
      }
    }
    
    return enabled;
  } catch (error) {
    console.error('Failed to set auto backup setting:', error);
    return false;
  }
}

/**
 * Get auto backup status
 */
export function getAutoBackupStatus() {
  try {
    const enabled = localStorage.getItem('autoBackupEnabled') !== 'false';
    const lastBackup = localStorage.getItem('lastBackupDate') || 'Never';
    
    return { 
      enabled, 
      lastBackup,
      nextBackup: enabled && lastBackup !== 'Never' ? 
        'Tomorrow' : 
        'Now (if owner and not backed up today)'
    };
  } catch (error) {
    console.error('Failed to get auto backup status:', error);
    return { enabled: true, lastBackup: 'Unknown', nextBackup: 'Unknown' };
  }
}

/**
 * Clear backup history (reset last backup date)
 */
export function clearBackupHistory() {
  try {
    localStorage.removeItem('lastBackupDate');
    console.log('Backup history cleared');
    return true;
  } catch (error) {
    console.error('Failed to clear backup history:', error);
    return false;
  }
}

/**
 * Manual trigger for testing
 */
export async function triggerManualBackup() {
  try {
    const userData = localStorage.getItem('user');
    if (!userData) {
      alert('Please log in first');
      return false;
    }

    const user = JSON.parse(userData);
    
    // Check if user is owner
    const isOwner = user.role && user.role.toLowerCase() === 'owner';
    if (!isOwner) {
      alert('Only owners can create backups');
      return false;
    }

    const result = await createBackup(
      user.user_id, 
      user.username || 'System', 
      'Manual Trigger Backup'
    );

    if (result.success) {
      // Always use web download for manual backup too
      const blob = new Blob([result.json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = result.fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      
      link.click();
      
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
      
      // Update last backup date
      localStorage.setItem('lastBackupDate', new Date().toISOString().split('T')[0]);
      
      alert(`✅ Backup created successfully!\n\nFile: ${result.fileName}\n\nDownload should start automatically. If not, check your browser settings.`);
      return true;
    } else {
      alert(`❌ Backup failed:\n${result.error?.message || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.error('Manual backup error:', error);
    alert(`❌ Backup error:\n${error.message}`);
    return false;
  }
}

/**
 * Force backup regardless of date (for emergencies)
 */
export async function forceBackupNow() {
  try {
    const userData = localStorage.getItem('user');
    if (!userData) {
      throw new Error('No user logged in');
    }

    const user = JSON.parse(userData);
    const isOwner = user.role && user.role.toLowerCase() === 'owner';
    if (!isOwner) {
      throw new Error('Only owners can create backups');
    }

    console.log('Forcing backup now...');
    
    const result = await createBackup(
      user.user_id, 
      user.username || 'System', 
      'Emergency Forced Backup'
    );

    if (result.success) {
      // Use web download
      const blob = new Blob([result.json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = result.fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      
      link.click();
      
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
      
      console.log(`✅ Emergency backup created: ${result.fileName}`);
      return { success: true, fileName: result.fileName, location: 'Browser downloads' };
    } else {
      throw new Error(result.error?.message || 'Backup creation failed');
    }
  } catch (error) {
    console.error('Force backup failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize auto backup system
 */
export function initAutoBackup() {
  try {
    // Check if auto backup is enabled (default to true)
    const autoBackupEnabled = localStorage.getItem('autoBackupEnabled');
    if (autoBackupEnabled === null) {
      localStorage.setItem('autoBackupEnabled', 'true');
    }
    
    console.log('Auto backup system initialized');
    console.log('Auto backup status:', getAutoBackupStatus());
    
    return true;
  } catch (error) {
    console.error('Failed to initialize auto backup:', error);
    return false;
  }
}