// DataService.js
import { sqliteAdapter } from './sqliteAdapter';
import { apiClient } from './apiClient';

class DataService {
  constructor() {
    this.userMode = 'client'; // Always default to client mode
    this.isOwner = false; // Default to not owner
    this.isClient = true; // Default to client
    this.serverStatus = 'unknown';
    this.connectionAttempts = 0;
    this.maxAttempts = 3;
    this.apiClient = null;
    this.sqlite = null;
    
    setTimeout(() => this.initialize(), 100);
  }

  async initialize() {
    console.log('🚀 DataService Initializing...');
    
    // Detect platform
    const isNative = window.Capacitor?.isNativePlatform || false;
    console.log('📱 Platform:', isNative ? 'Native Mobile' : 'Web Browser');
    
    // Always use client mode for both web and native
    // No localStorage check for userMode
    this.userMode = 'client';
    this.isOwner = this.userMode === 'server';
    this.isClient = this.userMode === 'client';
    
    console.log('📱 Mode:', this.userMode, '| Owner:', this.isOwner, '| Client:', this.isClient);
    
    this.apiClient = apiClient;
    
    if (this.isOwner) {
      console.log('👑 Owner mode: Initializing SQLite database...');
      try {
        this.sqlite = sqliteAdapter;
        await this.sqlite.init();
        this.serverStatus = 'connected';
        console.log('✅ SQLite initialized successfully');
      } catch (error) {
        console.error('❌ Failed to initialize SQLite:', error);
        this.serverStatus = 'error';
      }
    } else if (this.isClient) {
      console.log('📡 Client mode: Attempting auto-connection...');
      this.serverStatus = 'discovering';
      await this.attemptConnection();
    }
    
    console.log('🎯 Final status:', this.serverStatus);
  }

