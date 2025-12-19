import { createBackup, downloadBackupFile } from './backupService';

/**
 * Run daily backup automatically for owners
 */
export async function runDailyBackup() {
  try {
    const userData = localStorage.getItem('user');
    if (!userData) {
      console.log('No user logged in, skipping auto backup');
      return;
    }

    const user = JSON.parse(userData);
    
    // Check if user is owner (case-insensitive)
    const isOwner = user.role && user.role.toLowerCase() === 'owner';
    if (!isOwner) {
      console.log('User is not owner, skipping auto backup');
      return;
    }

    // Check last backup date
    const lastBackup = localStorage.getItem('lastBackupDate');
    const today = new Date().toISOString().split('T')[0];

    if (lastBackup === today) {
      console.log('Already backed up today, skipping');
      return;
    }

    console.log('Running automatic daily backup...');
    
    // Create backup
    const result = await createBackup(
      user.user_id, 
      user.username || 'System', 
      'Automatic Daily Backup'
    );

    if (result.success) {
      // ✅ FIXED: Actually download the file
      const downloadSuccess = downloadBackupFile(result.backupData, result.fileName);
      
      if (downloadSuccess) {
        // Save backup date
        localStorage.setItem('lastBackupDate', today);
        console.log(`✅ Daily auto backup completed: ${result.fileName}`);
        
        // Show notification if possible
        if (window.Notification && Notification.permission === 'granted') {
          new Notification('TindaTrack Auto Backup', {
            body: `Daily backup created: ${result.fileName}`,
            icon: '/favicon.ico'
          });
        }
      } else {
        console.error('❌ Auto backup created but download failed');
      }
    } else {
      console.error('❌ Auto backup creation failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Error running daily backup:', error);
  }
}

/**
 * Check and run backup if needed (call this on app startup)
 */
export async function checkAndRunBackup() {
  try {
    await runDailyBackup();
  } catch (error) {
    console.error('Backup check failed:', error);
  }
}

/**
 * Manual trigger for testing
 */
export async function triggerManualBackup() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (!user.user_id) {
    alert('Please log in first');
    return;
  }

  const result = await createBackup(
    user.user_id, 
    user.username || 'System', 
    'Manual Trigger Backup'
  );

  if (result.success) {
    downloadBackupFile(result.backupData, result.fileName);
    alert(`Backup created: ${result.fileName}`);
  } else {
    alert(`Backup failed: ${result.error?.message || 'Unknown error'}`);
  }
}