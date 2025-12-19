import React, { useState, useEffect } from 'react';
import { createBackup, restoreBackup } from '../services/backupService';
import { db } from '../db';
// Using try-catch for Capacitor to handle version issues
let Filesystem, Share, Device;
try {
  // Try to import Capacitor plugins
  const capFilesystem = require('@capacitor/filesystem');
  const capShare = require('@capacitor/share');
  const capDevice = require('@capacitor/device');
  Filesystem = capFilesystem.Filesystem;
  Share = capShare.Share;
  Device = capDevice.Device;
} catch (error) {
  console.log('Capacitor plugins not available, running in web mode');
}

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

  useEffect(() => {
    checkCapacitor();
    fetchBackupHistory();
  }, []);

  const checkCapacitor = async () => {
    try {
      // Check if running on mobile device
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(isMobileDevice);
      
      // Check if Capacitor plugins are available
      if (Device && Filesystem && Share) {
        const info = await Device.getInfo();
        setCapAvailable(info.platform !== 'web');
      }
    } catch (error) {
      console.log('Capacitor check failed, using web mode:', error);
      setCapAvailable(false);
    }
  };

  const logAudit = async (action, details = {}) => {
    try {
      await db.backup.add({
        user_id: user.user_id,
        username: user.username || 'Unknown', // ✅ FIXED: Store username
        backup_name: `AUDIT_${action}`,
        backup_type: 'audit',
        created_at: new Date().toISOString(),
        schema_version: '5',
        details: JSON.stringify(details)
      });
    } catch (error) {
      console.error('Failed to log audit:', error);
    }
  };

  const fetchBackupHistory = async () => {
    try {
      await logAudit('VIEW_BACKUP_HISTORY', {
        user_id: user.user_id,
        username: user.username
      });

      const backups = await db.backup
        .orderBy('created_at')
        .reverse()
        .limit(50)
        .toArray();
      setBackupHistory(backups);
    } catch (error) {
      console.error('Error fetching backup history:', error);
      await logAudit('VIEW_BACKUP_HISTORY_ERROR', {
        error: error.message,
        user_id: user.user_id,
        username: user.username
      });
    }
  };

  const downloadBackupFile = (backupData, fileName) => {
    try {
      // Create blob and download link
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
      
      return { success: true, fileName };
    } catch (error) {
      console.error('Download failed:', error);
      return { success: false, error: error.message };
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
      await logAudit('CREATE_BACKUP_ATTEMPT', {
        backup_name: backupName,
        user_id: user.user_id,
        username: user.username
      });

      // Use the backup service function
      const result = await createBackup(user.user_id, user.username, backupName);
      
      if (result.success) {
        // Download the file
        const downloadResult = downloadBackupFile(result.backupData, result.fileName);
        
        if (downloadResult.success) {
          setMessage({ 
            type: 'success', 
            text: `Backup created successfully! File: ${result.fileName} downloaded.` 
          });
          
          await logAudit('CREATE_BACKUP_SUCCESS', {
            backup_name: backupName,
            file_name: result.fileName,
            user_id: user.user_id,
            username: user.username
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
        text: `Backup failed: ${error.message}`
      });

      await logAudit('CREATE_BACKUP_ERROR', {
        error: error.message,
        backup_name: backupName,
        user_id: user.user_id,
        username: user.username
      });
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      setMessage({ type: 'error', text: 'Please select a valid JSON file' });
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
      await logAudit('RESTORE_BACKUP_ATTEMPT', {
        file_name: selectedFile.name,
        user_id: user.user_id,
        username: user.username
      });

      const result = await restoreBackup(selectedFile, user.user_id, user.username);
      
      if (result.success) {
        setMessage({ 
          type: 'success', 
          text: 'Backup restored successfully! Refreshing...' 
        });

        await logAudit('RESTORE_BACKUP_SUCCESS', {
          file_name: selectedFile.name,
          user_id: user.user_id,
          username: user.username
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
        text: `Restore failed: ${error.message}. Please check the backup file.` 
      });

      await logAudit('RESTORE_BACKUP_FAILED', {
        error: error.message,
        file_name: selectedFile.name,
        user_id: user.user_id,
        username: user.username
      });
    } finally {
      setRestoring(false);
      setShowConfirmRestore(false);
      setSelectedFile(null);
      fetchBackupHistory();
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
      case 'audit': return '📊';
      case 'deleted_product': return '🗑️📦';
      case 'deleted_category': return '🗑️🏷️';
      default: return '📄';
    }
  };

  const clearMessage = () => {
    setMessage({ type: '', text: '' });
  };

  return (
    <div style={styles.container}>
      <div style={styles.headerSection}>
        <h1 style={styles.header}>Backup & Restore</h1>
        <p style={styles.subheader}>
          Download backups to your computer or device
        </p>
      </div>

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
                           message.type === 'error' ? '#fee2e2' : '#fef3c7',
            color: message.type === 'success' ? '#065f46' : 
                   message.type === 'error' ? '#991b1b' : '#92400e',
            borderColor: message.type === 'success' ? '#10b981' : 
                         message.type === 'error' ? '#ef4444' : '#f59e0b'
          }}
          onClick={clearMessage}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>
              {message.type === 'success' ? '✅' : '⚠️'}
            </span>
            <span>{message.text}</span>
            <button 
              onClick={clearMessage}
              style={{
                marginLeft: 'auto',
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
                  ? selectedFile.name 
                  : 'Choose backup file (.json)'}
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
            <button 
              onClick={fetchBackupHistory}
              style={styles.refreshButton}
              title="Refresh history"
            >
              🔄 Refresh
            </button>
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
                          {backup.username || 'Unknown'} {/* ✅ Now shows username */}
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
    padding: '16px', 
    backgroundColor: '#f8fafc', 
    minHeight: '100vh'
  },
  headerSection: {
    marginBottom: '24px'
  },
  header: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: '8px'
  },
  subheader: {
    fontSize: '16px',
    color: '#64748b',
    marginBottom: '8px'
  },
  mobileNote: {
    backgroundColor: '#e0f2fe',
    border: '1px solid #0ea5e9',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '14px',
    color: '#0369a1',
    marginTop: '8px'
  },
  statsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px'
  },
  statCard: {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },
  statIcon: {
    fontSize: '32px',
    width: '60px',
    height: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: '12px'
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: '4px'
  },
  statLabel: {
    fontSize: '14px',
    color: '#64748b'
  },
  message: {
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '24px',
    border: '2px solid',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    '&:hover': {
      opacity: 0.9
    }
  },
  contentContainer: {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
  },
  section: {
    marginBottom: '32px',
    paddingBottom: '24px',
    borderBottom: '1px solid #e2e8f0',
    '&:last-child': {
      borderBottom: 'none',
      marginBottom: 0,
      paddingBottom: 0
    }
  },
  sectionHeader: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '16px'
  },
  backupForm: {
    display: 'flex',
    gap: '12px',
    marginBottom: '12px',
    '@media (max-width: 768px)': {
      flexDirection: 'column'
    }
  },
  input: {
    flex: 1,
    padding: '10px 16px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    '&:disabled': {
      backgroundColor: '#f3f4f6',
      cursor: 'not-allowed'
    }
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
    color: 'white',
    border: 'none',
    padding: '10px 24px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    minWidth: '200px',
    '&:hover:not(:disabled)': {
      backgroundColor: '#4338ca'
    }
  },
  helpText: {
    fontSize: '14px',
    color: '#64748b',
    lineHeight: '1.5'
  },
  restoreForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '12px'
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
    padding: '10px 16px',
    backgroundColor: '#f8fafc',
    border: '2px dashed #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#64748b',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
    '&:hover': {
      borderColor: '#4f46e5'
    }
  },
  clearButton: {
    backgroundColor: '#f1f5f9',
    color: '#64748b',
    border: '1px solid #e2e8f0',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    '&:hover': {
      backgroundColor: '#fee2e2',
      color: '#ef4444'
    }
  },
  warningButton: {
    backgroundColor: '#f59e0b',
    color: 'white',
    border: 'none',
    padding: '10px 24px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    alignSelf: 'flex-start',
    '&:hover:not(:disabled)': {
      backgroundColor: '#d97706'
    }
  },
  warningText: {
    fontSize: '14px',
    color: '#92400e',
    backgroundColor: '#fffbeb',
    padding: '12px',
    borderRadius: '8px',
    borderLeft: '4px solid #f59e0b'
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 20px'
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px'
  },
  emptyText: {
    fontSize: '16px',
    color: '#64748b',
    marginBottom: '8px'
  },
  emptySubtext: {
    fontSize: '14px',
    color: '#94a3b8'
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
    backgroundColor: '#f8fafc'
  },
  tableHeaderCell: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '2px solid #e2e8f0'
  },
  tableRowEven: {
    backgroundColor: '#f8fafc'
  },
  tableRowOdd: {
    backgroundColor: '#fff'
  },
  tableCell: {
    padding: '12px 16px',
    fontSize: '14px',
    borderBottom: '1px solid #e2e8f0'
  },
  typeBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    backgroundColor: '#f1f5f9',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#475569'
  },
  fileName: {
    fontSize: '12px',
    color: '#94a3b8',
    marginTop: '4px',
    wordBreak: 'break-all'
  },
  userId: {
    fontSize: '11px',
    color: '#94a3b8',
    marginTop: '2px'
  },
  refreshButton: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    border: '1px solid #e2e8f0',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    '&:hover': {
      backgroundColor: '#e2e8f0'
    }
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: '16px'
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '24px',
    width: '100%',
    maxWidth: '500px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
  },
  modalHeader: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '16px'
  },
  modalContent: {
    marginBottom: '24px'
  },
  modalText: {
    fontSize: '14px',
    color: '#64748b',
    marginBottom: '16px',
    lineHeight: '1.5'
  },
  modalWarningBox: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fee2e2',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px'
  },
  modalList: {
    margin: '8px 0 8px 20px',
    color: '#991b1b',
    fontSize: '14px',
    lineHeight: '1.6'
  },
  modalFileInfo: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '13px',
    color: '#475569'
  },
  modalButtons: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end'
  },
  cancelButton: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    border: '1px solid #e2e8f0',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    '&:hover:not(:disabled)': {
      backgroundColor: '#e2e8f0'
    },
    '&:disabled': {
      opacity: 0.6,
      cursor: 'not-allowed'
    }
  },
  dangerButton: {
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    '&:hover:not(:disabled)': {
      backgroundColor: '#dc2626'
    },
    '&:disabled': {
      opacity: 0.6,
      cursor: 'not-allowed'
    }
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTop: '2px solid white',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  }
};

// Add spinner animation
const styleSheet = document.createElement('style');
styleSheet.innerHTML = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  @media (max-width: 768px) {
    .backup-form {
      flex-direction: column !important;
    }
    
    .primary-button {
      min-width: 100% !important;
    }
  }
`;
document.head.appendChild(styleSheet);