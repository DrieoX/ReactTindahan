import React, { useState, useEffect } from 'react';
import { createBackup, restoreBackup, downloadBackupFile, logAudit } from '../services/backupService';
import { runDailyBackup } from '../services/autoBackup';
import { dataService } from '../services/DataService'; // CHANGED: Use DataService instead of direct db import

export default function BackupScreen() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [backupHistory, setBackupHistory] = useState([]);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backupName, setBackupName] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showRestoreOptions, setShowRestoreOptions] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [capAvailable, setCapAvailable] = useState(false);
  const [lastDownloadInfo, setLastDownloadInfo] = useState(null);
  const [restoreOption, setRestoreOption] = useState('merge'); // 'overwrite' or 'merge'
  const [tablesToRestore, setTablesToRestore] = useState({
    products: true,
    categories: true,
    suppliers: true,
    inventory: true,
    sales: true,
    sale_items: true,
    stock_card: true,
    users: true,
    product_units: true,
    resupplied_items: true
  });
  const [backupStats, setBackupStats] = useState(null);

  useEffect(() => {
    checkCapacitor();
    fetchBackupHistory();
  }, []);

  const checkCapacitor = async () => {
    try {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(isMobileDevice);
      
      const isCapacitor = typeof window !== 'undefined' && window.Capacitor;
      setCapAvailable(isCapacitor);
      
      console.log('Capacitor available:', isCapacitor, 'Mobile:', isMobileDevice);
    } catch (error) {
      console.log('Capacitor check failed, using web mode:', error);
      setCapAvailable(false);
    }
  };

  const fetchBackupHistory = async () => {
    try {
      // CHANGED: Use DataService
      const allBackups = await dataService.getAll('backup');
      const filteredBackups = allBackups
        .filter(backup => 
          backup.backup_type !== 'audit' && 
          ['full', 'restore', 'deleted_product', 'deleted_category'].includes(backup.backup_type)
        )
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 50);
      
      setBackupHistory(filteredBackups);
    } catch (error) {
      console.error('Error fetching backup history:', error);
      setMessage({ 
        type: 'error', 
        text: `Failed to load backup history: ${error.message}` 
      });
    }
  };

  const handleCreateBackup = async () => {
    if (!backupName.trim()) {
      setMessage({ type: 'error', text: 'Please enter a backup name' });
      return;
    }

    setCreatingBackup(true);
    setMessage({ type: '', text: '' });

    try {
      const result = await createBackup(user.user_id, user.username, backupName);
      
      if (result.success) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const betterFileName = `TindaTrack_${backupName.replace(/\s+/g, '_')}_${timestamp}.json`;
        
        const downloadResult = await downloadBackupFile(result.json, betterFileName);
        
        if (downloadResult.success) {
          let successMessage = `✅ Backup created successfully!\n`;
          successMessage += `📁 File: ${betterFileName}\n`;
          successMessage += `📦 Size: ${formatFileSize(result.json.length)}\n\n`;
          
          if (capAvailable) {
            successMessage += `📍 **Saved to:** ${downloadResult.location || 'Documents folder'}\n`;
            successMessage += `📱 **Find it in:** Files app → Documents folder\n`;
            successMessage += `🔍 **Tip:** Look for files starting with "TindaTrack_"`;
            
            setLastDownloadInfo({
              fileName: betterFileName,
              location: downloadResult.location || 'Documents folder',
              timestamp: new Date().toLocaleString(),
              size: formatFileSize(result.json.length)
            });
          } else if (isMobile) {
            successMessage += `📱 Check your Downloads folder\n`;
            successMessage += `🔍 Enable "Show hidden files" in file manager`;
          } else {
            successMessage += `💾 File downloaded to your default download folder`;
          }
          
          setMessage({ 
            type: 'success', 
            text: successMessage 
          });
          
          fetchBackupHistory();
          setBackupName('');
        } else {
          throw new Error('Failed to download file: ' + downloadResult.error);
        }
      } else {
        throw new Error(result.error?.message || 'Backup creation failed');
      }
    } catch (error) {
      console.error('Backup error:', error);
      setMessage({ 
        type: 'error', 
        text: `❌ Backup failed: ${error.message}\n\nTry using a different file name or check storage permissions.`
      });
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      setMessage({ type: 'error', text: 'Please select a valid JSON file (.json)' });
      return;
    }

    try {
      // Preview backup stats
      const text = await file.text();
      const backupData = JSON.parse(text);
      
      // Analyze backup content
      const stats = {
        file_name: file.name,
        file_size: file.size,
        tables: {},
        total_records: 0
      };
      
      Object.keys(backupData).forEach(tableName => {
        if (Array.isArray(backupData[tableName])) {
          const count = backupData[tableName].length;
          stats.tables[tableName] = count;
          stats.total_records += count;
        }
      });
      
      setBackupStats(stats);
      setSelectedFile(file);
      setMessage({ 
        type: 'info', 
        text: `📊 Backup file loaded!\n📁 ${file.name}\n📊 ${stats.total_records} records across ${Object.keys(stats.tables).length} tables` 
      });
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: `❌ Invalid backup file: ${error.message}` 
      });
      setSelectedFile(null);
      setBackupStats(null);
    }
  };

  const showRestoreDialog = () => {
    if (!selectedFile) {
      setMessage({ type: 'error', text: 'Please select a backup file first' });
      return;
    }
    setShowRestoreOptions(true);
  };

  const handleRestoreBackup = async () => {
    if (!selectedFile) return;

    setRestoring(true);
    setMessage({ type: '', text: '' });

    try {
      const result = await restoreBackup(
        selectedFile, 
        user.user_id, 
        user.username,
        restoreOption,
        tablesToRestore
      );
      
      if (result.success) {
        setMessage({ 
          type: 'success', 
          text: `✅ Backup ${restoreOption === 'overwrite' ? 'restored' : 'merged'} successfully!\n\n📊 ${result.stats?.restored || 0} records restored\n🔄 ${result.stats?.skipped || 0} records skipped\n⏳ Page will refresh in 2 seconds...` 
        });

        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        throw new Error(result.error?.message || 'Restore failed');
      }
    } catch (error) {
      console.error('Restore error:', error);
      setMessage({ 
        type: 'error', 
        text: `❌ Restore failed: ${error.message}\n\nPlease ensure:\n1. It's a valid TindaTrack backup file\n2. File is not corrupted\n3. You're using the same app version` 
      });
    } finally {
      setRestoring(false);
      setShowRestoreOptions(false);
      setSelectedFile(null);
      setBackupStats(null);
      fetchBackupHistory();
    }
  };

  const handleRunAutoBackup = async () => {
    setCreatingBackup(true);
    try {
      const success = await runDailyBackup();
      if (success) {
        setMessage({ 
          type: 'success', 
          text: '✅ Automatic backup completed!\nCheck your Documents folder for the file.' 
        });
        fetchBackupHistory();
      } else {
        setMessage({ 
          type: 'error', 
          text: '⚠️ Automatic backup skipped or failed.\nMake sure:\n1. You are logged in as Owner\n2. Not already backed up today\n3. Storage permissions are granted' 
        });
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: `❌ Auto backup error: ${error.message}` 
      });
    } finally {
      setCreatingBackup(false);
    }
  };

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid date';
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (backupType) => {
    switch (backupType) {
      case 'full': return '📦';
      case 'restore': return '🔄';
      case 'deleted_product': return '🗑️📦';
      case 'deleted_category': return '🗑️🏷️';
      default: return '📄';
    }
  };

  const clearMessage = () => {
    setMessage({ type: '', text: '' });
  };

  const showDownloadHelp = () => {
    setMessage({
      type: 'info',
      text: `📱 **Finding Downloaded Backups on Mobile:**\n
1. Open your **Files** or **File Manager** app
2. Navigate to **Documents** folder (NOT Downloads)
3. Look for files starting with **"TindaTrack_"**
4. Files are named like: TindaTrack_Monthly_Backup_2024-01-15T10-30-00Z.json\n
📍 **On Android:** Files app → Browse → Documents
📍 **On iOS:** Files app → Browse → On My iPhone/iPad → TindaTrack app → Documents\n
💡 **Tip:** If you don't see the file, try restarting the app and creating the backup again.`
    });
  };

  const toggleAllTables = (checked) => {
    const newTables = {};
    Object.keys(tablesToRestore).forEach(key => {
      newTables[key] = checked;
    });
    setTablesToRestore(newTables);
  };

  const toggleTable = (tableName) => {
    setTablesToRestore(prev => ({
      ...prev,
      [tableName]: !prev[tableName]
    }));
  };

  const getCurrentDataCount = async (tableName) => {
    try {
      const data = await dataService.getAll(tableName);
      return data.length;
    } catch {
      return 0;
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.headerSection}>
        <h1 style={styles.header}>Backup & Restore</h1>
        <p style={styles.subheader}>
          {capAvailable 
            ? 'Backup to device storage or share'
            : 'Download backups to your computer'}
        </p>
        {capAvailable && (
          <div style={styles.mobileNotice}>
            📱 Mobile mode: Backups saved to Documents folder
            <button 
              onClick={showDownloadHelp}
              style={styles.helpButton}
              title="How to find downloaded files"
            >
              ?
            </button>
          </div>
        )}
      </div>

      {lastDownloadInfo && (
        <div style={styles.downloadInfo}>
          <div style={styles.downloadInfoHeader}>
            <span>📥 Last Download Info</span>
            <button 
              onClick={() => setLastDownloadInfo(null)}
              style={styles.closeInfoButton}
            >
              ✕
            </button>
          </div>
          <div style={styles.downloadInfoContent}>
            <p><strong>File:</strong> {lastDownloadInfo.fileName}</p>
            <p><strong>Saved to:</strong> {lastDownloadInfo.location}</p>
            <p><strong>Time:</strong> {lastDownloadInfo.timestamp}</p>
            <p><strong>Size:</strong> {lastDownloadInfo.size}</p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div style={styles.statsContainer}>
        <div style={styles.statCard}>
          <div style={styles.statIcon}>📦</div>
          <div>
            <p style={styles.statValue}>{backupHistory.length}</p>
            <p style={styles.statLabel}>Total Backups</p>
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statIcon}>🔄</div>
          <div>
            <p style={styles.statValue}>
              {backupHistory.filter(b => b.backup_type === 'restore').length}
            </p>
            <p style={styles.statLabel}>Restores</p>
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statIcon}>⏱️</div>
          <div>
            <p style={styles.statValue}>
              {backupHistory.length > 0 
                ? formatDate(backupHistory[0]?.created_at).split(',')[0]
                : 'Never'
              }
            </p>
            <p style={styles.statLabel}>Last Backup</p>
          </div>
        </div>
      </div>

      {/* Message Display */}
      {message.text && (
        <div 
          style={{
            ...styles.message,
            backgroundColor: message.type === 'success' ? '#d1fae5' : 
                           message.type === 'error' ? '#fee2e2' : 
                           message.type === 'info' ? '#dbeafe' : '#fef3c7',
            color: message.type === 'success' ? '#065f46' : 
                   message.type === 'error' ? '#991b1b' : 
                   message.type === 'info' ? '#1e40af' : '#92400e',
            borderColor: message.type === 'success' ? '#10b981' : 
                         message.type === 'error' ? '#ef4444' : 
                         message.type === 'info' ? '#3b82f6' : '#f59e0b'
          }}
          onClick={clearMessage}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <span style={{ fontSize: '16px', marginTop: '2px' }}>
              {message.type === 'success' ? '✅' : 
               message.type === 'error' ? '❌' : 
               message.type === 'info' ? '💡' : '⚠️'}
            </span>
            <span style={{ whiteSpace: 'pre-line', flex: 1 }}>{message.text}</span>
            <button 
              onClick={clearMessage}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '0 4px'
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Action Section */}
      <div style={styles.contentContainer}>
        {/* Create Backup */}
        <div style={styles.section}>
          <h3 style={styles.sectionHeader}>Create New Backup</h3>
          <div style={styles.backupForm}>
            <input
              type="text"
              placeholder="Enter backup name (e.g., Monthly Backup)"
              value={backupName}
              onChange={(e) => setBackupName(e.target.value)}
              style={styles.input}
              disabled={creatingBackup}
            />
            <button
              onClick={handleCreateBackup}
              style={{
                ...styles.primaryButton,
                opacity: (creatingBackup || !backupName.trim()) ? 0.6 : 1,
                cursor: (creatingBackup || !backupName.trim()) ? 'not-allowed' : 'pointer'
              }}
              disabled={creatingBackup || !backupName.trim()}
            >
              {creatingBackup ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={styles.spinner}></div>
                  Creating...
                </span>
              ) : capAvailable ? '💾 Create & Save to Device' : '💾 Create & Download Backup'}
            </button>
          </div>
          <p style={styles.helpText}>
            {capAvailable 
              ? 'Backup will be saved to Documents folder. Files are named: TindaTrack_[Name]_[Timestamp].json'
              : 'Backup will be downloaded as a JSON file. Save it in a safe location.'}
          </p>
        </div>

        {/* Restore Backup */}
        <div style={styles.section}>
          <h3 style={styles.sectionHeader}>Restore from Backup</h3>
          <div style={styles.restoreForm}>
            <div style={styles.fileUpload}>
              <input
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                style={styles.fileInput}
                id="backupFile"
                disabled={restoring}
              />
              <label 
                htmlFor="backupFile" 
                style={{
                  ...styles.fileLabel,
                  opacity: restoring ? 0.6 : 1,
                  cursor: restoring ? 'not-allowed' : 'pointer'
                }}
              >
                {selectedFile 
                  ? `📁 ${selectedFile.name}` 
                  : '📁 Choose backup file (.json)'}
              </label>
              {selectedFile && (
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setBackupStats(null);
                  }}
                  style={styles.clearButton}
                  disabled={restoring}
                >
                  ✕
                </button>
              )}
            </div>
            
            {/* Backup File Stats */}
            {backupStats && (
              <div style={styles.backupStats}>
                <div style={styles.statsHeader}>
                  <span style={styles.statsTitle}>📊 Backup Contents:</span>
                  <span style={styles.statsTotal}>{backupStats.total_records} records</span>
                </div>
                <div style={styles.statsGrid}>
                  {Object.entries(backupStats.tables).map(([table, count]) => (
                    <div key={table} style={styles.statItem}>
                      <span style={styles.statTableName}>{table}</span>
                      <span style={styles.statTableCount}>{count} records</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <button
              onClick={showRestoreDialog}
              style={{
                ...styles.warningButton,
                opacity: (!selectedFile || restoring) ? 0.6 : 1,
                cursor: (!selectedFile || restoring) ? 'not-allowed' : 'pointer'
              }}
              disabled={!selectedFile || restoring}
            >
              {restoring ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={styles.spinner}></div>
                  Preparing...
                </span>
              ) : '🔄 Restore Options'}
            </button>
          </div>
          <p style={styles.warningText}>
            ⚠️ <strong>Note:</strong> You can choose what to restore and whether to merge or overwrite data.
          </p>
        </div>

        {/* Backup History */}
        <div style={styles.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={styles.sectionHeader}>Backup History</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={handleRunAutoBackup}
                style={styles.secondaryButton}
                title="Create automatic backup"
                disabled={creatingBackup}
              >
                ⚡ Auto Backup
              </button>
              <button 
                onClick={fetchBackupHistory}
                style={styles.refreshButton}
                title="Refresh history"
              >
                🔄 Refresh
              </button>
            </div>
          </div>
          
          {backupHistory.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>📁</div>
              <p style={styles.emptyText}>No backup history found</p>
              <p style={styles.emptySubtext}>Create your first backup to get started</p>
            </div>
          ) : (
            <div style={styles.tableContainer}>
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeader}>
                      <th style={styles.tableHeaderCell}>Type</th>
                      <th style={styles.tableHeaderCell}>Name</th>
                      <th style={styles.tableHeaderCell}>Created By</th>
                      <th style={styles.tableHeaderCell}>Date</th>
                      <th style={styles.tableHeaderCell}>Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backupHistory.map((backup, index) => (
                      <tr 
                        key={backup.backup_id || index} 
                        style={index % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd}
                      >
                        <td style={styles.tableCell}>
                          <span style={styles.typeBadge}>
                            {getFileIcon(backup.backup_type)} {backup.backup_type}
                          </span>
                        </td>
                        <td style={styles.tableCell}>
                          <strong>{backup.backup_name}</strong>
                          {backup.file_name && (
                            <div style={styles.fileName}>{backup.file_name}</div>
                          )}
                        </td>
                        <td style={styles.tableCell}>
                          {backup.username || 'System'}
                          {backup.user_id && (
                            <div style={styles.userId}>ID: {backup.user_id}</div>
                          )}
                        </td>
                        <td style={styles.tableCell}>
                          {formatDate(backup.created_at)}
                        </td>
                        <td style={styles.tableCell}>
                          {formatFileSize(backup.file_size)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Restore Options Modal */}
      {showRestoreOptions && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContainer}>
            <h3 style={styles.modalHeader}>🔄 Restore Options</h3>
            <div style={styles.modalContent}>
              
              {/* Restore Mode Selection */}
              <div style={styles.optionSection}>
                <h4 style={styles.optionTitle}>Restore Mode</h4>
                <div style={styles.optionGrid}>
                  <label style={styles.optionCard}>
                    <input
                      type="radio"
                      name="restoreOption"
                      value="merge"
                      checked={restoreOption === 'merge'}
                      onChange={(e) => setRestoreOption(e.target.value)}
                      style={styles.radioInput}
                    />
                    <div style={styles.optionContent}>
                      <div style={styles.optionIcon}>🔄</div>
                      <div>
                        <strong>Merge Data</strong>
                        <p style={styles.optionDescription}>
                          Add backup data without deleting existing records. Duplicates may be created.
                        </p>
                      </div>
                    </div>
                  </label>
                  
                  <label style={styles.optionCard}>
                    <input
                      type="radio"
                      name="restoreOption"
                      value="overwrite"
                      checked={restoreOption === 'overwrite'}
                      onChange={(e) => setRestoreOption(e.target.value)}
                      style={styles.radioInput}
                    />
                    <div style={styles.optionContent}>
                      <div style={styles.optionIcon}>⚠️</div>
                      <div>
                        <strong>Full Overwrite</strong>
                        <p style={styles.optionDescription}>
                          Delete all existing data and replace with backup. This cannot be undone!
                        </p>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Tables Selection */}
              <div style={styles.optionSection}>
                <div style={styles.tablesHeader}>
                  <h4 style={styles.optionTitle}>Select Tables to Restore</h4>
                  <div style={styles.tableSelectActions}>
                    <button 
                      type="button"
                      onClick={() => toggleAllTables(true)}
                      style={styles.smallButton}
                    >
                      Select All
                    </button>
                    <button 
                      type="button"
                      onClick={() => toggleAllTables(false)}
                      style={styles.smallButton}
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
                
                <div style={styles.tablesGrid}>
                  {Object.entries(tablesToRestore).map(([table, isSelected]) => (
                    <label key={table} style={styles.tableCheckbox}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTable(table)}
                        style={styles.checkboxInput}
                      />
                      <div style={styles.tableCheckboxContent}>
                        <span style={styles.tableName}>{table}</span>
                        <span style={styles.tableInfo}>
                          {backupStats?.tables[table] || 0} in backup
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Warning Box */}
              {restoreOption === 'overwrite' && (
                <div style={styles.modalWarningBox}>
                  <p><strong>⚠️ WARNING: Full Overwrite Selected</strong></p>
                  <ul style={styles.modalList}>
                    <li>All selected tables will be completely cleared</li>
                    <li>Existing data will be permanently deleted</li>
                    <li>This action cannot be undone</li>
                    <li>Make sure you have a current backup</li>
                  </ul>
                </div>
              )}

              {/* File Info */}
              <div style={styles.modalFileInfo}>
                <p><strong>File to restore:</strong></p>
                <p style={styles.fileNameText}>{selectedFile?.name || 'Unknown file'}</p>
                {backupStats && (
                  <div style={styles.fileStats}>
                    <span>📊 {backupStats.total_records} total records</span>
                    <span>📁 {formatFileSize(backupStats.file_size)}</span>
                  </div>
                )}
              </div>
            </div>
            <div style={styles.modalButtons}>
              <button
                onClick={() => setShowRestoreOptions(false)}
                style={styles.cancelButton}
                disabled={restoring}
              >
                Cancel
              </button>
              <button
                onClick={handleRestoreBackup}
                style={restoreOption === 'overwrite' ? styles.dangerButton : styles.primaryButton}
                disabled={restoring}
              >
                {restoring ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={styles.spinner}></div>
                    {restoreOption === 'overwrite' ? 'Overwriting...' : 'Merging...'}
                  </span>
                ) : restoreOption === 'overwrite' ? '⚠️ Yes, Overwrite All' : '🔄 Merge Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


const styles = {
  container: {
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
    fontFamily: 'Arial, sans-serif',
    width: '100%',
    boxSizing: 'border-box',
    overflowX: 'hidden'
  },
  headerSection: {
    textAlign: 'center',
    marginBottom: '30px',
    width: '100%',
    boxSizing: 'border-box'
  },
  header: {
    fontSize: '32px',
    color: '#2c3e50',
    marginBottom: '10px',
    '@media (max-width: 768px)': {
      fontSize: '24px'
    }
  },
  subheader: {
    fontSize: '16px',
    color: '#7f8c8d',
    marginBottom: '10px',
    '@media (max-width: 768px)': {
      fontSize: '14px'
    }
  },
  mobileNotice: {
    backgroundColor: '#e3f2fd',
    padding: '10px 15px',
    borderRadius: '8px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '10px',
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '100%'
  },
  helpButton: {
    backgroundColor: '#2196f3',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    width: '24px',
    height: '24px',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  downloadInfo: {
    backgroundColor: '#e8f5e9',
    border: '1px solid #4caf50',
    borderRadius: '8px',
    padding: '15px',
    marginBottom: '20px',
    width: '100%',
    boxSizing: 'border-box'
  },
  downloadInfoHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
    width: '100%'
  },
  downloadInfoContent: {
    fontSize: '14px'
  },
  closeInfoButton: {
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '16px',
    cursor: 'pointer',
    color: '#666'
  },
  statsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
    width: '100%',
    boxSizing: 'border-box',
    '@media (max-width: 768px)': {
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '15px'
    },
    '@media (max-width: 480px)': {
      gridTemplateColumns: '1fr'
    }
  },
  statCard: {
    backgroundColor: 'white',
    border: '1px solid #e0e0e0',
    borderRadius: '10px',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    boxSizing: 'border-box',
    width: '100%',
    overflow: 'hidden',
    '@media (max-width: 768px)': {
      padding: '15px',
      gap: '12px'
    }
  },
  statIcon: {
    fontSize: '32px',
    flexShrink: 0,
    '@media (max-width: 768px)': {
      fontSize: '28px'
    }
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    margin: 0,
    color: '#2c3e50',
    '@media (max-width: 768px)': {
      fontSize: '20px'
    }
  },
  statLabel: {
    fontSize: '14px',
    color: '#7f8c8d',
    margin: 0,
    '@media (max-width: 768px)': {
      fontSize: '13px'
    }
  },
  message: {
    padding: '15px',
    borderRadius: '8px',
    marginBottom: '20px',
    border: '1px solid',
    cursor: 'pointer',
    width: '100%',
    boxSizing: 'border-box'
  },
  contentContainer: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '30px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    width: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
    '@media (max-width: 768px)': {
      padding: '20px'
    }
  },
  section: {
    marginBottom: '40px',
    width: '100%',
    boxSizing: 'border-box',
    '@media (max-width: 768px)': {
      marginBottom: '30px'
    }
  },
  sectionHeader: {
    fontSize: '20px',
    color: '#2c3e50',
    marginBottom: '20px',
    paddingBottom: '10px',
    borderBottom: '2px solid #f0f0f0',
    '@media (max-width: 768px)': {
      fontSize: '18px',
      marginBottom: '15px'
    }
  },
  backupForm: {
    display: 'flex',
    gap: '10px',
    marginBottom: '10px',
    width: '100%',
    boxSizing: 'border-box',
    '@media (max-width: 768px)': {
      flexDirection: 'column',
      gap: '15px'
    }
  },
  input: {
    flex: 1,
    padding: '12px 15px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '16px',
    width: '100%',
    boxSizing: 'border-box',
    '@media (max-width: 768px)': {
      fontSize: '16px', // Prevent iOS zoom
      width: '100%'
    }
  },
  primaryButton: {
    backgroundColor: '#2196f3',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background-color 0.3s',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    '@media (max-width: 768px)': {
      width: '100%',
      padding: '14px 20px',
      fontSize: '16px'
    }
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid #ffffff',
    borderTop: '2px solid transparent',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  helpText: {
    fontSize: '14px',
    color: '#666',
    marginTop: '5px',
    width: '100%',
    boxSizing: 'border-box'
  },
  restoreForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
    width: '100%',
    boxSizing: 'border-box'
  },
  fileUpload: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    boxSizing: 'border-box'
  },
  fileInput: {
    display: 'none'
  },
  fileLabel: {
    flex: 1,
    padding: '12px 15px',
    border: '2px dashed #ddd',
    borderRadius: '6px',
    textAlign: 'center',
    cursor: 'pointer',
    backgroundColor: '#f9f9f9',
    transition: 'all 0.3s',
    width: '100%',
    boxSizing: 'border-box'
  },
  clearButton: {
    position: 'absolute',
    right: '10px',
    backgroundColor: '#ff4444',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    width: '24px',
    height: '24px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  warningButton: {
    backgroundColor: '#ff9800',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    width: '100%',
    boxSizing: 'border-box',
    '@media (max-width: 768px)': {
      width: '100%',
      padding: '14px 20px'
    }
  },
  warningText: {
    backgroundColor: '#fff3cd',
    border: '1px solid #ffecb5',
    color: '#856404',
    padding: '12px',
    borderRadius: '6px',
    fontSize: '14px',
    marginTop: '15px',
    width: '100%',
    boxSizing: 'border-box'
  },
  secondaryButton: {
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    '@media (max-width: 768px)': {
      width: '100%',
      padding: '10px 20px',
      fontSize: '15px'
    }
  },
  refreshButton: {
    backgroundColor: '#17a2b8',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    '@media (max-width: 768px)': {
      width: '100%',
      padding: '10px 20px',
      fontSize: '15px'
    }
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px',
    color: '#7f8c8d',
    width: '100%',
    boxSizing: 'border-box'
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '10px'
  },
  emptyText: {
    fontSize: '18px',
    marginBottom: '5px'
  },
  emptySubtext: {
    fontSize: '14px'
  },
  tableContainer: {
    overflowX: 'auto',
    width: '100%',
    maxWidth: '100%',
    WebkitOverflowScrolling: 'touch',
    msOverflowStyle: '-ms-autohiding-scrollbar'
  },
  tableWrapper: {
    minWidth: '800px',
    width: '100%'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  tableHeader: {
    backgroundColor: '#f8f9fa',
    borderBottom: '2px solid #dee2e6'
  },
  tableHeaderCell: {
    padding: '12px',
    textAlign: 'left',
    fontWeight: 'bold',
    color: '#495057',
    whiteSpace: 'nowrap',
    '@media (max-width: 768px)': {
      padding: '10px',
      fontSize: '13px'
    }
  },
  tableRowEven: {
    backgroundColor: '#f8f9fa'
  },
  tableRowOdd: {
    backgroundColor: 'white'
  },
  tableCell: {
    padding: '12px',
    borderBottom: '1px solid #dee2e6',
    '@media (max-width: 768px)': {
      padding: '10px',
      fontSize: '13px'
    }
  },
  typeBadge: {
    display: 'inline-block',
    padding: '4px 8px',
    backgroundColor: '#e9ecef',
    borderRadius: '4px',
    fontSize: '12px',
    whiteSpace: 'nowrap'
  },
  fileName: {
    fontSize: '12px',
    color: '#666',
    marginTop: '4px',
    wordBreak: 'break-all'
  },
  userId: {
    fontSize: '12px',
    color: '#999',
    marginTop: '2px',
    wordBreak: 'break-all'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
    boxSizing: 'border-box'
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '30px',
    maxWidth: '500px',
    width: '90%',
    boxSizing: 'border-box',
    '@media (max-width: 768px)': {
      padding: '20px',
      width: '95%'
    }
  },
  modalHeader: {
    fontSize: '20px',
    color: '#dc3545',
    marginBottom: '20px',
    '@media (max-width: 768px)': {
      fontSize: '18px'
    }
  },
  modalContent: {
    marginBottom: '30px',
    width: '100%',
    boxSizing: 'border-box'
  },
  modalText: {
    fontSize: '16px',
    marginBottom: '20px',
    '@media (max-width: 768px)': {
      fontSize: '15px'
    }
  },
  modalWarningBox: {
    backgroundColor: '#fff3cd',
    border: '1px solid #ffecb5',
    borderRadius: '6px',
    padding: '15px',
    marginBottom: '20px',
    width: '100%',
    boxSizing: 'border-box'
  },
  modalList: {
    margin: '10px 0',
    paddingLeft: '20px',
    width: '100%',
    boxSizing: 'border-box'
  },
  modalFileInfo: {
    backgroundColor: '#f8f9fa',
    padding: '10px',
    borderRadius: '6px',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box',
    wordBreak: 'break-all'
  },
  modalButtons: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
    width: '100%',
    boxSizing: 'border-box',
    '@media (max-width: 768px)': {
      flexDirection: 'column'
    }
  },
  cancelButton: {
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 20px',
    cursor: 'pointer',
    '@media (max-width: 768px)': {
      width: '100%',
      padding: '12px 20px'
    }
  },
  dangerButton: {
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 20px',
    cursor: 'pointer',
    '@media (max-width: 768px)': {
      width: '100%',
      padding: '12px 20px'
    }
  }
};

// Add CSS animation for spinner
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  @media (max-width: 768px) {
    /* Prevent horizontal scrolling */
    body {
      overflow-x: hidden;
      max-width: 100vw;
    }
    
    /* Improve button touch targets */
    button {
      min-height: 44px;
    }
  }
`;
document.head.appendChild(styleSheet);
