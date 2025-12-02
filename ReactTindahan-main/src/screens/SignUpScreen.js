import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerUser, checkAPIHealth } from '../services/APIService';

export default function SignupScreen() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Mode selection for signup
  const [mode, setMode] = useState('Server');
  const [serverIP, setServerIP] = useState(null);
  const [serverStatus, setServerStatus] = useState(null);

  // Resolve server IP based on mode
  useEffect(() => {
    const resolveServerIP = async () => {
      if (mode === 'Server') {
        // Server mode → localhost
        const ip = '127.0.0.1';
        setServerIP(ip);
        window.serverIP = ip;
        localStorage.setItem('pos_server_ip', ip);
        setServerStatus({ success: true, message: 'Running in local server mode' });
      } else {
        // Client mode - try to get server IP
        let ip = null;
        
        // 1. Check if already set globally
        if (window.serverIP) {
          ip = window.serverIP;
        }
        // 2. Check localStorage
        else if (localStorage.getItem('pos_server_ip')) {
          ip = localStorage.getItem('pos_server_ip');
        }
        // 3. Prompt user
        else {
          const manual = window.prompt('Enter POS server IP address (LAN):\nExample: 192.168.1.100\n\nFind IP on desktop using:\n- Windows: ipconfig\n- Mac/Linux: ifconfig');
          if (manual) {
            ip = manual.trim();
          }
        }
        
        if (ip) {
          setServerIP(ip);
          window.serverIP = ip;
          localStorage.setItem('pos_server_ip', ip);
          
          // Test connection
          await testServerConnection(ip);
        } else {
          setServerIP(null);
          setServerStatus({ 
            success: false, 
            message: 'No server IP configured. Please select Server mode or enter IP manually.' 
          });
        }
      }
    };
    
    resolveServerIP();
  }, [mode]);

  const testServerConnection = async (ip) => {
    setIsLoading(true);
    try {
      const result = await checkAPIHealth();
      
      if (result.success) {
        setServerStatus({ 
          success: true, 
          message: `✅ Connected to ${result.data?.server || 'POS Server'} v${result.data?.version || '1.0.0'}`,
          details: result.data
        });
      } else {
        setServerStatus({ 
          success: false, 
          message: `❌ Cannot connect: ${result.error || 'Server not responding'}` 
        });
      }
    } catch (error) {
      setServerStatus({ 
        success: false, 
        message: `❌ Connection failed: ${error.message}` 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    // Validation
    if (!fullName || !storeName || !email || !password || !confirmPassword) {
      alert('Please fill out all fields.');
      return;
    }
    
    if (password !== confirmPassword) {
      alert('Passwords do not match.');
      return;
    }
    
    if (password.length < 6) {
      alert('Password must be at least 6 characters long.');
      return;
    }
    
    if (mode === 'Client' && !serverIP) {
      alert('Cannot resolve server IP. Please check network configuration.');
      return;
    }
    
    if (mode === 'Client' && serverStatus && !serverStatus.success) {
      const proceed = window.confirm(
        `Server connection may have issues:\n${serverStatus.message}\n\nDo you want to continue anyway?`
      );
      if (!proceed) return;
    }

    setIsLoading(true);
    try {
      // Use the updated registerUser from APIService
      const result = await registerUser({
        username: email,
        password: password,
        role: 'Owner',
        full_name: fullName,
        store_name: storeName
      });

      if (result.success) {
        alert('✅ Account created successfully! Please login with your credentials.');
        navigate('/');
      } else {
        alert(result.error || 'Registration failed. Please try again.');
      }
    } catch (err) {
      console.error('Registration error:', err);
      alert('Something went wrong. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualIP = () => {
    const manual = window.prompt(
      'Enter POS server IP address:\n\nExample: 192.168.1.100\n\nFind IP on desktop using:\n- Windows: Open Command Prompt and type "ipconfig"\n- Mac/Linux: Open Terminal and type "ifconfig"',
      serverIP || ''
    );
    
    if (manual) {
      const ip = manual.trim();
      setServerIP(ip);
      window.serverIP = ip;
      localStorage.setItem('pos_server_ip', ip);
      testServerConnection(ip);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isLoading) {
      handleRegister();
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Logo/Brand */}
        <div style={styles.brandSection}>
          <div style={styles.icon}>🛒</div>
          <h1 style={styles.title}>Create Account</h1>
          <p style={styles.subtitle}>Set up your POS system</p>
        </div>

        {/* Form Section */}
        <div style={styles.formSection}>
          <div style={styles.formGroup}>
            <label style={styles.label}>
              <span style={styles.labelText}>Full Name</span>
              <input
                type="text"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onKeyPress={handleKeyPress}
                style={styles.input}
                disabled={isLoading}
              />
            </label>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              <span style={styles.labelText}>Store Name</span>
              <input
                type="text"
                placeholder="Enter store/business name"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                onKeyPress={handleKeyPress}
                style={styles.input}
                disabled={isLoading}
              />
            </label>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              <span style={styles.labelText}>Email Address</span>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyPress={handleKeyPress}
                style={styles.input}
                disabled={isLoading}
              />
            </label>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              <span style={styles.labelText}>Password</span>
              <div style={styles.passwordWrapper}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Create password (min. 6 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                  style={styles.input}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.passwordToggle}
                  disabled={isLoading}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </label>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              <span style={styles.labelText}>Confirm Password</span>
              <div style={styles.passwordWrapper}>
                <input
                  type={showConfirm ? "text" : "password"}
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                  style={styles.input}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  style={styles.passwordToggle}
                  disabled={isLoading}
                >
                  {showConfirm ? '🙈' : '👁️'}
                </button>
              </div>
            </label>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              <span style={styles.labelText}>Connection Mode</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                style={styles.select}
                disabled={isLoading}
              >
                <option value="Server">Server Mode (Local Database)</option>
                <option value="Client">Client Mode (Connect to Server)</option>
              </select>
            </label>
            
            {mode === 'Client' && (
              <div style={styles.serverInfo}>
                <p style={styles.serverInfoText}>
                  Server IP: <span style={styles.serverIP}>{serverIP || 'Not set'}</span>
                </p>
                {serverStatus && (
                  <p style={{
                    ...styles.serverStatus,
                    color: serverStatus.success ? '#10b981' : '#ef4444'
                  }}>
                    {serverStatus.message}
                  </p>
                )}
                <button
                  onClick={handleManualIP}
                  style={styles.manualIPButton}
                  disabled={isLoading}
                >
                  {serverIP ? 'Change Server IP' : 'Enter Server IP'}
                </button>
                {isLoading && (
                  <p style={styles.connectingText}>Testing connection...</p>
                )}
              </div>
            )}
            
            {mode === 'Server' && (
              <p style={styles.serverInfoText}>
                Running in local server mode. The database will be stored on this device.
              </p>
            )}
          </div>

          <button
            style={{
              ...styles.button,
              ...(isLoading ? styles.buttonDisabled : {})
            }}
            onClick={handleRegister}
            disabled={isLoading}
          >
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </button>

          <p style={styles.footer}>
            Already have an account?{' '}
            <button
              onClick={() => navigate('/')}
              style={styles.linkButton}
              disabled={isLoading}
            >
              Sign in here
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    width: '100%',
    maxWidth: '480px',
    overflow: 'hidden'
  },
  brandSection: {
    padding: '40px 40px 20px',
    textAlign: 'center',
    borderBottom: '1px solid #eaeaea'
  },
  icon: {
    fontSize: '48px',
    marginBottom: '16px'
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#333',
    margin: '0 0 8px'
  },
  subtitle: {
    fontSize: '16px',
    color: '#666',
    margin: 0
  },
  formSection: {
    padding: '40px'
  },
  formGroup: {
    marginBottom: '24px'
  },
  label: {
    display: 'block',
    marginBottom: '8px'
  },
  labelText: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '8px'
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '16px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s'
  },
  passwordWrapper: {
    position: 'relative'
  },
  passwordToggle: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px'
  },
  select: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '16px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    backgroundColor: 'white',
    cursor: 'pointer'
  },
  serverInfo: {
    marginTop: '12px',
    padding: '16px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #eaeaea'
  },
  serverInfoText: {
    fontSize: '14px',
    color: '#666',
    margin: '0 0 8px'
  },
  serverIP: {
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#333',
    backgroundColor: '#f3f4f6',
    padding: '2px 6px',
    borderRadius: '4px'
  },
  serverStatus: {
    fontSize: '14px',
    margin: '8px 0',
    fontWeight: '500'
  },
  manualIPButton: {
    width: '100%',
    padding: '10px',
    marginTop: '8px',
    backgroundColor: 'transparent',
    color: '#4f46e5',
    border: '1px solid #4f46e5',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600'
  },
  connectingText: {
    fontSize: '14px',
    color: '#666',
    textAlign: 'center',
    margin: '8px 0 0',
    fontStyle: 'italic'
  },
  button: {
    width: '100%',
    padding: '14px',
    fontSize: '16px',
    fontWeight: '600',
    backgroundColor: '#4f46e5',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    marginTop: '8px'
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed'
  },
  footer: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#666',
    margin: '24px 0 0'
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#4f46e5',
    textDecoration: 'underline',
    cursor: 'pointer',
    fontSize: '14px',
    padding: 0
  }
};