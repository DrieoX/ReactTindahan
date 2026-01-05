// src/services/DataService.js
import { db } from '../db';  // Your existing Dexie instance
import { apiClient } from './apiClient';

class DataService {
  constructor() {
    // Get mode from localStorage
    this.userMode = localStorage.getItem('userMode') || 'server';
    this.isOwner = this.userMode === 'server';
    this.isClient = this.userMode === 'client';
    this.serverStatus = 'unknown'; // 'connected', 'disconnected', 'discovering'
    
    // Initialize immediately
    this.initialize();
  }

  async initialize() {
    if (this.isClient) {
      console.log('📡 Client mode: Initializing connection to owner...');
      this.serverStatus = 'discovering';
      
      try {
        // Try to discover server
        await this.discoverServer();
      } catch (error) {
        console.error('Failed to initialize DataService:', error);
        this.serverStatus = 'disconnected';
      }
    } else {
      console.log('👑 Owner mode: Using local database');
      this.serverStatus = 'connected';
    }
  }

  async discoverServer() {
    if (!this.isClient) return;
    
    console.log('🔍 Discovering owner server...');
    
    // Try saved IP first
    const savedIP = localStorage.getItem('owner_ip');
    if (savedIP) {
      console.log(`📡 Trying saved IP: ${savedIP}`);
      if (await apiClient.testConnection(savedIP)) {
        console.log('✅ Connected to saved owner server');
        this.serverStatus = 'connected';
        return;
      }
    }
    
    // Auto-discover common IPs
    console.log('🌐 Auto-discovering server...');
    
    // Common local network IP ranges
    const ipRanges = [
      '192.168.1',  // Most common home network
      '192.168.0',  // Another common home network
      '192.168.100', // Some routers use this
      '10.0.0',     // Business networks
      '10.0.1',     // Another business range
      '172.16.0',   // Corporate networks
      '172.20.10'   // Personal hotspot
    ];
    
    // Common ports to try
    const ports = [3001, 3000, 8080, 80];
    
    for (const range of ipRanges) {
      for (let i = 1; i <= 50; i++) { // Check first 50 IPs in each range
        const ip = `${range}.${i}`;
        
        for (const port of ports) {
          try {
            console.log(`🔄 Testing ${ip}:${port}...`);
            
            // Test connection quickly with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            
            const response = await fetch(`http://${ip}:${port}/api/health`, {
              signal: controller.signal,
              headers: { 'Accept': 'application/json' }
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
              const data = await response.json();
              if (data.app === 'inventory-owner') {
                console.log(`✅ Found owner server at ${ip}:${port}`);
                
                // Save for future use
                localStorage.setItem('owner_ip', ip);
                if (port !== 3001) {
                  console.warn(`⚠️ Owner is using port ${port}, expected 3001`);
                }
                
                // Update apiClient
                apiClient.setBaseURL(`http://${ip}:${port}`);
                
                // Verify full connection
                if (await apiClient.testConnection()) {
                  this.serverStatus = 'connected';
                  return ip;
                }
              }
            }
          } catch (error) {
            // Silently continue to next IP
            continue;
          }
        }
      }
    }
    
    console.warn('❌ Could not find owner server');
    this.serverStatus = 'disconnected';
    return null;
  }

  // ========== GENERIC CRUD METHODS ==========
  
  async getAll(tableName, filters = {}) {
    if (this.isOwner) {
      let collection = db[tableName];
      
      // Handle where filters
      if (filters.where) {
        const where = filters.where;
        const keys = Object.keys(where);
        
        if (keys.length === 1) {
          const key = keys[0];
          const value = where[key];
          collection = collection.where(key).equals(value);
        }
      }
      
      return await collection.toArray();
    } else {
      // Client mode: Check if connected first
      if (this.serverStatus !== 'connected') {
        console.warn(`⚠️ Not connected to owner server. Cannot fetch ${tableName}`);
        throw new Error('Not connected to owner server. Please check your connection and make sure the owner app is running.');
      }
      
      try {
        return await apiClient.get(`/api/${tableName}`, filters);
      } catch (error) {
        console.error(`Failed to fetch ${tableName}:`, error);
        
        // If connection failed, try to rediscover server
        if (error.message.includes('Cannot connect') || error.message.includes('Failed to fetch')) {
          this.serverStatus = 'disconnected';
          
          // Try to reconnect
          console.log('🔄 Connection lost, attempting to reconnect...');
          await this.discoverServer();
          
          if (this.serverStatus === 'connected') {
            // Retry once
            return await apiClient.get(`/api/${tableName}`, filters);
          }
        }
        
        throw error;
      }
    }
  }

  async getById(tableName, id) {
    if (this.isOwner) {
      return await db[tableName].get(Number(id));
    } else {
      if (this.serverStatus !== 'connected') {
        throw new Error('Not connected to owner server');
      }
      return await apiClient.get(`/api/${tableName}/${id}`);
    }
  }

  async add(tableName, data) {
    if (this.isOwner) {
      return await db[tableName].add(data);
    } else {
      if (this.serverStatus !== 'connected') {
        throw new Error('Not connected to owner server');
      }
      return await apiClient.post(`/api/${tableName}`, data);
    }
  }

  async update(tableName, id, changes) {
    if (this.isOwner) {
      return await db[tableName].update(Number(id), changes);
    } else {
      if (this.serverStatus !== 'connected') {
        throw new Error('Not connected to owner server');
      }
      return await apiClient.put(`/api/${tableName}/${id}`, changes);
    }
  }

  async delete(tableName, id) {
    if (this.isOwner) {
      return await db[tableName].delete(Number(id));
    } else {
      if (this.serverStatus !== 'connected') {
        throw new Error('Not connected to owner server');
      }
      return await apiClient.delete(`/api/${tableName}/${id}`);
    }
  }

  // ========== SPECIFIC TABLE METHODS ==========
  
  // USERS
  async getUsers() {
    return this.getAll('users');
  }

  async getUserByUsername(username) {
    if (this.isOwner) {
      return await db.users.where('username').equals(username).first();
    } else {
      const users = await this.getAll('users', { where: { username } });
      return users[0];
    }
  }

  // Check if username exists (for client mode)
  async checkUserExists(username) {
    try {
      if (this.isOwner) {
        const user = await db.users.where('username').equals(username).first();
        return !!user;
      } else {
        // Client mode: Try to check with server
        const users = await this.getAll('users', { where: { username } });
        return users.length > 0;
      }
    } catch (error) {
      console.error('Error checking user:', error);
      return false;
    }
  }

  // PRODUCTS
  async getProducts(categoryId = null) {
    if (categoryId) {
      return this.getAll('products', { where: { category_id: categoryId } });
    }
    return this.getAll('products');
  }

  async addProduct(productData) {
    const data = {
      ...productData,
      created_at: new Date(),
      created_by: this.getCurrentUserId()
    };
    return this.add('products', data);
  }

  // INVENTORY
  async getInventory() {
    return this.getAll('inventory');
  }

  async getInventoryWithDetails() {
    if (this.isOwner) {
      const inventory = await this.getInventory();
      const products = await this.getProducts();
      const suppliers = await this.getSuppliers();
      
      return inventory.map(item => {
        const product = products.find(p => p.product_id === item.product_id);
        const supplier = suppliers.find(s => s.supplier_id === item.supplier_id);
        return {
          ...item,
          product_name: product?.name || 'Unknown',
          supplier_name: supplier?.name || 'Unknown',
          sku: product?.sku || 'N/A'
        };
      });
    } else {
      return await apiClient.get('/api/inventory/with-details');
    }
  }

  async updateInventory(productId, changes) {
    const data = {
      ...changes,
      updated_at: new Date(),
      updated_by: this.getCurrentUserId()
    };
    return this.update('inventory', productId, data);
  }

  // SALES
  async getSales(date = null) {
    if (date) {
      return this.getAll('sales', { where: { sales_date: date } });
    }
    return this.getAll('sales');
  }

  async getSaleItems(saleId = null) {
    if (saleId) {
      return this.getAll('sale_items', { where: { sales_id: saleId } });
    }
    return this.getAll('sale_items');
  }

  async processSale(saleData) {
    if (this.isOwner) {
      return await db.transaction('rw', db.sales, db.sale_items, db.inventory, db.stock_card, async () => {
        const saleId = await db.sales.add({
          user_id: saleData.user_id,
          sales_date: new Date().toISOString().split('T')[0],
          sales_time: new Date().toLocaleTimeString()
        });

        for (const item of saleData.items) {
          const saleItemId = await db.sale_items.add({
            sales_id: saleId,
            product_id: item.product_id,
            quantity: item.quantity,
            amount: item.amount,
            total_amount: item.total_amount,
            stockout_reason: item.stockout_reason
          });

          // Update inventory
          const current = await db.inventory.get(item.product_id);
          if (current) {
            await db.inventory.update(item.product_id, {
              quantity: current.quantity - item.quantity,
              updated_at: new Date(),
              updated_by: saleData.user_id
            });
          }

          // Add to stock card
          await db.stock_card.add({
            product_id: item.product_id,
            user_id: saleData.user_id,
            quantity: -item.quantity,
            sales_id: saleId,
            sale_items_id: saleItemId,
            transaction_type: 'SALE',
            transaction_date: new Date(),
            unit_price: item.amount / item.quantity
          });
        }

        return saleId;
      });
    } else {
      if (this.serverStatus !== 'connected') {
        throw new Error('Not connected to owner server. Cannot process sale.');
      }
      return await apiClient.post('/api/sales/process', saleData);
    }
  }

  // SUPPLIERS
  async getSuppliers() {
    return this.getAll('suppliers');
  }

  async addSupplier(supplierData) {
    const data = {
      ...supplierData,
      created_at: new Date(),
      created_by: this.getCurrentUserId()
    };
    return this.add('suppliers', data);
  }

  // CATEGORIES
  async getCategories() {
    return this.getAll('categories');
  }

  // PRODUCT UNITS
  async getProductUnits(productId = null) {
    if (productId) {
      return this.getAll('product_units', { where: { product_id: productId } });
    }
    return this.getAll('product_units');
  }

  // RESUPPLIED ITEMS
  async getResuppliedItems() {
    return this.getAll('resupplied_items');
  }

  // STOCK CARD
  async getStockCard() {
    return this.getAll('stock_card');
  }

  // BACKUP
  async getBackups() {
    return this.getAll('backup');
  }

  // DELETED ITEMS
  async getDeletedItems() {
    return this.getAll('deleted_items');
  }

  // DASHBOARD STATS
  async getDashboardStats() {
    if (this.isOwner) {
      const today = new Date().toISOString().split('T')[0];
      
      const [products, inventory, sales, saleItems] = await Promise.all([
        this.getProducts(),
        this.getInventory(),
        this.getSales(today),
        this.getSaleItems()
      ]);

      // Calculate stats
      const totalProducts = products.length;
      
      const lowStock = inventory.filter(i => i.quantity <= i.threshold).length;
      
      const salesToday = sales.reduce((total, sale) => {
        const items = saleItems.filter(item => item.sales_id === sale.sales_id);
        return total + items.reduce((sum, item) => sum + item.amount, 0);
      }, 0);

      const expired = inventory.filter(i => {
        if (!i.expiration_date) return false;
        return new Date(i.expiration_date) < new Date();
      }).length;

      return {
        totalProducts,
        lowStock,
        salesToday,
        expired
      };
    } else {
      if (this.serverStatus !== 'connected') {
        throw new Error('Not connected to owner server. Cannot fetch dashboard stats.');
      }
      return await apiClient.get('/api/dashboard/stats');
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
    localStorage.setItem('userMode', mode);
    
    // Re-initialize if switching modes
    this.initialize();
  }

  // Server status methods
  getServerStatus() {
    return this.serverStatus;
  }

  isConnectedToServer() {
    return this.serverStatus === 'connected';
  }

  async manuallySetOwnerIP(ip) {
    if (!this.isClient) return false;
    
    console.log(`🛠️ Manually setting owner IP to: ${ip}`);
    
    try {
      if (await apiClient.testConnection(ip)) {
        localStorage.setItem('owner_ip', ip);
        this.serverStatus = 'connected';
        return true;
      }
    } catch (error) {
      console.error('Manual IP setting failed:', error);
    }
    
    return false;
  }

  async reconnect() {
    if (!this.isClient) return false;
    
    console.log('🔄 Attempting to reconnect to owner server...');
    this.serverStatus = 'discovering';
    
    const discoveredIP = await this.discoverServer();
    return discoveredIP !== null;
  }
}

// Create singleton instance
export const dataService = new DataService();

// Initialize mode from localStorage on import
const savedMode = localStorage.getItem('userMode');
if (savedMode) {
  dataService.setUserMode(savedMode);
}