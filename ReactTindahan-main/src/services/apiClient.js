// src/services/apiClient.js
import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';

class ApiClient {
  constructor() {
    this.baseURL = null;
    this.isNative = Capacitor.isNativePlatform();
    this.isWeb = !this.isNative;
    
    // Initialize with default values
    this.initialize();
  }

  initialize() {
    // Try saved IP first
    const savedIP = localStorage.getItem('owner_ip');
    
    if (savedIP) {
      this.baseURL = `http://${savedIP}:3001`;
      console.log(`📡 Using saved owner IP: ${savedIP}`);
    } else if (this.isWeb) {
      // For web development, use localhost
      this.baseURL = 'http://localhost:3001';
      localStorage.setItem('owner_ip', 'localhost');
      console.log('🌐 Web mode: Using localhost');
    } else {
      // For mobile, we need to discover server
      console.log('📱 Mobile mode: Server IP not set');
    }
  }

  async request(method, endpoint, data = null) {
    // Check if we have a baseURL
    if (!this.baseURL) {
      throw new Error('Owner server address not set. Please connect to the owner server first.');
    }

    let url = `${this.baseURL}${endpoint}`;
    
    // Handle query parameters for GET requests
    if (data && method === 'GET') {
      const params = new URLSearchParams();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString());
        }
      });
      
      if (params.toString()) {
        url = `${url}?${params.toString()}`;
      }
    }

    try {
      let response;
      
      if (this.isNative) {
        // Use Capacitor HTTP for native apps (better on mobile)
        console.log(`📤 ${method} ${url}`);
        
        const options = {
          url: url,
          method: method,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        };

        if (data && (method === 'POST' || method === 'PUT')) {
          options.data = data;
        }

        response = await CapacitorHttp.request(options);
        
        // CapacitorHttp returns the response differently
        if (response.status >= 400) {
          throw new Error(`HTTP ${response.status}: ${response.data}`);
        }
        
        // Parse JSON if it's a string
        const result = typeof response.data === 'string' 
          ? JSON.parse(response.data) 
          : response.data;
          
        return result.data || result;
      } else {
        // Use fetch for web
        console.log(`📤 ${method} ${url}`);
        
        const options = {
          method: method,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        };

        if (data && (method === 'POST' || method === 'PUT')) {
          options.body = JSON.stringify(data);
        }

        // Add timeout for fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        options.signal = controller.signal;

        const fetchResponse = await fetch(url, options);
        clearTimeout(timeoutId);

        if (!fetchResponse.ok) {
          let errorText = 'Unknown error';
          try {
            errorText = await fetchResponse.text();
          } catch {}
          
          throw new Error(`HTTP ${fetchResponse.status}: ${errorText}`);
        }

        const result = await fetchResponse.json();
        return result.data || result;
      }
    } catch (error) {
      console.error(`❌ API Error [${method} ${url}]:`, error.message);
      
      // Provide helpful error messages
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        throw new Error(`Timeout connecting to owner server at ${this.baseURL}. Please check:
        1. Owner app is running
        2. Owner IP is correct: ${this.baseURL}
        3. Both devices are on same WiFi network`);
      }
      
      if (error.message.includes('Failed to fetch') || 
          error.message.includes('Network request failed') ||
          error.message.includes('Network Error')) {
        throw new Error(`Cannot connect to owner server at ${this.baseURL}. Please check:
        1. Owner app is running (node owner-api.js)
        2. Owner IP is correct: ${this.baseURL}
        3. Both devices are on same WiFi network
        4. Firewall allows port 3001`);
      }
      
      if (error.message.includes('Unexpected token') && error.message.includes('<!doctype')) {
        throw new Error(`Received HTML instead of JSON from ${this.baseURL}. This means:
        1. The React dev server is running instead of the API server
        2. Wrong port (maybe 3000 instead of 3001)
        Make sure to start the API server: node owner-api.js`);
      }
      
      throw error;
    }
  }

  // Convenience methods
  get(endpoint, params = {}) {
    return this.request('GET', endpoint, params);
  }

  post(endpoint, data) {
    return this.request('POST', endpoint, data);
  }

  put(endpoint, data) {
    return this.request('PUT', endpoint, data);
  }

  delete(endpoint) {
    return this.request('DELETE', endpoint);
  }

  // Test connection to owner
  async testConnection(ip = null) {
    let testURL = this.baseURL;
    
    if (ip) {
      testURL = `http://${ip}:3001`;
    }
    
    if (!testURL) {
      return false;
    }
    
    try {
      console.log(`🔗 Testing connection to ${testURL}...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${testURL}/api/health`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        const isValid = data.app === 'inventory-owner';
        
        if (isValid) {
          console.log(`✅ Connected to owner server: ${data.app} v${data.version}`);
          
          // Update baseURL if testing a new IP
          if (ip && ip !== this.baseURL) {
            this.setBaseURL(testURL);
          }
          
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.log(`❌ Connection test failed for ${testURL}:`, error.message);
      return false;
    }
  }

  // Set owner IP manually
  setOwnerIP(ip) {
    this.baseURL = `http://${ip}:3001`;
    localStorage.setItem('owner_ip', ip);
    console.log(`✅ Owner IP set to: ${ip}`);
  }

  // Set base URL directly
  setBaseURL(url) {
    this.baseURL = url;
    // Extract IP from URL for storage
    const ipMatch = url.match(/http:\/\/([^:]+)/);
    if (ipMatch) {
      localStorage.setItem('owner_ip', ipMatch[1]);
    }
    console.log(`✅ Base URL set to: ${url}`);
  }

  // Get current server info
  getServerInfo() {
    return {
      baseURL: this.baseURL,
      isNative: this.isNative,
      savedIP: localStorage.getItem('owner_ip')
    };
  }
}

// Create singleton instance
export const apiClient = new ApiClient();