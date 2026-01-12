import React, { useState, useEffect } from 'react';
import { createBackup, restoreBackup, downloadBackupFile } from '../services/backupService';
import { runDailyBackup } from '../services/autoBackup';
import { dataService } from '../services/DataService';

export default function BackupScreen() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [backupHistory, setBackupHistory] = useState([]);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backupName, setBackupName] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showConfirmRestore, setShowConfirmRestore] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [capAvailable, setCapAvailable] = useState(false);
  const [lastDownloadInfo, setLastDownloadInfo] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

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
      setLoadingHistory(true);
      
      // Fetch backup history using dataService
      const allBackups = await dataService.getAll('backup');
      
      // Filter only actual backups (not audit logs) and parse details
      const filteredBackups = allBackups
        .filter(backup => 
          backup && backup.backup_type && 
          backup.backup_type !== 'audit'
        )
        .map(backup => {
          // Parse details to get auto backup info
          let isAutoBackup = false;
          try {
            if (backup.details) {
              const details = JSON.parse(backup.details);
              isAutoBackup = details.isAutoBackup || false;
            }
          } catch (e) {
            // If can't parse, it's not auto backup
          }
          
          return {
            ...backup,
            is_auto_backup: isAutoBackup
          };
        })
        .filter(backup => 
          ['full', 'restore', 'deleted_product', 'deleted_category', 'deleted_supplier'].includes(backup.backup_type)
        )
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 50);
      
      setBackupHistory(filteredBackups);
      setLoadingHistory(false);
    } catch (error) {
      console.error('Error fetching backup history:', error);
      setMessage({ 
        type: 'error', 
        text: `Failed to load backup history: ${error.message}` 
      });
      setLoadingHistory(false);
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
      // Pass false for isAutoBackup since this is manual backup
      const result = await createBackup(user.user_id, user.username, backupName, false);
      
      if (result.success) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const betterFileName = `TindaTrack_${backupName.replace(/\s+/g, '_')}_${timestamp}.json`;
        
        const downloadResult = await downloadBackupFile(result.json, betterFileName);
        
        if (downloadResult.success) {
          let successMessage = `✅ Backup created successfully!\n`;
          successMessage += `📁 File: ${betterFileName}\n`;
          successMessage += `📦 Size: ${formatFileSize(result.json.length)}\n\n`;
          
          if (capAvailable) {
            successMessage += `📍 **Saved to:** ${downloadResult.location || 'Browser downloads'}\n`;
            successMessage += `📱 **Find it in:** Files app → Downloads folder\n`;
          } else {
            successMessage += `💾 File downloaded to your default download folder\n`;
            successMessage += `🔍 **Tip:** Check browser download settings if file doesn't appear`;
          }
          
          setMessage({ 
            type: 'success', 
            text: successMessage 
          });
          
          setLastDownloadInfo({
            fileName: betterFileName,
            location: downloadResult.location || 'Downloads folder',
            timestamp: new Date().toLocaleString(),
            size: formatFileSize(result.json.length)
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
        text: `❌ Backup failed: ${error.message}\n\nTry using a different file name or check browser settings.`
      });
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      setMessage({ type: 'error', text: 'Please select a valid JSON file (.json)' });
      return;
    }

    setSelectedFile(file);
    setMessage({ type: '', text: '' });
  };

  const confirmRestore = () => {
    if (!selectedFile) {
      setMessage({ type: 'error', text: 'Please select a backup file first' });
      return;
    }
    setShowConfirmRestore(true);
  };

  const handleRestoreBackup = async () => {
    if (!selectedFile) return;

    setRestoring(true);
    setMessage({ type: '', text: '' });

    try {
      const result = await restoreBackup(selectedFile, user.user_id, user.username);
      
      if (result.success) {
        setMessage({ 
          type: 'success', 
          text: '✅ Backup restored successfully! Page will refresh in 2 seconds...' 
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
      setShowConfirmRestore(false);
      setSelectedFile(null);
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
          text: '✅ Automatic backup completed!\nCheck your downloads folder for the file.' 
        });
        fetchBackupHistory();
      } else {
        setMessage({ 
          type: 'error', 
          text: '⚠️ Automatic backup skipped or failed.\nMake sure:\n1. You are logged in as Owner\n2. Not already backed up today\n3. Browser allows downloads' 
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

  const getFileIcon = (backupType, isAutoBackup = false) => {
    switch (backupType) {
      case 'full': 
        return isAutoBackup ? '⚡📦' : '📦';
      case 'restore': return '🔄';
      case 'deleted_product': return '🗑️📦';
      case 'deleted_category': return '🗑️🏷️';
      case 'deleted_supplier': return '🗑️🏢';
      default: return '📄';
    }
  };

  const clearMessage = () => {
    setMessage({ type: '', text: '' });
  };

  const showDownloadHelp = () => {
    setMessage({
      type: 'info',
      text: `💡 **Download Help:**\n
1. Backups use standard browser download\n
2. Check your browser's download folder\n
3. On mobile, check the Downloads app\n
4. If download doesn't start:\n
   • Check browser popup blockers\n
   • Allow downloads from this site\n
   • Try a different browser\n
5. Files are named: TindaTrack_[Name]_[Timestamp].json`
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.headerSection}>
        <h1 style={styles.header}>Backup & Restore</h1>
        <p style={styles.subheader}>
          Create and restore backups of your data
        </p>
        {capAvailable && (
          <div style={styles.mobileNotice}>
            📱 Mobile mode: Using browser download
            <button 
              onClick={showDownloadHelp}
              style={styles.helpButton}
              title="Download help"
            >
              ?
            </button>
          </div>
        )}
      </div>

      {/* Last Download Info */}
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
              ) : '💾 Create & Download Backup'}
            </button>
          </div>
          <p style={styles.helpText}>
            Backup will be downloaded as a JSON file. Save it in a safe location.
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
                  onClick={() => setSelectedFile(null)}
                  style={styles.clearButton}
                  disabled={restoring}
                >
                  ✕
                </button>
              )}
            </div>
            <button
              onClick={confirmRestore}
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
                  Restoring...
                </span>
              ) : '🔄 Restore Backup'}
            </button>
          </div>
          <p style={styles.warningText}>
            ⚠️ <strong>Warning:</strong> Restoring will overwrite all current data. 
            Make sure you have a recent backup.
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
                disabled={loadingHistory}
              >
                {loadingHistory ? 'Loading...' : '🔄 Refresh'}
              </button>
            </div>
          </div>
          
          {loadingHistory ? (
            <div style={styles.loadingState}>
              <div style={styles.loadingSpinner}></div>
              <p>Loading backup history...</p>
            </div>
          ) : backupHistory.length === 0 ? (
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
                            {getFileIcon(backup.backup_type, backup.is_auto_backup)} {backup.backup_type}
                            {backup.is_auto_backup && <span style={{marginLeft: '4px', color: '#f59e0b'}}>(Auto)</span>}
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

      {/* Restore Confirmation Modal */}
      {showConfirmRestore && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContainer}>
            <h3 style={styles.modalHeader}>⚠️ Confirm Restore</h3>
            <div style={styles.modalContent}>
              <p style={styles.modalText}>
                Are you sure you want to restore from backup?
              </p>
              <div style={styles.modalWarningBox}>
                <p><strong>This will:</strong></p>
                <ul style={styles.modalList}>
                  <li>Overwrite all current data</li>
                  <li>Replace products, sales, inventory, and suppliers</li>
                  <li>Clear all existing records</li>
                  <li>Cannot be undone</li>
                </ul>
              </div>
              <p style={styles.modalFileInfo}>
                <strong>File to restore:</strong><br/>
                {selectedFile?.name || 'Unknown file'}
              </p>
            </div>
            <div style={styles.modalButtons}>
              <button
                onClick={() => setShowConfirmRestore(false)}
                style={styles.cancelButton}
                disabled={restoring}
              >
                Cancel
              </button>
              <button
                onClick={handleRestoreBackup}
                style={styles.dangerButton}
                disabled={restoring}
              >
                {restoring ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={styles.spinner}></div>
                    Restoring...
                  </span>
                ) : 'Yes, Restore Now'}
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
    margin: '0 auto'
  },
  headerSection: {
    marginBottom: '24px',
    textAlign: 'center'
  },
  header: {
    fontSize: '28px',
    fontWeight: 'bold',
    marginBottom: '8px',
    color: '#1f2937'
  },
  subheader: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '12px'
  },
  mobileNotice: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    borderRadius: '8px',
    fontSize: '14px'
  },
  helpButton: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  downloadInfo: {
    backgroundColor: '#f0f9ff',
    border: '1px solid #bae6fd',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px'
  },
  downloadInfoHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    fontWeight: 'bold',
    color: '#0369a1'
  },
  closeInfoButton: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '18px',
    padding: '0'
  },
  downloadInfoContent: {
    fontSize: '14px',
    color: '#334155'
  },
  statsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px'
  },
  statCard: {
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  statIcon: {
    fontSize: '32px'
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    margin: '0',
    color: '#111827'
  },
  statLabel: {
    fontSize: '14px',
    color: '#6b7280',
    margin: '4px 0 0 0'
  },
  message: {
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '24px',
    border: '1px solid',
    cursor: 'pointer'
  },
  contentContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px'
  },
  section: {
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  sectionHeader: {
    fontSize: '20px',
    fontWeight: '600',
    marginBottom: '20px',
    color: '#1f2937'
  },
  backupForm: {
    display: 'flex',
    gap: '12px',
    marginBottom: '12px',
    alignItems: 'center'
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '16px',
    outline: 'none',
    transition: 'border-color 0.2s'
  },
  primaryButton: {
    padding: '12px 24px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '200px'
  },
  helpText: {
    fontSize: '14px',
    color: '#6b7280',
    margin: '0'
  },
  restoreForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '16px'
  },
  fileUpload: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  fileInput: {
    display: 'none'
  },
  fileLabel: {
    flex: 1,
    padding: '12px 16px',
    border: '2px dashed #d1d5db',
    borderRadius: '8px',
    fontSize: '16px',
    color: '#6b7280',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  clearButton: {
    padding: '8px 12px',
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  warningButton: {
    padding: '12px 24px',
    backgroundColor: '#f59e0b',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  warningText: {
    fontSize: '14px',
    color: '#92400e',
    backgroundColor: '#fef3c7',
    padding: '12px',
    borderRadius: '6px',
    margin: '0'
  },
  secondaryButton: {
    padding: '8px 16px',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  refreshButton: {
    padding: '8px 16px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    color: '#6b7280'
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px'
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    color: '#9ca3af',
    textAlign: 'center'
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px'
  },
  emptyText: {
    fontSize: '18px',
    fontWeight: '500',
    marginBottom: '8px',
    color: '#6b7280'
  },
  emptySubtext: {
    fontSize: '14px',
    color: '#9ca3af'
  },
  tableContainer: {
    overflowX: 'auto'
  },
  tableWrapper: {
    minWidth: '600px'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  tableHeader: {
    backgroundColor: '#f9fafb',
    borderBottom: '2px solid #e5e7eb'
  },
  tableHeaderCell: {
    padding: '12px 16px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#374151',
    fontSize: '14px'
  },
  tableRowEven: {
    backgroundColor: 'white'
  },
  tableRowOdd: {
    backgroundColor: '#f9fafb'
  },
  tableCell: {
    padding: '12px 16px',
    borderBottom: '1px solid #e5e7eb',
    fontSize: '14px',
    color: '#4b5563'
  },
  typeBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
    borderRadius: '4px',
    fontSize: '12px'
  },
  fileName: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px'
  },
  userId: {
    fontSize: '12px',
    color: '#9ca3af',
    marginTop: '2px'
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTop: '2px solid white',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
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
    padding: '20px'
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '500px',
    width: '100%',
    boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
  },
  modalHeader: {
    fontSize: '20px',
    fontWeight: '600',
    marginBottom: '16px',
    color: '#dc2626'
  },
  modalContent: {
    marginBottom: '24px'
  },
  modalText: {
    fontSize: '16px',
    color: '#4b5563',
    marginBottom: '16px'
  },
  modalWarningBox: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px'
  },
  modalList: {
    margin: '8px 0 0 20px',
    color: '#991b1b',
    fontSize: '14px'
  },
  modalFileInfo: {
    fontSize: '14px',
    color: '#6b7280',
    backgroundColor: '#f3f4f6',
    padding: '12px',
    borderRadius: '6px',
    margin: '0'
  },
  modalButtons: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end'
  },
  cancelButton: {
    padding: '10px 20px',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  dangerButton: {
    padding: '10px 20px',
    backgroundColor: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  }
};

// Add CSS animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);