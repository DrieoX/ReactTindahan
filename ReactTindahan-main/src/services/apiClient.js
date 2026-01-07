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
    
    // Initialize synchronously
    this.initialize();
  }

  initialize() {
    if (this.initialized) return;
    
    const savedIP = localStorage.getItem('owner_ip');
    
    if (savedIP) {
      if (savedIP.startsWith('http')) {
        this.baseURL = savedIP;
      } else {
        this.baseURL = `http://${savedIP}:3001`;
      }
      console.log(`📡 Using saved URL: ${this.baseURL}`);
    } else {
      console.log('📱 No saved server URL');
    }
    
    this.initialized = true;
  }

  async request(options) {
    if (!this.initialized) {
      this.initialize();
    }
    
    if (!this.baseURL) {
      throw new Error('Server address not set. Please connect to owner server first.');
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
        throw new Error(`Cannot connect to server. Please check:
        1. Owner app is running
        2. Both devices on same WiFi
        3. Server IP: ${this.baseURL}`);
      }
      
      throw error;
    }
  }

  async testConnection(ip = null) {
    let testURL = this.baseURL;
    
    if (ip) {
      if (ip.startsWith('http')) {
        testURL = ip;
      } else {
        testURL = `http://${ip}:3001`;
      }
    }
    
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
          
        // Updated to match new health response
        return data.app === 'inventory-system' || data.app === 'inventory-owner';
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
        // Updated to match new health response
        return data.app === 'inventory-system' || data.app === 'inventory-owner';
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
    
    const ipMatch = cleanURL.match(/http:\/\/([^:/]+)/);
    if (ipMatch) {
      localStorage.setItem('owner_ip', ipMatch[1]);
    }
    
    console.log(`✅ Server URL set: ${cleanURL}`);
  }

  setOwnerIP(ip) {
    this.setBaseURL(ip);
  }

  getServerInfo() {
    return {
      baseURL: this.baseURL,
      isNative: this.isNative,
      savedIP: localStorage.getItem('owner_ip'),
      protocol: 'HTTP',
      healthEndpoint: `${this.baseURL}/api/health`
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