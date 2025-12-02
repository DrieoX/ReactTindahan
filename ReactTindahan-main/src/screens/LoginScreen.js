import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser } from '../services/UserService';

// Server discovery utility function
const discoverServers = async () => {
  const servers = [];
  const savedIP = localStorage.getItem('pos_server_ip');
  
  // Check saved server first
  if (savedIP && savedIP !== '127.0.0.1') {
    try {
      const response = await fetch(`http://${savedIP}:5000/api/health`, {
        method: 'GET',
        timeout: 2000
      });
      if (response.ok) {
        servers.push({
          ip: savedIP,
          name: 'Last Connected Server',
          type: 'saved'
        });
      }
    } catch (error) {
      // Server not reachable, continue with discovery
    }
  }
  
  // Try mDNS/Bonjour discovery if available
  if (typeof Zeroconf !== 'undefined') {
    try {
      const mdnsServers = await discoverMDNSServers();
      servers.push(...mdnsServers);
    } catch (error) {
      console.log('mDNS discovery failed, falling back to IP scan');
    }
  }
  
  // Try common local IP ranges (simplified discovery)
  const commonIPs = generateLocalIPs();
  
  // Test a limited number of IPs (for performance)
  const testIPs = commonIPs.slice(0, 50);
  
  const scanPromises = testIPs.map(async (ip) => {
    try {
      const response = await Promise.race([
        fetch(`http://${ip}:5000/api/health`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000))
      ]);
      
      if (response && response.ok) {
        const healthData = await response.json();
        return {
          ip,
          name: healthData.server || 'POS Server',
          type: 'discovered'
        };
      }
    } catch (error) {
      return null;
    }
    return null;
  });
  
  const results = await Promise.all(scanPromises);
  const validResults = results.filter(Boolean);
  servers.push(...validResults);
  
  return servers;
};

// mDNS discovery function
const discoverMDNSServers = () => {
  return new Promise((resolve) => {
    const servers = [];
    
    // This would use the Zeroconf plugin in a real app
    // For now, return empty and rely on IP scanning
    resolve(servers);
  });
};

// Generate common local network IPs
const generateLocalIPs = () => {
  const ips = [];
  
  // Get current IP from URL if available (for web apps)
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    const parts = window.location.hostname.split('.');
    if (parts.length === 4) {
      const base = parts.slice(0, 3).join('.');
      for (let i = 1; i <= 20; i++) { // Limit scanning range
        ips.push(`${base}.${i}`);
      }
    }
  }
  
  // Add common local IP ranges with limited scanning
  for (let i = 1; i <= 20; i++) {
    ips.push(`192.168.1.${i}`);
    ips.push(`192.168.0.${i}`);
    ips.push(`10.0.0.${i}`);
  }
  
  return [...new Set(ips)]; // Remove duplicates
};

