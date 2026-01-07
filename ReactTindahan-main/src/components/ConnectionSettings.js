// src/components/ConnectionSettings.js
import React, { useState } from 'react';
import { dataService } from '../services/DataService';

export default function ConnectionSettings() {
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  
  const connectionInfo = dataService.getConnectionInfo();
  
  const testConnection = async () => {
    if (!url.trim()) return;
    
    setTesting(true);
    setMessage('');
    
    try {
      // Clean up the URL
      let cleanUrl = url.trim();
      
      // If no protocol specified, add http://
      if (!cleanUrl.startsWith('http')) {
        cleanUrl = `http://${cleanUrl}`;
      }
      
      // If no port specified, add :3001
      if (!cleanUrl.includes(':3001') && !cleanUrl.includes(':')) {
        cleanUrl = `${cleanUrl}:3001`;
      }
      
      console.log(`Testing connection to: ${cleanUrl}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${cleanUrl}/api/health`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.app === 'inventory-owner') {
          setMessageType('success');
          setMessage(`✅ Connected successfully to ${cleanUrl}`);
          
          // Save to DataService
          dataService.manuallySetOwnerIP(cleanUrl.replace('http://', '').replace(':3001', ''));
          
          // Update UI
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          setMessageType('error');
          setMessage(`❌ Server responded but is not an inventory owner server`);
        }
      } else {
        setMessageType('error');
        setMessage(`❌ Server returned error: ${response.status}`);
      }
    } catch (error) {
      setMessageType('error');
      setMessage(`Error: ${error.message}`);
    } finally {
      setTesting(false);
    }
  };
  
  const resetConnection = () => {
    localStorage.removeItem('owner_ip');
    dataService.serverStatus = 'disconnected';
    setMessageType('info');
    setMessage('Connection reset. Please enter a new server URL.');
    
    // Reload to show connection setup
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };
  
  const tryAutoConnect = async () => {
    setTesting(true);
    setMessage('🔍 Searching for owner server on network...');
    
    try {
      const connected = await dataService.reconnect();
      if (connected) {
        setMessageType('success');
        setMessage('✅ Found and connected to owner server!');
        
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setMessageType('error');
        setMessage('❌ Could not find owner server automatically');
      }
    } catch (error) {
      setMessageType('error');
      setMessage(`Error: ${error.message}`);
    } finally {
      setTesting(false);
    }
  };
  
  return (
    <div style={styles.container}>
      <h3>🔗 Server Connection Settings</h3>
      
      <div style={styles.currentStatus}>
        <div style={styles.statusRow}>
          <strong>Current Status:</strong> 
          <span style={{
            color: connectionInfo.isConnected ? '#10b981' : '#ef4444',
            fontWeight: 'bold'
          }}>
            {connectionInfo.isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div style={styles.statusRow}>
          <strong>Mode:</strong> {connectionInfo.isOwner ? '👑 Owner' : '👥 Client'}
        </div>
        {connectionInfo.serverUrl && (
          <div style={styles.statusRow}>
            <strong>Server URL:</strong> {connectionInfo.serverUrl}
          </div>
        )}
        {connectionInfo.protocol && (
          <div style={styles.statusRow}>
            <strong>Protocol:</strong> {connectionInfo.protocol}
          </div>
        )}
      </div>
      
      <div style={styles.formGroup}>
        <label>Enter Owner Server Address:</label>
        <div style={styles.inputGroup}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="e.g., 192.168.100.53"
            style={styles.input}
          />
          <button 
            onClick={testConnection} 
            disabled={testing || !url.trim()}
            style={styles.button}
          >
            {testing ? 'Testing...' : 'Connect'}
          </button>
        </div>
        <small style={styles.helpText}>
          Enter the owner's IP address (no http:// needed)
        </small>
      </div>
      
      {message && (
        <div style={{
          ...styles.message,
          backgroundColor: messageType === 'success' ? '#d1fae5' : 
                          messageType === 'error' ? '#fee2e2' : '#e0f2fe',
          color: messageType === 'success' ? '#065f46' : 
                 messageType === 'error' ? '#991b1b' : '#1e40af'
        }}>
          {message}
        </div>
      )}
      
      <div style={styles.actions}>
        <button 
          onClick={tryAutoConnect}
          disabled={testing}
          style={styles.autoButton}
        >
          🔍 Auto-discover Server
        </button>
        <button 
          onClick={resetConnection}
          style={styles.secondaryButton}
        >
          🔄 Reset Connection
        </button>
      </div>
      
      <div style={styles.troubleshoot}>
        <h4>📋 For Your Network (192.168.100.*):</h4>
        <ul style={styles.instructions}>
          <li>Owner IP address: <code>192.168.100.53</code></li>
          <li>Port: <code>3001</code></li>
          <li>Full URL: <code>http://192.168.100.53:3001</code></li>
          <li>Enter in field above: <code>192.168.100.53</code></li>
        </ul>
        
        <h4 style={{marginTop: '15px'}}>🔧 Troubleshooting:</h4>
        <ul style={styles.instructions}>
          <li>Make sure owner app is running on computer</li>
          <li>Both devices must be on same WiFi: <code>192.168.100.*</code></li>
          <li>Check Windows Firewall allows port 3001</li>
          <li>Staff device should be on same subnet (192.168.100.X)</li>
        </ul>
      </div>
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: '#f8f9fa',
    padding: '20px',
    borderRadius: '8px',
    margin: '20px 0',
    maxWidth: '600px'
  },
  currentStatus: {
    backgroundColor: '#e9ecef',
    padding: '15px',
    borderRadius: '6px',
    marginBottom: '20px',
    fontSize: '14px'
  },
  statusRow: {
    marginBottom: '8px',
    display: 'flex',
    justifyContent: 'space-between'
  },
  formGroup: {
    marginBottom: '20px'
  },
  inputGroup: {
    display: 'flex',
    gap: '10px',
    marginTop: '8px'
  },
  input: {
    flex: 1,
    padding: '12px',
    border: '1px solid #ced4da',
    borderRadius: '6px',
    fontSize: '16px'
  },
  button: {
    padding: '12px 24px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  autoButton: {
    padding: '12px 24px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  secondaryButton: {
    padding: '12px 24px',
    backgroundColor: '#6b7280',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    cursor: 'pointer'
  },
  helpText: {
    color: '#6c757d',
    marginTop: '5px',
    display: 'block'
  },
  message: {
    padding: '15px',
    borderRadius: '6px',
    marginBottom: '20px',
    fontSize: '14px',
    textAlign: 'center',
    fontWeight: '500'
  },
  actions: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px'
  },
  troubleshoot: {
    backgroundColor: '#e9ecef',
    padding: '15px',
    borderRadius: '6px',
    fontSize: '14px'
  },
  instructions: {
    paddingLeft: '20px',
    lineHeight: '1.6'
  }
};