  async attemptConnection() {
    this.connectionAttempts++;
    
    console.log('🌐 Attempting connection via apiClient...');
    
    try {
      // Use apiClient's discovery mechanism
      const connected = await this.apiClient.discoverServer();
      
      if (connected) {
        this.serverStatus = 'connected';
        console.log('✅ Connected to server via apiClient');
        return true;
      }
      
      if (this.connectionAttempts < this.maxAttempts) {
        console.log(`🔄 Attempt ${this.connectionAttempts}/${this.maxAttempts} failed, retrying...`);
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await this.attemptConnection();
      }
      
      console.log('❌ All connection attempts failed');
      this.serverStatus = 'disconnected';
      return false;
      
    } catch (error) {
      console.error('Connection attempt error:', error);
      
      if (this.connectionAttempts < this.maxAttempts) {
        console.log(`🔄 Attempt ${this.connectionAttempts}/${this.maxAttempts} errored, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await this.attemptConnection();
      }
      
      console.log('❌ All connection attempts failed');
      this.serverStatus = 'disconnected';
      return false;
    }
  }

  async testSpecificConnection(ip) {
    try {
      console.log(`🔗 Testing ${ip}...`);
      
      // Use apiClient to test the connection
      const testURL = `http://${ip}:3001`;
      const connected = await this.apiClient.testConnection(ip);
      
      if (connected) {
        this.apiClient.setBaseURL(testURL);
        console.log(`✅ Connected to ${testURL}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  serializeFilters(filters) {
    if (!filters || typeof filters !== 'object') return '';
    
    if (filters.where && typeof filters.where === 'object') {
      const query = new URLSearchParams();
      Object.entries(filters.where).forEach(([key, value]) => {
        if (typeof value === 'string') {
          query.append(key, value);
        } else {
          query.append(key, JSON.stringify(value));
        }
      });
      const str = query.toString();
      return str ? `?${str}` : '';
    }
    
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (typeof value === 'string') {
          query.append(key, value);
        } else {
          query.append(key, JSON.stringify(value));
        }
      }
    });
    
    const str = query.toString();
    return str ? `?${str}` : '';
  }

  async request(method, endpoint, options = {}) {
    if (!this.isOwner && this.serverStatus !== 'connected') {
      console.warn('⚠️ Not connected. Attempting reconnect...');
      const reconnected = await this.reconnect();
      if (!reconnected) throw new Error('Not connected to owner server.');
    }

    let url = endpoint;
    let body;

    if (method.toUpperCase() === 'GET' && options.filters) {
      url += this.serializeFilters(options.filters);
    } else if (options.data && (method === 'POST' || method === 'PUT')) {
      body = options.data;
    }

    try {
      return await this.apiClient.request({
        method,
        url,
        data: body,
        headers: body ? { 'Content-Type': 'application/json' } : { 'Accept': 'application/json' }
      });
    } catch (error) {
      throw error;
    }
  }

  // ========== CRUD METHODS ==========
  async getAll(tableName, filters = {}) {
    if (this.isOwner && this.sqlite && this.sqlite.isReadyForMobile()) {
      return await this.sqlite.getAll(tableName, filters);
    } else {
      const response = await this.request('GET', `/api/${tableName}`, { filters });
      return Array.isArray(response) ? response : (response.data || []);
    }
  }

  async getById(tableName, id) {
    if (this.isOwner && this.sqlite && this.sqlite.isReadyForMobile()) {
      return await this.sqlite.getById(tableName, id);
    } else {
      try {
        const response = await this.request('GET', `/api/${tableName}/${id}`);
        return response.data || response;
      } catch (error) {
        console.error(`Error getting ${tableName} by ID ${id}:`, error);
        return null;
      }
    }
  }

  async add(tableName, data) {
    if (this.isOwner && this.sqlite && this.sqlite.isReadyForMobile()) {
      const result = await this.sqlite.add(tableName, data);
      return result ? (result.data || result) : null;
    } else {
      const response = await this.request('POST', `/api/${tableName}`, { data });
      return response.data || response;
    }
  }

  async update(tableName, id, changes) {
    if (this.isOwner && this.sqlite && this.sqlite.isReadyForMobile()) {
      const result = await this.sqlite.update(tableName, id, changes);
      return result ? (result.data || result) : null;
    } else {
      const response = await this.request('PUT', `/api/${tableName}/${id}`, { data: changes });
      return response.data || response;
    }
  }

  async delete(tableName, id) {
    if (this.isOwner && this.sqlite && this.sqlite.isReadyForMobile()) {
      return await this.sqlite.delete(tableName, id);
    } else {
      const response = await this.request('DELETE', `/api/${tableName}/${id}`);
      return response.success || false;
    }
  }

  async bulkAdd(tableName, items) {
    if (this.isOwner && this.sqlite && this.sqlite.isReadyForMobile()) {
      // Native: Add items one by one in transaction
      return await this.sqlite.transaction(async () => {
        const results = [];
        for (const item of items) {
          const result = await this.sqlite.add(tableName, item);
          results.push(result);
        }
        return results;
      });
    } else {
      // Web: Use bulk endpoint
      const response = await this.request('POST', `/api/${tableName}/bulk`, { data: items });
      return response.data || response;
    }
  }

  // ========== SPECIFIC TABLE METHODS ==========
  async getUsers() { 
    const users = await this.getAll('users');
    return Array.isArray(users) ? users : []; 
  }
  
  async getUserByUsername(username) {
    if (this.isOwner && this.sqlite && this.sqlite.isReadyForMobile()) {
      // Use the helper function from sqliteAdapter
      return await this.sqlite.getUserByUsername(username);
    } else {
      const users = await this.getAll('users', { where: { username } });
      return users[0] || null;
    }
  }
  
  async checkUserExists(username) {
    try {
      const user = await this.getUserByUsername(username);
      return !!user;
    } catch (error) {
      return false;
    }
  }
  
  async getProducts(categoryId = null) {
    if (categoryId) {
      const products = await this.getAll('products', { where: { category_id: categoryId } });
      return Array.isArray(products) ? products : [];
    }
    const products = await this.getAll('products');
    return Array.isArray(products) ? products : [];
  }
  
  async addProduct(productData) {
    const data = { 
      ...productData, 
      created_at: new Date().toISOString(), 
      created_by: this.getCurrentUserId() 
    };
    return this.add('products', data);
  }
  
  async getInventory() { 
    const inventory = await this.getAll('inventory');
    return Array.isArray(inventory) ? inventory : [];
  }
  
  async getInventoryWithDetails() {
    if (this.isOwner && this.sqlite && this.sqlite.isReadyForMobile()) {
      const sql = `
        SELECT 
          i.*,
          p.name as product_name,
          p.sku,
          p.unit_price,
          s.name as supplier_name,
          c.name as category_name
        FROM inventory i
        LEFT JOIN products p ON i.product_id = p.product_id
        LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
        LEFT JOIN categories c ON p.category_id = c.category_id
        ORDER BY p.name
      `;
      return await this.sqlite.query(sql);
    } else {
      const response = await this.request('GET', '/api/inventory/with-details');
      return response.data || response;
    }
  }

  async updateInventory(productId, changes) {
    const data = { 
      ...changes, 
      updated_at: new Date().toISOString(), 
      updated_by: this.getCurrentUserId() 
    };
    return this.update('inventory', productId, data);
  }

  async getSales(date = null) {
    if (date) {
      const sales = await this.getAll('sales', { where: { sales_date: date } });
      return Array.isArray(sales) ? sales : [];
    }
    const sales = await this.getAll('sales');
    return Array.isArray(sales) ? sales : [];
  }

  async getSaleItems(saleId = null) {
    if (saleId) {
      const items = await this.getAll('sale_items', { where: { sales_id: saleId } });
      return Array.isArray(items) ? items : [];
    }
    const items = await this.getAll('sale_items');
    return Array.isArray(items) ? items : [];
  }

  async processSale(saleData) {
    if (this.isOwner && this.sqlite && this.sqlite.isReadyForMobile()) {
      return await this.sqlite.processSale(saleData);
    } else {
      const response = await this.request('POST', '/api/sales/process', { data: saleData });
      return response.data || response;
    }
  }

  async getSuppliers() { 
    const suppliers = await this.getAll('suppliers');
    return Array.isArray(suppliers) ? suppliers : [];
  }
  
  async addSupplier(supplierData) { 
    const data = { 
      ...supplierData, 
      created_at: new Date().toISOString(), 
      created_by: this.getCurrentUserId() 
    }; 
    return this.add('suppliers', data); 
  }
  
  async getCategories() { 
    const categories = await this.getAll('categories');
    return Array.isArray(categories) ? categories : [];
  }
  
  async getProductUnits(productId = null) { 
    if (productId) {
      const units = await this.getAll('product_units', { where: { product_id: productId } });
      return Array.isArray(units) ? units : [];
    }
    const units = await this.getAll('product_units');
    return Array.isArray(units) ? units : [];
  }
  
  async getResuppliedItems() { 
    const items = await this.getAll('resupplied_items');
    return Array.isArray(items) ? items : [];
  }
  
  async getStockCard() { 
    const items = await this.getAll('stock_card');
    return Array.isArray(items) ? items : [];
  }
  
  async getBackups() { 
    const backups = await this.getAll('backup');
    return Array.isArray(backups) ? backups : [];
  }
  
  async getDeletedItems() { 
    const items = await this.getAll('deleted_items');
    return Array.isArray(items) ? items : [];
  }

  async getDashboardStats() {
    if (this.isOwner && this.sqlite && this.sqlite.isReadyForMobile()) {
      const today = new Date().toISOString().split('T')[0];
      
      const queries = [
        this.sqlite.query("SELECT COUNT(*) as count FROM products"),
        this.sqlite.query(`
          SELECT COUNT(*) as count 
          FROM inventory i
          JOIN products p ON i.product_id = p.product_id
          WHERE i.quantity <= i.threshold
        `),
        this.sqlite.query(`
          SELECT COALESCE(SUM(si.total_amount), 0) as total 
          FROM sales s
          JOIN sale_items si ON s.sales_id = si.sales_id
          WHERE s.sales_date = ?
        `, [today]),
        this.sqlite.query(`
          SELECT COUNT(*) as count 
          FROM inventory 
          WHERE expiration_date IS NOT NULL 
          AND expiration_date < ?
        `, [today]),
        this.sqlite.query('SELECT COUNT(*) as count FROM sales')
      ];
      
      const results = await Promise.all(queries);
      
      return {
        totalProducts: results[0][0]?.count || 0,
        lowStock: results[1][0]?.count || 0,
        salesToday: results[2][0]?.total || 0,
        expired: results[3][0]?.count || 0,
        totalSales: results[4][0]?.count || 0
      };
    } else {
      const response = await this.request('GET', '/api/dashboard/stats');
      return response.data || response;
    }
  }

  // ========== SYNC METHODS ==========
  async syncPush(table, data) {
    if (this.isOwner && this.sqlite && this.sqlite.isReadyForMobile()) {
      return await this.sqlite.syncPush(table, data);
    } else {
      const response = await this.request('POST', '/api/sync/push', { 
        data: { table, data } 
      });
      return response.data || response;
    }
  }

  async syncPull(table, lastSync) {
    if (this.isOwner && this.sqlite && this.sqlite.isReadyForMobile()) {
      return await this.sqlite.syncPull(table, lastSync);
    } else {
      const url = `/api/sync/pull?table=${table}${lastSync ? `&lastSync=${lastSync}` : ''}`;
      const response = await this.request('GET', url);
      return response.data || response;
    }
  }

  // ========== HELPER METHODS ==========
  getCurrentUserId() { 
    const user = JSON.parse(localStorage.getItem('user') || '{}'); 
    return user.user_id; 
  }

  setUserMode(mode) { 
    this.userMode = mode; 
    this.isOwner = mode === 'server'; 
    this.isClient = mode === 'client'; 
    // No localStorage for userMode - removed
    this.initialize(); 
  }

  getServerStatus() { 
    const serverInfo = this.apiClient.getServerInfo();
    return { 
      status: this.serverStatus, 
      isConnected: this.serverStatus === 'connected', 
      mode: this.userMode, 
      serverUrl: serverInfo.baseURL, 
      protocol: serverInfo.protocol, 
      isOwner: this.isOwner, 
      isClient: this.isClient, 
      attempts: this.connectionAttempts 
    }; 
  }

  isConnectedToServer() { 
    return this.serverStatus === 'connected'; 
  }

  async manuallySetOwnerIP(ip) {
    if (!this.isClient) return false;
    try { 
      if (await this.testSpecificConnection(ip)) { 
        this.serverStatus = 'connected'; 
        return true; 
      } 
    } catch (error) { 
      console.error('Manual IP failed:', error); 
    }
    return false;
  }

  async reconnect() { 
    if (!this.isClient) return false; 
    this.serverStatus = 'discovering'; 
    return await this.attemptConnection(); 
  }
  
  getConnectionInfo() { 
    const serverStatus = this.getServerStatus(); 
    return { 
      mode: this.userMode, 
      isConnected: this.isConnectedToServer(), 
      serverStatus: this.serverStatus, 
      serverUrl: serverStatus.serverUrl, 
      protocol: serverStatus.protocol, 
      isOwner: this.isOwner, 
      isClient: this.isClient, 
      attempts: serverStatus.attempts 
    }; 
  }
}

export const dataService = new DataService();