export default function LoginScreen({ setUserMode }) {
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [serverIP, setServerIP] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [discoveredServers, setDiscoveredServers] = useState([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [manualIP, setManualIP] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);

  // Discover servers when in client mode
  useEffect(() => {
    if (mode === 'Client') {
      handleServerDiscovery();
    } else if (mode === 'Server') {
      setServerIP('127.0.0.1');
      window.serverIP = '127.0.0.1';
      localStorage.setItem('pos_server_ip', '127.0.0.1');
      setDiscoveredServers([]);
    }
    
    // Debug network info
    debugNetworkInfo();
  }, [mode]);

  const debugNetworkInfo = () => {
    const info = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      hostname: window.location.hostname,
      timestamp: new Date().toISOString()
    };
    console.log('=== NETWORK DEBUG INFO ===', info);
    setDebugInfo(info);
  };

  const handleServerDiscovery = async () => {
    setIsDiscovering(true);
    try {
      const servers = await discoverServers();
      setDiscoveredServers(servers);
      
      // Auto-select first server if found
      if (servers.length > 0) {
        const selectedServer = servers[0];
        setServerIP(selectedServer.ip);
        window.serverIP = selectedServer.ip;
        localStorage.setItem('pos_server_ip', selectedServer.ip);
      } else {
        // No servers found, show manual input
        setShowManualInput(true);
      }
    } catch (error) {
      console.error('Server discovery error:', error);
      setShowManualInput(true);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleServerSelect = (ip) => {
    setServerIP(ip);
    window.serverIP = ip;
    localStorage.setItem('pos_server_ip', ip);
    setShowManualInput(false);
  };

  const handleManualIPSubmit = () => {
    if (manualIP.trim()) {
      const ip = manualIP.trim();
      handleServerSelect(ip);
      setManualIP('');
    }
  };

  const validateServerConnection = async (ip) => {
    try {
      const response = await fetch(`http://${ip}:5000/api/health`, {
        method: 'GET',
        timeout: 3000
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Server connection successful:', data);
        return {
          success: true,
          data
        };
      } else {
        return {
          success: false,
          message: 'Server responded with error'
        };
      }
    } catch (error) {
      console.error('Server connection failed:', error);
      return {
        success: false,
        message: `Cannot connect: ${error.message}`
      };
    }
  };

  const handleLogin = async () => {
    if (!mode) {
      alert('Please select Server or Client mode first.');
      return;
    }
    
    if (mode === 'Client' && !serverIP) {
      alert('Please select or enter a server IP address.');
      return;
    }

    // Validate server connection for Client mode
    if (mode === 'Client') {
      const connectionResult = await validateServerConnection(serverIP);
      if (!connectionResult.success) {
        alert(`Cannot connect to server at ${serverIP}.\nError: ${connectionResult.message}\n\nPlease check:\n1. Server is running on desktop\n2. Firewall allows port 5000\n3. Both devices on same WiFi`);
        return;
      }
    }

    setIsLoading(true);
    try {
      const result = await loginUser(username, password, serverIP);

      if (result.success) {
        const normalizedMode = mode.toLowerCase();
        
        // Store session data
        localStorage.setItem("user", JSON.stringify(result.user));
        localStorage.setItem("userMode", normalizedMode);
        
        // Update global state
        setUserMode(normalizedMode);
        
        // Navigate to dashboard
        navigate('/dashboard', { replace: true });
      } else {
        alert(result.error || 'Login failed. Please check credentials.');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Network error. Please check server connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      if (mode === 'Client' && showManualInput && manualIP) {
        handleManualIPSubmit();
      } else if (username && password && mode && (mode === 'Server' || serverIP)) {
        handleLogin();
      }
    }
  };

  const refreshDiscovery = () => {
    if (mode === 'Client') {
      handleServerDiscovery();
    }
  };

  // Manual connection helper component
  const ManualConnectionHelper = () => {
    const [desktopIP, setDesktopIP] = useState('');
    const [connectionTest, setConnectionTest] = useState(null);

    const testConnection = async () => {
      if (!desktopIP) return;
      
      setConnectionTest('testing');
      const result = await validateServerConnection(desktopIP);
      
      if (result.success) {
        setConnectionTest({
          success: true,
          message: `Connected to ${result.data.server}`,
          ip: result.data.ip,
          version: result.data.version
        });
        handleServerSelect(desktopIP);
      } else {
        setConnectionTest({
          success: false,
          message: result.message
        });
      }
    };

    return (
      <div style={styles.manualHelper}>
        <h4 style={styles.helperTitle}>Manual Connection</h4>
        <p style={styles.helperText}>
          Find your desktop IP address (use ipconfig on Windows or ifconfig on Mac/Linux) and enter it below:
        </p>
        <div style={styles.ipInputGroup}>
          <input
            type="text"
            placeholder="e.g., 192.168.1.100"
            value={desktopIP}
            onChange={(e) => setDesktopIP(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && testConnection()}
            style={styles.ipInput}
          />
          <button
            onClick={testConnection}
            style={styles.testButton}
            disabled={!desktopIP}
          >
            Test
          </button>
        </div>
        {connectionTest && connectionTest !== 'testing' && (
          <div style={{
            ...styles.testResult,
            backgroundColor: connectionTest.success ? '#d1fae5' : '#fee2e2',
            color: connectionTest.success ? '#065f46' : '#991b1b'
          }}>
            {connectionTest.message}
            {connectionTest.success && (
              <div style={styles.successDetails}>
                <div>IP: {connectionTest.ip}</div>
                <div>Version: {connectionTest.version}</div>
              </div>
            )}
          </div>
        )}
        {connectionTest === 'testing' && (
          <div style={styles.testResult}>
            Testing connection...
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Logo/Brand */}
        <div style={styles.brandSection}>
          <div style={styles.icon}>🛒</div>
          <h1 style={styles.title}>POS System</h1>
          <p style={styles.subtitle}>Sign in to continue</p>
        </div>

        {/* Form Section */}
        <div style={styles.formSection}>
          <div style={styles.formGroup}>
            <label style={styles.label}>
              <span style={styles.labelText}>Email Address</span>
              <input
                type="email"
                placeholder="you@example.com"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={handleKeyPress}
                style={styles.input}
                autoCapitalize="none"
                autoComplete="email"
                enterKeyHint="next"
              />
            </label>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              <span style={styles.labelText}>Password</span>
              <div style={styles.passwordWrapper}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                  style={styles.input}
                  autoComplete="current-password"
                  enterKeyHint="go"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.passwordToggle}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </label>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              <span style={styles.labelText}>Connection Mode</span>
              <select
                value={mode || ''}
                onChange={(e) => setMode(e.target.value)}
                style={styles.select}
                onKeyPress={handleKeyPress}
              >
                <option value="" disabled hidden>Select mode</option>
                <option value="Server">Server Mode (Local Database)</option>
                <option value="Client">Client Mode (Connect to Server)</option>
              </select>
            </label>
            
            {/* Server Discovery for Client Mode */}
            {mode === 'Client' && (
              <div style={styles.serverDiscovery}>
                <div style={styles.discoveryHeader}>
                  <span style={styles.discoveryTitle}>
                    {isDiscovering ? 'Searching for servers...' : 'Available Servers'}
                  </span>
                  <button
                    onClick={refreshDiscovery}
                    style={styles.refreshButton}
                    disabled={isDiscovering}
                    title="Refresh server list"
                  >
                    {isDiscovering ? '⏳' : '🔄'}
                  </button>
                </div>
                
                {isDiscovering ? (
                  <div style={styles.discoveryStatus}>
                    <p style={styles.discoveryText}>Scanning network for POS servers...</p>
                  </div>
                ) : discoveredServers.length > 0 ? (
                  <div style={styles.serverList}>
                    {discoveredServers.map((server, index) => (
                      <div
                        key={index}
                        onClick={() => handleServerSelect(server.ip)}
                        style={{
                          ...styles.serverItem,
                          ...(serverIP === server.ip ? styles.serverItemSelected : {})
                        }}
                      >
                        <div style={styles.serverInfo}>
                          <span style={styles.serverName}>{server.name}</span>
                          <span style={styles.serverIp}>{server.ip}</span>
                        </div>
                        {serverIP === server.ip && (
                          <span style={styles.selectedIndicator}>✓</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={styles.discoveryStatus}>
                    <p style={styles.discoveryText}>No servers found automatically</p>
                  </div>
                )}
                
                {/* Manual IP Input */}
                {showManualInput && (
                  <div style={styles.manualInput}>
                    <input
                      type="text"
                      placeholder="Enter server IP (e.g., 192.168.1.100)"
                      value={manualIP}
                      onChange={(e) => setManualIP(e.target.value)}
                      onKeyPress={handleKeyPress}
                      style={styles.manualInputField}
                    />
                    <button
                      onClick={handleManualIPSubmit}
                      style={styles.manualButton}
                      disabled={!manualIP.trim()}
                    >
                      Connect
                    </button>
                  </div>
                )}
                
                {!showManualInput && discoveredServers.length === 0 && !isDiscovering && (
                  <button
                    onClick={() => setShowManualInput(true)}
                    style={styles.manualToggleButton}
                  >
                    Enter Server IP Manually
                  </button>
                )}
                
                {/* Manual Connection Helper */}
                {(showManualInput || discoveredServers.length === 0) && !isDiscovering && (
                  <ManualConnectionHelper />
                )}
                
                {serverIP && (
                  <p style={styles.serverInfoDisplay}>
                    Selected server: <span style={styles.serverIpDisplay}>{serverIP}</span>
                  </p>
                )}
              </div>
            )}
            
            {mode === 'Server' && (
              <p style={styles.serverInfoDisplay}>
                Running in local server mode (localhost)
              </p>
            )}
          </div>

          <button
            style={{
              ...styles.button,
              ...(isLoading ? styles.buttonDisabled : {}),
              ...(!username || !password || !mode ? styles.buttonDisabled : {}),
              ...(mode === 'Client' && !serverIP ? styles.buttonDisabled : {})
            }}
            onClick={handleLogin}
            disabled={isLoading || !username || !password || !mode || (mode === 'Client' && !serverIP)}
          >
            {isLoading ? (
              <span style={styles.loadingText}>Signing in...</span>
            ) : (
              'Sign in'
            )}
          </button>

          {/* Divider */}
          <div style={styles.divider}>
            <span style={styles.dividerText}>or</span>
          </div>

          {/* Sign Up Link */}
          <p style={styles.footer}>
            Don't have an account?{' '}
            <button
              onClick={() => navigate('/signup')}
              style={styles.linkButton}
            >
              Create account
            </button>
          </p>
        </div>

        {/* Footer */}
        <div style={styles.bottomFooter}>
          <p style={styles.footerText}>
            {mode === 'Client' ? 'Client Mode' : mode === 'Server' ? 'Server Mode' : 'Select Mode'}
            {serverIP && ` • ${serverIP}`}
            {debugInfo && ` • ${navigator.platform}`}
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    padding: '16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: '480px',
    backgroundColor: 'white',
    borderRadius: '20px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.08)',
    overflow: 'hidden',
    border: '1px solid #e2e8f0',
  },
  brandSection: {
    padding: '32px 32px 24px',
    textAlign: 'center',
    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    color: 'white',
  },
  icon: {
    fontSize: '48px',
    marginBottom: '12px',
    display: 'inline-block',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    margin: '0 0 4px 0',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '14px',
    opacity: '0.9',
    margin: '0',
    fontWeight: '400',
  },
  formSection: {
    padding: '32px',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
  },
  labelText: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    fontSize: '16px',
    borderRadius: '12px',
    border: '2px solid #e5e7eb',
    backgroundColor: '#f9fafb',
    boxSizing: 'border-box',
    transition: 'all 0.2s ease',
    outline: 'none',
  },
  passwordWrapper: {
    position: 'relative',
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
    padding: '8px',
    borderRadius: '8px',
    transition: 'background-color 0.2s',
  },
  select: {
    width: '100%',
    padding: '14px 16px',
    fontSize: '16px',
    borderRadius: '12px',
    border: '2px solid #e5e7eb',
    backgroundColor: '#f9fafb',
    color: '#374151',
    cursor: 'pointer',
    outline: 'none',
    WebkitAppearance: 'none',
    appearance: 'none',
    backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23374151\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 16px center',
    backgroundSize: '16px',
  },
  serverDiscovery: {
    marginTop: '16px',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '16px',
    backgroundColor: '#f9fafb',
  },
  discoveryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  discoveryTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
  },
  refreshButton: {
    padding: '6px 12px',
    fontSize: '14px',
    backgroundColor: '#e5e7eb',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    minWidth: '40px',
    height: '32px',
  },
  discoveryStatus: {
    textAlign: 'center',
    padding: '16px',
  },
  discoveryText: {
    fontSize: '13px',
    color: '#6b7280',
    margin: '0',
  },
  serverList: {
    maxHeight: '150px',
    overflowY: 'auto',
    marginBottom: '12px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '4px',
  },
  serverItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    marginBottom: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    backgroundColor: 'white',
  },
  serverItemSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  serverInfo: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  serverName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
  },
  serverIp: {
    fontSize: '12px',
    color: '#6b7280',
    fontFamily: 'monospace',
    marginTop: '2px',
  },
  selectedIndicator: {
    color: '#10b981',
    fontWeight: 'bold',
    fontSize: '16px',
    marginLeft: '8px',
  },
  manualInput: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px',
  },
  manualInputField: {
    flex: '1',
    padding: '10px 12px',
    fontSize: '14px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    outline: 'none',
  },
  manualButton: {
    padding: '10px 16px',
    fontSize: '14px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  },
  manualToggleButton: {
    width: '100%',
    padding: '10px',
    fontSize: '14px',
    backgroundColor: 'transparent',
    color: '#3b82f6',
    border: '1px dashed #3b82f6',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '8px',
  },
  serverInfoDisplay: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '12px',
    marginBottom: '0',
  },
  serverIpDisplay: {
    fontFamily: 'monospace',
    backgroundColor: '#f3f4f6',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#374151',
  },
  button: {
    width: '100%',
    padding: '16px',
    fontSize: '16px',
    fontWeight: '600',
    color: 'white',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginTop: '8px',
    outline: 'none',
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
    opacity: '0.7',
  },
  loadingText: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '24px 0',
  },
  dividerText: {
    flex: '1',
    textAlign: 'center',
    fontSize: '14px',
    color: '#9ca3af',
    position: 'relative',
  },
  footer: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#6b7280',
    margin: '24px 0 0 0',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#3b82f6',
    fontWeight: '600',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '0',
    textDecoration: 'underline',
  },
  bottomFooter: {
    padding: '20px 32px',
    backgroundColor: '#f9fafb',
    borderTop: '1px solid #e5e7eb',
    textAlign: 'center',
  },
  footerText: {
    fontSize: '12px',
    color: '#6b7280',
    margin: '0',
  },
  // Manual helper styles
  manualHelper: {
    marginTop: '16px',
    padding: '16px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  helperTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px',
  },
  helperText: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '12px',
    lineHeight: '1.5',
  },
  ipInputGroup: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  ipInput: {
    flex: '1',
    padding: '10px 12px',
    fontSize: '14px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    outline: 'none',
  },
  testButton: {
    padding: '10px 16px',
    fontSize: '14px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  },
  testResult: {
    padding: '12px',
    borderRadius: '8px',
    fontSize: '14px',
    marginTop: '8px',
  },
  successDetails: {
    marginTop: '8px',
    fontSize: '12px',
    opacity: '0.8',
  },
};