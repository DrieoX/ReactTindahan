import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, checkAPIHealth } from '../services/APIService';

// Server discovery utility function
const discoverServers = async () => {
  const servers = [];
  const savedIP = localStorage.getItem('pos_server_ip');
  
  // Check saved server first with longer timeout
  if (savedIP && savedIP !== '127.0.0.1') {
    try {
      const response = await fetch(`http://${savedIP}:5000/api/health`, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit'
      });
      
      // Add timeout separately
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout after 5000ms')), 5000)
      );
      
      await Promise.race([response, timeoutPromise]);
      
      if (response.ok) {
        const data = await response.json();
        servers.push({
          ip: savedIP,
          name: data.server || 'Last Connected Server',
          type: 'saved',
          version: data.version || '1.0.0'
        });
        console.log('Found saved server:', savedIP);
      }
    } catch (error) {
      console.log('Saved server not reachable:', error.message);
      // Continue with discovery
    }
  }
  
  // Try mDNS/Bonjour discovery if available (with longer timeout)
  if (typeof Zeroconf !== 'undefined') {
    try {
      const mdnsServers = await discoverMDNSServers();
      servers.push(...mdnsServers);
      console.log('mDNS discovered servers:', mdnsServers.length);
    } catch (error) {
      console.log('mDNS discovery failed:', error.message);
    }
  }
  
  // Try common local IP ranges with improved scanning
  console.log('Starting IP network scan...');
  const commonIPs = generateLocalIPs();
  
  // Test IPs in batches to avoid overwhelming the browser
  const testIPs = commonIPs.slice(0, 100); // Increased from 50 to 100
  
  // Process in batches of 5 with longer timeouts
  const batchSize = 5;
  const batches = [];
  
  for (let i = 0; i < testIPs.length; i += batchSize) {
    batches.push(testIPs.slice(i, i + batchSize));
  }
  
  for (const batch of batches) {
    const batchPromises = batch.map(async (ip) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // Increased from 1000ms to 3000ms
        
        const response = await fetch(`http://${ip}:5000/api/health`, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          signal: controller.signal
        }).catch(error => {
          if (error.name === 'AbortError') {
            throw new Error('Timeout after 3000ms');
          }
          throw error;
        });
        
        clearTimeout(timeoutId);
        
        if (response && response.ok) {
          const healthData = await response.json();
          console.log('Found server at:', ip, healthData.server);
          return {
            ip,
            name: healthData.server || 'POS Server',
            type: 'discovered',
            version: healthData.version || '1.0.0'
          };
        }
      } catch (error) {
        // Silently fail for individual IPs
        return null;
      }
      return null;
    });
    
    const batchResults = await Promise.all(batchPromises);
    const validBatchResults = batchResults.filter(Boolean);
    servers.push(...validBatchResults);
    
    // Small delay between batches to avoid overwhelming
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('Discovery complete. Found servers:', servers.length);
  
  // Remove duplicates (same IP)
  const uniqueServers = [];
  const seenIPs = new Set();
  
  for (const server of servers) {
    if (!seenIPs.has(server.ip)) {
      seenIPs.add(server.ip);
      uniqueServers.push(server);
    }
  }
  
  return uniqueServers;
};

// mDNS discovery function with longer timeout
const discoverMDNSServers = () => {
  return new Promise((resolve, reject) => {
    const servers = [];
    const timeout = setTimeout(() => {
      console.log('mDNS discovery timed out after 10000ms');
      resolve(servers);
    }, 10000); // 10 second timeout
    
    // This would use the Zeroconf plugin in a real app
    // For demo purposes, simulate discovery
    setTimeout(() => {
      clearTimeout(timeout);
      resolve(servers);
    }, 2000);
  });
};

