// apiClient.js
import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';

class ApiClient {
  constructor() {
    this.baseURL = null;
    this.isNative = Capacitor.isNativePlatform();
    this.isWeb = !this.isNative;
    this.timeout = 15000; // 15 seconds
    this.initialized = false;
    this.isDiscovering = false;
    this.discoveryPromise = null;
    
    // Initialize synchronously
    this.initialize();
  }

  initialize() {
    if (this.initialized) return;
    
    // Always start fresh discovery
    this.baseURL = null;
    console.log('📡 Starting fresh connection discovery...');
    
    this.initialized = true;
  }

  async request(options) {
    if (!this.initialized) {
      this.initialize();
    }
    
    if (!this.baseURL) {
      // Try to discover server automatically if not connected
      const connected = await this.discoverServer();
      if (!connected) {
        throw new Error('Server address not set. Please connect to owner server first.');
      }
    }

    const { method, url, data, headers = {} } = options;
    
    let fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;
    
    console.log(`📱 ${method} ${fullUrl}`);
    if (data) console.log('📦 Request data:', data);
    
    try {
      if (this.isNative) {
        const requestOptions = {
          url: fullUrl,
          method: method,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...headers
          },
          connectTimeout: this.timeout,
          readTimeout: this.timeout
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
          requestOptions.data = typeof data === 'string' ? data : JSON.stringify(data);
        }

        const response = await CapacitorHttp.request(requestOptions);
        
        if (response.status >= 400) {
          let errorMessage = `HTTP ${response.status}`;
          
          if (response.data) {
            if (typeof response.data === 'string') {
              try {
                const errorData = JSON.parse(response.data);
                if (errorData.error) errorMessage = `${errorMessage}: ${errorData.error}`;
                else if (errorData.message) errorMessage = `${errorMessage}: ${errorData.message}`;
                else errorMessage = `${errorMessage}: ${response.data.substring(0, 100)}`;
              } catch {
                errorMessage = `${errorMessage}: ${response.data.substring(0, 100)}`;
              }
            } else if (typeof response.data === 'object') {
              if (response.data.message) {
                errorMessage = `${errorMessage}: ${response.data.message}`;
              } else if (response.data.error) {
                errorMessage = `${errorMessage}: ${response.data.error}`;
              } else {
                try {
                  errorMessage = `${errorMessage}: ${JSON.stringify(response.data)}`;
                } catch {
                  errorMessage = `${errorMessage}: Server error`;
                }
              }
            }
          } else {
            errorMessage = `${errorMessage}: Server error`;
          }
          
          throw new Error(errorMessage);
        }
        
        let result;
        if (typeof response.data === 'string') {
          try {
            result = JSON.parse(response.data);
          } catch {
            result = { data: response.data };
          }
        } else {
          result = response.data;
        }
        
        // Return success data if available
        if (result && result.success !== undefined) {
          return result.data || result;
        }
        
        return result;
      } else {
        const fetchOptions = {
          method: method,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...headers
          }
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
          fetchOptions.body = typeof data === 'string' ? data : JSON.stringify(data);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        fetchOptions.signal = controller.signal;

        const fetchResponse = await fetch(fullUrl, fetchOptions);
        clearTimeout(timeoutId);

        if (!fetchResponse.ok) {
          let errorText = 'Server error';
          try {
            errorText = await fetchResponse.text();
            try {
              const errorJson = JSON.parse(errorText);
              if (errorJson.message) {
                errorText = errorJson.message;
              } else if (errorJson.error) {
                errorText = errorJson.error;
              }
            } catch {
              // Not JSON, use as is
            }
          } catch {}
          
          throw new Error(`HTTP ${fetchResponse.status}: ${errorText}`);
        }

        const result = await fetchResponse.json();
        
        // Return success data if available
        if (result && result.success !== undefined) {
          return result.data || result;
        }
        
        return result;
      }
    } catch (error) {
      console.error(`❌ API Error [${method} ${fullUrl}]:`, error.message);
      
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        throw new Error(`Connection timeout. Server may be offline or unreachable.`);
      }
      
      if (error.message.includes('Failed to fetch') || 
          error.message.includes('Network request failed') ||
          error.message.includes('Network Error')) {
        // Try to rediscover server on network error
        console.log('🔄 Connection lost, attempting rediscovery...');
        const rediscovered = await this.discoverServer();
        if (rediscovered) {
          // Retry the request with new connection
          return this.request(options);
        }
        throw new Error(`Cannot connect to server. Please check:
        1. Owner app is running
        2. Both devices on same WiFi`);
      }
      