// Generate common local network IPs with broader range
const generateLocalIPs = () => {
  const ips = [];
  
  // Get current IP from URL if available (for web apps)
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    const parts = window.location.hostname.split('.');
    if (parts.length === 4) {
      const base = parts.slice(0, 3).join('.');
      for (let i = 1; i <= 50; i++) { // Increased from 20 to 50
        ips.push(`${base}.${i}`);
      }
    }
  }
  
  // Add common local IP ranges with broader scanning
  const commonRanges = [
    '192.168.1',  // Most common home routers
    '192.168.0',  // Alternative home router range
    '192.168.2',  // Common secondary range
    '192.168.100', // Some ISP routers
    '10.0.0',     // Class A private
    '10.0.1',     // Alternative class A
    '172.16.0',   // Class B private
    '172.16.1',   // Alternative class B
  ];
  
  for (const range of commonRanges) {
    for (let i = 1; i <= 50; i++) { // Scan first 50 IPs in each range
      ips.push(`${range}.${i}`);
    }
  }
  
  // Add some specific common router IPs
  const commonRouterIPs = [
    '192.168.1.1',
    '192.168.0.1',
    '10.0.0.1',
    '192.168.1.254',
    '192.168.0.254',
    '192.168.2.1'
  ];
  
  ips.push(...commonRouterIPs);
  
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
  const [discoveryProgress, setDiscoveryProgress] = useState(0);
  const [totalIPsToScan, setTotalIPsToScan] = useState(0);

  // Discover servers when in client mode
  useEffect(() => {
    if (mode === 'Client') {
      handleServerDiscovery();
    } else if (mode === 'Server') {
      setServerIP('127.0.0.1');
      window.serverIP = '127.0.0.1';
      localStorage.setItem('pos_server_ip', '127.0.0.1');
      setDiscoveredServers([]);
      setIsDiscovering(false);
    }
    
    // Debug network info
    debugNetworkInfo();
  }, [mode]);

  const debugNetworkInfo = () => {
    const info = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      hostname: window.location.hostname,
      timestamp: new Date().toISOString(),
      url: window.location.href
    };
    console.log('=== NETWORK DEBUG INFO ===', info);
    setDebugInfo(info);
  };

  const handleServerDiscovery = async () => {
    setIsDiscovering(true);
    setDiscoveryProgress(0);
    setDiscoveredServers([]);
    
    // Calculate total IPs to scan for progress
    const ips = generateLocalIPs();
    setTotalIPsToScan(Math.min(ips.length, 100));
    
    try {
      console.log('Starting server discovery...');
      const servers = await discoverServers();
      console.log('Discovery completed, found:', servers.length, 'servers');
      setDiscoveredServers(servers);
      
      // Auto-select first server if found
      if (servers.length > 0) {
        const selectedServer = servers[0];
        setServerIP(selectedServer.ip);
        window.serverIP = selectedServer.ip;
        localStorage.setItem('pos_server_ip', selectedServer.ip);
        console.log('Auto-selected server:', selectedServer.ip);
      } else {
        // No servers found, show manual input
        console.log('No servers found, showing manual input');
        setShowManualInput(true);
      }
    } catch (error) {
      console.error('Server discovery error:', error);
      setShowManualInput(true);
    } finally {
      setIsDiscovering(false);
      setDiscoveryProgress(100);
    }
  };

  const handleServerSelect = (ip) => {
    setServerIP(ip);
    window.serverIP = ip;
    localStorage.setItem('pos_server_ip', ip);
    setShowManualInput(false);
    console.log('Selected server:', ip);
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
      console.log('Validating server connection to:', ip);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`http://${ip}:5000/api/health`, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        signal: controller.signal
      }).catch(error => {
        if (error.name === 'AbortError') {
          throw new Error('Connection timeout after 10000ms');
        }
        throw error;
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Server connection successful:', data);
        return {
          success: true,
          data
        };
      } else {
        const errorText = await response.text();
        console.log('Server responded with error:', response.status, errorText);
        return {
          success: false,
          message: `Server error: ${response.status} ${response.statusText}`
        };
      }
    } catch (error) {
      console.error('Server connection failed:', error.message);
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
      setIsLoading(true);
      const connectionResult = await validateServerConnection(serverIP);
      if (!connectionResult.success) {
        alert(`Cannot connect to server at ${serverIP}.\n\nError: ${connectionResult.message}\n\nPlease check:\n1. Server is running on desktop\n2. Firewall allows port 5000\n3. Both devices are on same WiFi\n4. Try entering IP manually`);
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
    }

    setIsLoading(true);
    try {
      // Use the updated loginUser from APIService
      const result = await loginUser({ username, password });

      if (result.success) {
        const normalizedMode = mode.toLowerCase();
        
        // Store session data
        localStorage.setItem("user", JSON.stringify(result.user || result));
        localStorage.setItem("userMode", normalizedMode);
        
        // Update global state
        if (setUserMode) {
          setUserMode(normalizedMode);
        }
        
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
    const [isTesting, setIsTesting] = useState(false);

    const testConnection = async () => {
      if (!desktopIP) return;
      
      setIsTesting(true);
      setConnectionTest(null);
      
      const result = await validateServerConnection(desktopIP);
      
      if (result.success) {
        setConnectionTest({
          success: true,
          message: `✅ Connected to ${result.data.server}`,
          ip: result.data.ip,
          version: result.data.version
        });
        // Auto-select after successful connection
        setTimeout(() => {
          handleServerSelect(desktopIP);
        }, 500);
      } else {
        setConnectionTest({
          success: false,
          message: `❌ ${result.message}`
        });
      }
      
      setIsTesting(false);
    };

    return (
      <div style={styles.manualHelper}>
        <h4 style={styles.helperTitle}>Manual Connection</h4>
        <p style={styles.helperText}>
          Find your desktop IP address and enter it below:
        </p>
        <div style={styles.ipInputGroup}>
          <input
            type="text"
            placeholder="e.g., 192.168.1.100"
            value={desktopIP}
            onChange={(e) => setDesktopIP(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && desktopIP && testConnection()}
            style={styles.ipInput}
          />
          <button
            onClick={testConnection}
            style={{
              ...styles.testButton,
              ...(isTesting ? styles.testButtonDisabled : {})
            }}
            disabled={!desktopIP || isTesting}
          >
            {isTesting ? 'Testing...' : 'Test'}
          </button>
        </div>
        {connectionTest && (
          <div style={{
            ...styles.testResult,
            backgroundColor: connectionTest.success ? '#d1fae5' : '#fee2e2',
            color: connectionTest.success ? '#065f46' : '#991b1b',
            border: `1px solid ${connectionTest.success ? '#10b981' : '#ef4444'}`
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
              <span style={styles.labelText}>Username</span>
              <input
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={handleKeyPress}
                style={styles.input}
                autoCapitalize="none"
                autoComplete="username"
                enterKeyHint="next"
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
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                  style={styles.input}
                  autoComplete="current-password"
                  enterKeyHint="go"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.passwordToggle}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={isLoading}
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
                disabled={isLoading}
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
                    {isDiscovering ? `Searching for servers (${discoveryProgress}%)...` : 'Available Servers'}
                  </span>
                  <button
                    onClick={refreshDiscovery}
                    style={styles.refreshButton}
                    disabled={isDiscovering || isLoading}
                    title="Refresh server list"
                  >
                    {isDiscovering ? '⏳' : '🔄'}
                  </button>
                </div>
                
                {isDiscovering && (
                  <div style={styles.discoveryStatus}>
                    <p style={styles.discoveryText}>
                      Scanning {totalIPsToScan} IP addresses for POS servers...
                      This may take up to 30 seconds.
                    </p>
                    <div style={styles.progressBar}>
                      <div 
                        style={{
                          ...styles.progressFill,
                          width: `${discoveryProgress}%`
                        }}
                      />
                    </div>
                  </div>
                )}
                
                {!isDiscovering && discoveredServers.length > 0 && (
                  <div style={styles.serverList}>
                    {discoveredServers.map((server, index) => (
                      <div
                        key={index}
                        onClick={() => !isLoading && handleServerSelect(server.ip)}
                        style={{
                          ...styles.serverItem,
                          ...(serverIP === server.ip ? styles.serverItemSelected : {}),
                          ...(isLoading ? styles.serverItemDisabled : {})
                        }}
                      >
                        <div style={styles.serverInfo}>
                          <span style={styles.serverName}>
                            {server.name}
                            {server.type === 'saved' && ' (Saved)'}
                          </span>
                          <span style={styles.serverIp}>{server.ip}</span>
                          {server.version && (
                            <span style={styles.serverVersion}>v{server.version}</span>
                          )}
                        </div>
                        {serverIP === server.ip && (
                          <span style={styles.selectedIndicator}>✓</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {!isDiscovering && discoveredServers.length === 0 && !showManualInput && (
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
                      disabled={isLoading}
                    />
                    <button
                      onClick={handleManualIPSubmit}
                      style={{
                        ...styles.manualButton,
                        ...(isLoading ? styles.manualButtonDisabled : {})
                      }}
                      disabled={!manualIP.trim() || isLoading}
                    >
                      Connect
                    </button>
                  </div>
                )}
                
                {!showManualInput && discoveredServers.length === 0 && !isDiscovering && (
                  <button
                    onClick={() => setShowManualInput(true)}
                    style={{
                      ...styles.manualToggleButton,
                      ...(isLoading ? styles.manualToggleButtonDisabled : {})
                    }}
                    disabled={isLoading}
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
                    {mode === 'Client' && (
                      <button
                        onClick={() => setShowManualInput(true)}
                        style={styles.changeServerButton}
                        disabled={isLoading}
                      >
                        Change
                      </button>
                    )}
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
              <span style={styles.loadingText}>
                <span style={styles.loadingSpinner}>⏳</span> Signing in...
              </span>
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
              disabled={isLoading}
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
          <p style={styles.debugText}>
            Discovery: {totalIPsToScan} IPs scanned • Found: {discoveredServers.length} servers
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
  serverDiscovery: {
    marginTop: '16px',
    border: '1px solid #eaeaea',
    borderRadius: '8px',
    padding: '16px'
  },
  discoveryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px'
  },
  discoveryTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#333'
  },
  refreshButton: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px 8px'
  },
  discoveryStatus: {
    padding: '12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    textAlign: 'center'
  },
  discoveryText: {
    fontSize: '14px',
    color: '#666',
    margin: '0 0 12px'
  },
  progressBar: {
    height: '6px',
    backgroundColor: '#eaeaea',
    borderRadius: '3px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4f46e5',
    transition: 'width 0.3s ease'
  },
  serverList: {
    maxHeight: '200px',
    overflowY: 'auto'
  },
  serverItem: {
    padding: '12px',
    border: '1px solid #eaeaea',
    borderRadius: '6px',
    marginBottom: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  serverItemSelected: {
    borderColor: '#4f46e5',
    backgroundColor: '#eef2ff'
  },
  serverItemDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed'
  },
  serverInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  serverName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#333'
  },
  serverIp: {
    fontSize: '12px',
    color: '#666',
    fontFamily: 'monospace'
  },
  serverVersion: {
    fontSize: '11px',
    color: '#999',
    backgroundColor: '#f3f4f6',
    padding: '2px 6px',
    borderRadius: '10px',
    display: 'inline-block',
    width: 'fit-content'
  },
  selectedIndicator: {
    color: '#4f46e5',
    fontWeight: 'bold',
    fontSize: '18px'
  },
  manualInput: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px'
  },
  manualInputField: {
    flex: 1,
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px'
  },
  manualButton: {
    padding: '12px 20px',
    backgroundColor: '#4f46e5',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600'
  },
  manualButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed'
  },
  manualToggleButton: {
    width: '100%',
    padding: '12px',
    backgroundColor: 'transparent',
    color: '#4f46e5',
    border: '1px solid #4f46e5',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    marginTop: '12px'
  },
  manualToggleButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed'
  },
  manualHelper: {
    marginTop: '16px',
    padding: '16px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #eaeaea'
  },
  helperTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#333',
    margin: '0 0 8px'
  },
  helperText: {
    fontSize: '14px',
    color: '#666',
    margin: '0 0 12px',
    lineHeight: '1.5'
  },
  ipInputGroup: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px'
  },
  ipInput: {
    flex: 1,
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px'
  },
  testButton: {
    padding: '12px 20px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600',
    whiteSpace: 'nowrap'
  },
  testButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed'
  },
  testResult: {
    padding: '12px',
    borderRadius: '6px',
    fontSize: '14px',
    marginTop: '8px'
  },
  successDetails: {
    marginTop: '8px',
    fontSize: '12px',
    opacity: 0.8
  },
  serverInfoDisplay: {
    fontSize: '14px',
    color: '#666',
    marginTop: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  serverIpDisplay: {
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#333'
  },
  changeServerButton: {
    marginLeft: 'auto',
    padding: '4px 12px',
    fontSize: '12px',
    backgroundColor: 'transparent',
    color: '#4f46e5',
    border: '1px solid #4f46e5',
    borderRadius: '4px',
    cursor: 'pointer'
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
  loadingText: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px'
  },
  loadingSpinner: {
    fontSize: '16px'
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '24px 0',
    color: '#999'
  },
  dividerText: {
    padding: '0 12px',
    fontSize: '14px',
    backgroundColor: 'white'
  },
  footer: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#666',
    margin: 0
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#4f46e5',
    textDecoration: 'underline',
    cursor: 'pointer',
    fontSize: '14px',
    padding: 0
  },
  bottomFooter: {
    padding: '16px 40px',
    borderTop: '1px solid #eaeaea',
    backgroundColor: '#fafafa'
  },
  footerText: {
    fontSize: '12px',
    color: '#999',
    textAlign: 'center',
    margin: 0
  },
  debugText: {
    fontSize: '11px',
    color: '#ccc',
    textAlign: 'center',
    margin: '4px 0 0',
    fontFamily: 'monospace'
  }
};