      throw error;
    }
  }

  async discoverServer() {
    // Prevent concurrent discoveries
    if (this.isDiscovering && this.discoveryPromise) {
      console.log('🔍 Discovery already in progress, waiting...');
      return await this.discoveryPromise;
    }

    // Check current connection first
    if (this.baseURL && await this.testConnection()) {
      console.log('✅ Already connected to:', this.baseURL);
      return true;
    }

    this.isDiscovering = true;
    this.discoveryPromise = new Promise(async (resolve) => {
      try {
        console.log('🔍 Starting fresh network discovery...');
        
        // Try specific IPs first - HIGHEST PRIORITY
        const specificIPs = [
          '192.168.100.53',  // Your specific IP
          '10.111.132.237',  // Your other specific IP
          'localhost',
          '127.0.0.1'
        ];
        
        console.log('🎯 Testing specific IPs first...');
        for (const ip of specificIPs) {
          console.log(`  Testing ${ip}...`);
          if (await this.testConnection(ip)) {
            this.setBaseURL(`http://${ip}:3001`);
            console.log(`✅ Connected to specific IP: ${ip}`);
            this.isDiscovering = false;
            resolve(true);
            return;
          }
        }
        
        // Try prioritized IP ranges - HIGH PRIORITY
        const prioritizedRanges = [
          '192.168.100',  // Your prioritized range
          '10.111.132',   // Your other prioritized range
        ];
        
        console.log('🎯 Scanning prioritized IP ranges...');
        for (const range of prioritizedRanges) {
          console.log(`  Scanning ${range}.x (priority range)...`);
          const found = await this.scanIPRange(range, true); // true = priority scan
          if (found) {
            this.isDiscovering = false;
            resolve(true);
            return;
          }
        }
        
        // Full network scan for other common ranges - STANDARD PRIORITY
        console.log('🌐 Starting standard network scan...');
        
        const standardRanges = [
          '192.168.1',
          '192.168.0',
          '10.0.0',
          '10.0.1',
          '10.0.2',
          '172.16.0',
          '172.17.0',
          '172.18.0',
          '172.19.0',
          '172.20.0'
        ];
        
        for (const range of standardRanges) {
          console.log(`🔍 Scanning ${range}.x network...`);
          const found = await this.scanIPRange(range, false); // false = standard scan
          if (found) {
            this.isDiscovering = false;
            resolve(true);
            return;
          }
        }
        
        console.log('❌ No server found in network discovery');
        this.isDiscovering = false;
        resolve(false);
      } catch (error) {
        console.error('Discovery error:', error);
        this.isDiscovering = false;
        resolve(false);
      }
    });

    return await this.discoveryPromise;
  }

   async scanIPRange(range, isPriority = false) {
    // Create array of IPs to scan
    const ips = [];
    let likelyIPs = []; // Declare likelyIPs here so it's available in the outer scope
    
    if (isPriority) {
      // For priority ranges, scan common server ports and specific IPs
      console.log(`  ⚡ Priority scan for ${range}.x`);
      
      // First, try the most likely server IPs in priority ranges
      likelyIPs = [
        `${range}.1`,   // Gateway/router
        `${range}.2`,   // Common server IP
        `${range}.10`,  // Common server IP
        `${range}.50`,  // Mid-range server IP
        `${range}.53`,  // Your specific IP pattern
        `${range}.100`, // Common server IP
        `${range}.150`, // Common server IP
        `${range}.200`, // Common server IP
        `${range}.237`, // Your specific IP pattern
        `${range}.254`  // Last IP in range
      ];
      
      // Add likely IPs first
      ips.push(...likelyIPs);
      
      // Then add the rest of the range
      for (let i = 1; i <= 254; i++) {
        const ip = `${range}.${i}`;
        if (!likelyIPs.includes(ip)) {
          ips.push(ip);
        }
      }
    } else {
      // For standard ranges, scan sequentially
      console.log(`  🔍 Standard scan for ${range}.x`);
      for (let i = 1; i <= 254; i++) {
        ips.push(`${range}.${i}`);
      }
    }
    
    // Process in batches
    const batchSize = isPriority ? 10 : 20; // Smaller batches for priority
    const timeoutPerIP = isPriority ? 2000 : 3000; // Faster timeout for priority
    
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      const batchNumber = Math.floor(i/batchSize) + 1;
      const totalBatches = Math.ceil(ips.length/batchSize);
      
      if (isPriority && i < likelyIPs.length) {
        console.log(`    Priority batch ${batchNumber}/${totalBatches}: Testing ${batch.length} likely server IPs`);
      } else {
        console.log(`    Batch ${batchNumber}/${totalBatches}: Testing ${batch.length} IPs`);
      }
      
      // Create and execute promises for this batch
      const batchPromises = batch.map(ip => 
        this.testConnectionWithTimeout(ip, timeoutPerIP).then(success => {
          if (success) return ip;
          return null;
        })
      );
      
      // Wait for all promises in this batch to complete
      const results = await Promise.all(batchPromises);
      const successfulIP = results.find(ip => ip !== null);
      
      if (successfulIP) {
        console.log(`✅ Found server at ${successfulIP}`);
        this.setBaseURL(`http://${successfulIP}:3001`);
        return true;
      }
      
      // Optional: Smaller delay for priority scans
      const delay = isPriority ? 50 : 100;
      if (i + batchSize < ips.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.log(`  No server found in ${range}.x network`);
    return false;
  }

  async testConnectionWithTimeout(ip, timeout = 3000) {
    return new Promise((resolve) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        resolve(false);
      }, timeout);
      
      const testURL = `http://${ip}:3001`;
      
      fetch(`${testURL}/api/health`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      })
      .then(response => {
        clearTimeout(timeoutId);
        if (response.ok) {
          return response.json().then(data => {
            resolve(data.app === 'inventory-system');
          });
        }
        resolve(false);
      })
      .catch(() => {
        clearTimeout(timeoutId);
        resolve(false);
      });
    });
  }

  async testConnection(ip = null) {
    let testURL = ip ? `http://${ip}:3001` : this.baseURL;
    
    if (!testURL) {
      return false;
    }
    
    try {
      console.log(`🔗 Testing ${testURL}...`);
      
      let response;
      
      if (this.isNative) {
        response = await CapacitorHttp.request({
          url: `${testURL}/api/health`,
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          connectTimeout: 5000,
          readTimeout: 5000
        });
        
        if (response.status >= 400) {
          return false;
        }
        
        const data = typeof response.data === 'string' 
          ? JSON.parse(response.data) 
          : response.data;
          
        return data.app === 'inventory-system';
      } else {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const fetchResponse = await fetch(`${testURL}/api/health`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        
        clearTimeout(timeoutId);
        
        if (!fetchResponse.ok) {
          return false;
        }
        
        const data = await fetchResponse.json();
        return data.app === 'inventory-system';
      }
    } catch (error) {
      console.log(`❌ Test failed for ${testURL}:`, error.message);
      return false;
    }
  }

  setBaseURL(url) {
    let cleanURL = url.trim();
    
    if (!cleanURL.startsWith('http')) {
      cleanURL = `http://${cleanURL}`;
    }
    
    if (!cleanURL.includes(':') && !cleanURL.endsWith('/')) {
      cleanURL = `${cleanURL}:3001`;
    } else if (cleanURL.endsWith('/')) {
      cleanURL = cleanURL.slice(0, -1);
    }
    
    this.baseURL = cleanURL;
    
    console.log(`✅ Server URL set: ${cleanURL}`);
  }

  setOwnerIP(ip) {
    this.setBaseURL(ip);
  }

  getServerInfo() {
    return {
      baseURL: this.baseURL,
      isNative: this.isNative,
      isDiscovering: this.isDiscovering,
      protocol: 'HTTP',
      healthEndpoint: this.baseURL ? `${this.baseURL}/api/health` : null
    };
  }

  async checkStatus() {
    if (!this.baseURL) {
      return { 
        connected: false, 
        error: 'No server URL set',
        timestamp: new Date().toISOString()
      };
    }
    
    try {
      const healthy = await this.testConnection();
      return { 
        connected: healthy, 
        url: this.baseURL,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return { 
        connected: false, 
        error: error.message,
        url: this.baseURL,
        timestamp: new Date().toISOString()
      };
    }
  }

  get(endpoint, params = {}) {
    let url = endpoint;
    if (params && Object.keys(params).length > 0) {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.append(key, value.toString());
        }
      });
      url = `${url}?${query.toString()}`;
    }
    
    return this.request({
      method: 'GET',
      url,
      headers: { 'Accept': 'application/json' }
    });
  }

  post(endpoint, data = {}) {
    return this.request({
      method: 'POST',
      url: endpoint,
      data: data,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  put(endpoint, data = {}) {
    return this.request({
      method: 'PUT',
      url: endpoint,
      data: data,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  delete(endpoint) {
    return this.request({
      method: 'DELETE',
      url: endpoint,
      headers: { 'Accept': 'application/json' }
    });
  }
}

export const apiClient = new ApiClient();