// sqliteAdapter.js
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

class SQLiteAdapter {
  constructor() {
    this.connection = null;
    this.db = null;
    this.isNative = Capacitor.isNativePlatform();
    this.isInitialized = false;
    this.apiBaseUrl = 'http://192.168.100.53:3001/api'; // Your Express server
  }

  async init() {
    if (this.isInitialized) return this;

    if (!this.isNative) {
      console.log('🌐 Web environment: Using API server connection');
      this.isInitialized = true;
      return this;
    }

    try {
      console.log('📱 Native environment: Using Capacitor SQLite');
      this.connection = new SQLiteConnection(CapacitorSQLite);
      
      const isConnected = await this.connection.isConnection('inventory_db');
      
      if (isConnected.result) {
        this.db = await this.connection.retrieveConnection('inventory_db');
      } else {
        this.db = await this.connection.createConnection(
          'inventory_db',
          false,
          'no-encryption',
          6 // Schema version matches Dexie
        );
        await this.db.open();
        await this.createTables();
      }
      
      this.isInitialized = true;
      console.log('✅ SQLite database initialized (Schema v6)');
      return this;
    } catch (error) {
      console.error('❌ SQLite initialization failed:', error);
      throw error;
    }
  }

  async createTables() {
    if (!this.isNative || !this.db) return;
    
    const tables = [
      // Users - exact match to Dexie schema
      `CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'staff',
        full_name TEXT,
        store_name TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Suppliers - exact match to Dexie schema
      `CREATE TABLE IF NOT EXISTS suppliers (
        supplier_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        contact_info TEXT,
        address TEXT,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Categories - exact match to Dexie schema
      `CREATE TABLE IF NOT EXISTS categories (
        category_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Products - exact match to Dexie schema
      `CREATE TABLE IF NOT EXISTS products (
        product_id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT UNIQUE,
        name TEXT NOT NULL,
        unit_price REAL DEFAULT 0,
        supplier_id INTEGER,
        base_unit TEXT DEFAULT 'pcs',
        category_id INTEGER,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Product Units - exact match to Dexie schema
      `CREATE TABLE IF NOT EXISTS product_units (
        unit_id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        unit_name TEXT NOT NULL,
        conversion_factor REAL DEFAULT 1,
        price_per_unit REAL,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Inventory - exact match to Dexie schema (product_id as primary key)
      `CREATE TABLE IF NOT EXISTS inventory (
        product_id INTEGER PRIMARY KEY,
        supplier_id INTEGER,
        quantity INTEGER DEFAULT 0,
        expiration_date TEXT,
        threshold INTEGER DEFAULT 10,
        updated_by INTEGER,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Resupplied Items - exact match to Dexie schema
      `CREATE TABLE IF NOT EXISTS resupplied_items (
        resupplied_items_id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        supplier_id INTEGER,
        quantity INTEGER NOT NULL,
        unit_type TEXT DEFAULT 'pcs',
        unit_cost REAL,
        resupply_date TEXT DEFAULT (date('now')),
        expiration_date TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        created_by TEXT,
        updated_at TEXT,
        updated_by TEXT,
        transaction_type TEXT DEFAULT 'RESUPPLY',
      )`,
      
      // Sales - exact match to Dexie schema
      `CREATE TABLE IF NOT EXISTS sales (
        sales_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        sales_date TEXT DEFAULT (date('now')),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Sale Items - exact match to Dexie schema
      `CREATE TABLE IF NOT EXISTS sale_items (
        sales_items_id INTEGER PRIMARY KEY AUTOINCREMENT,
        sales_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        amount REAL NOT NULL,
        total_amount REAL NOT NULL,
        stockout_reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Stock Card - exact match to Dexie schema
      `CREATE TABLE IF NOT EXISTS stock_card (
        stock_card_id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        supplier_id INTEGER,
        user_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_cost REAL,
        unit_price REAL,
        resupply_date TEXT,
        expiration_date TEXT,
        sales_id INTEGER,
        sale_items_id INTEGER,
        transaction_type TEXT NOT NULL,
        running_balance INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Backup - simplified to match Dexie schema
      `CREATE TABLE IF NOT EXISTS backup (
        backup_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        backup_name TEXT NOT NULL,
        backup_type TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        schema_version TEXT,
        file_path TEXT,
        checksum TEXT,
        details TEXT,
      )`,
      
      // Deleted Items - exact match to Dexie schema
      `CREATE TABLE IF NOT EXISTS deleted_items (
        deleted_id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        original_data TEXT NOT NULL,
        deleted_by INTEGER,
        deleted_at TEXT DEFAULT CURRENT_TIMESTAMP,
        restored_at TEXT,
        confirmed_at TEXT
      )`
    ];

    for (const sql of tables) {
      try {
        await this.db.execute(sql);
      } catch (error) {
        console.warn('Table creation warning:', error.message);
      }
    }
  }

  // ========== UNIFIED CRUD METHODS ==========
  // These methods work for both web (API) and native (SQLite)
  
  async getAll(tableName, filters = {}) {
    await this.ensureInitialized();
    
    if (!this.isNative) {
      // Web mode: Use API
      return this.apiCall('GET', `/${tableName}`, null, filters);
    }
    
    // Native mode: Use SQLite
    let sql = `SELECT * FROM ${tableName}`;
    const params = [];
    
    if (filters.where && Object.keys(filters.where).length > 0) {
      const conditions = [];
      Object.entries(filters.where).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          conditions.push(`${key} = ?`);
          params.push(value);
        }
      });
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }
    
    if (filters.orderBy) {
      sql += ` ORDER BY ${filters.orderBy}`;
    }
    
    if (filters.limit) {
      sql += ` LIMIT ${filters.limit}`;
    }
    
    try {
      const result = await this.db.query(sql, params);
      return result.values || [];
    } catch (error) {
      console.error(`Error getting all from ${tableName}:`, error);
      return [];
    }
  }

  async getById(tableName, id) {
    await this.ensureInitialized();
    
    if (!this.isNative) {
      // Web mode: Use API
      return this.apiCall('GET', `/${tableName}/${id}`);
    }
    
    // Native mode: Use SQLite
    try {
      const result = await this.db.query(
        `SELECT * FROM ${tableName} WHERE ${this.getPrimaryKey(tableName)} = ?`,
        [id]
      );
      return result.values?.[0] || null;
    } catch (error) {
      console.error(`Error getting by ID from ${tableName}:`, error);
      return null;
    }
  }

  async add(tableName, data) {
    await this.ensureInitialized();
    
    if (!this.isNative) {
      // Web mode: Use API
      return this.apiCall('POST', `/${tableName}`, data);
    }
    
    // Native mode: Use SQLite
    const filteredData = {};
    Object.keys(data).forEach(key => {
      if (data[key] !== undefined) {
        filteredData[key] = data[key];
      }
    });
    
    const keys = Object.keys(filteredData);
    const values = keys.map(key => filteredData[key]);
    const placeholders = keys.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
    
    try {
      await this.db.run(sql, values);
      const result = await this.db.query('SELECT last_insert_rowid() as id');
      const insertedId = result.values?.[0]?.id;
      return this.getById(tableName, insertedId);
    } catch (error) {
      console.error(`Error adding to ${tableName}:`, error);
      throw error;
    }
  }

  async update(tableName, id, changes) {
    await this.ensureInitialized();
    
    if (!this.isNative) {
      // Web mode: Use API
      return this.apiCall('PUT', `/${tableName}/${id}`, changes);
    }
    
    // Native mode: Use SQLite
    const updates = [];
    const values = [];
    
    Object.entries(changes).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    });
    
    if (updates.length === 0) return null;
    
    values.push(id);
    const sql = `UPDATE ${tableName} SET ${updates.join(', ')} WHERE ${this.getPrimaryKey(tableName)} = ?`;
    
    try {
      await this.db.run(sql, values);
      return this.getById(tableName, id);
    } catch (error) {
      console.error(`Error updating ${tableName}:`, error);
      throw error;
    }
  }

  async delete(tableName, id) {
    await this.ensureInitialized();
    
    if (!this.isNative) {
      // Web mode: Use API
      return this.apiCall('DELETE', `/${tableName}/${id}`);
    }
    
    // Native mode: Use SQLite
    try {
      const record = await this.getById(tableName, id);
      if (!record) return false;
      
      await this.db.run(
        `DELETE FROM ${tableName} WHERE ${this.getPrimaryKey(tableName)} = ?`,
        [id]
      );
      return true;
    } catch (error) {
      console.error(`Error deleting from ${tableName}:`, error);
      return false;
    }
  }

  // ========== SPECIAL OPERATIONS ==========
  async processSale(saleData) {
    await this.ensureInitialized();
    
    if (!this.isNative) {
      // Web mode: Use API
      return this.apiCall('POST', '/sales/process', saleData);
    }
    
    // Native mode: Use SQLite transaction
    try {
      await this.db.execute('BEGIN TRANSACTION');
      
      // Insert sale
      const saleResult = await this.db.run(
        'INSERT INTO sales (user_id, sales_date) VALUES (?, ?)',
        [saleData.user_id, saleData.sales_date || new Date().toISOString().split('T')[0]]
      );
      const saleId = saleResult.changes?.lastId || saleResult.lastId;
      
      const saleItemIds = [];
      
      // Process each item
      for (const item of saleData.items) {
        // Insert sale item
        const saleItemResult = await this.db.run(
          `INSERT INTO sale_items (sales_id, product_id, quantity, amount, total_amount, stockout_reason) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [saleId, item.product_id, item.quantity, item.amount, item.total_amount, item.stockout_reason || null]
        );
        const saleItemId = saleItemResult.changes?.lastId || saleItemResult.lastId;
        saleItemIds.push(saleItemId);
        
        // Update inventory
        await this.db.run(
          `INSERT OR REPLACE INTO inventory (product_id, quantity, updated_at) 
           VALUES (?, COALESCE((SELECT quantity FROM inventory WHERE product_id = ?), 0) - ?, CURRENT_TIMESTAMP)`,
          [item.product_id, item.product_id, item.quantity]
        );
        
        // Calculate running balance for stock card
        const balanceResult = await this.db.query(
          'SELECT running_balance FROM stock_card WHERE product_id = ? ORDER BY stock_card_id DESC LIMIT 1',
          [item.product_id]
        );
        const previousBalance = balanceResult.values?.[0]?.running_balance || 0;
        const runningBalance = previousBalance - item.quantity;
        
        // Add to stock card
        await this.db.run(
          `INSERT INTO stock_card (
            product_id, user_id, quantity, unit_price, 
            sales_id, sale_items_id, transaction_type, running_balance
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [item.product_id, saleData.user_id, -item.quantity, item.amount, 
           saleId, saleItemId, 'SALE', runningBalance]
        );
      }
      
      await this.db.execute('COMMIT');
      return { saleId, saleItemIds };
      
    } catch (error) {
      await this.db.execute('ROLLBACK');
      console.error('Error processing sale:', error);
      throw error;
    }
  }

  async transaction(operations) {
    await this.ensureInitialized();
    
    if (!this.isNative) {
      // For web, just execute operations (API calls handle transactions)
      return operations();
    }
    
    // Native mode: SQLite transaction
    try {
      await this.db.execute('BEGIN TRANSACTION');
      const result = await operations();
      await this.db.execute('COMMIT');
      return result;
    } catch (error) {
      await this.db.execute('ROLLBACK');
      throw error;
    }
  }

  async query(sql, params = []) {
    await this.ensureInitialized();
    
    if (!this.isNative) {
      throw new Error('Custom queries only available in native mode');
    }
    
    try {
      const result = await this.db.query(sql, params);
      return result.values || [];
    } catch (error) {
      console.error('Query error:', error);
      return [];
    }
  }

  async execute(sql, params = []) {
    await this.ensureInitialized();
    
    if (!this.isNative) {
      throw new Error('Custom execute only available in native mode');
    }
    
    try {
      await this.db.execute(sql, params);
      return true;
    } catch (error) {
      console.error('Execute error:', error);
      return false;
    }
  }

  // ========== SYNC METHODS ==========
  async syncPush(table, data) {
    if (!this.isNative) {
      return this.apiCall('POST', '/sync/push', { table, data });
    }
    
    // For native sync to server
    try {
      const response = await fetch(`${this.apiBaseUrl}/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, data })
      });
      
      if (!response.ok) throw new Error(`Sync failed: ${response.statusText}`);
      return await response.json();
    } catch (error) {
      console.error('Sync push error:', error);
      throw error;
    }
  }

  async syncPull(table, lastSync) {
    if (!this.isNative) {
      const params = lastSync ? `?table=${table}&lastSync=${lastSync}` : `?table=${table}`;
      return this.apiCall('GET', `/sync/pull${params}`);
    }
    
    // For native sync from server
    try {
      const url = `${this.apiBaseUrl}/sync/pull?table=${table}${lastSync ? `&lastSync=${lastSync}` : ''}`;
      const response = await fetch(url);
      
      if (!response.ok) throw new Error(`Sync failed: ${response.statusText}`);
      return await response.json();
    } catch (error) {
      console.error('Sync pull error:', error);
      throw error;
    }
  }

  // ========== HELPER METHODS ==========
  async apiCall(method, endpoint, data = null, params = {}) {
    try {
      const url = new URL(`${this.apiBaseUrl}${endpoint}`);
      
      // Add query params for GET requests
      if (method === 'GET' && params) {
        Object.keys(params).forEach(key => {
          if (params[key] !== undefined) {
            url.searchParams.append(key, JSON.stringify(params[key]));
          }
        });
      }
      
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      
      if (data && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(data);
      }
      
      const response = await fetch(url.toString(), options);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      return result.data || result;
      
    } catch (error) {
      console.error(`API call error (${method} ${endpoint}):`, error);
      throw error;
    }
  }

  getPrimaryKey(tableName) {
    const primaryKeys = {
      'users': 'user_id',
      'suppliers': 'supplier_id',
      'categories': 'category_id',
      'products': 'product_id',
      'product_units': 'unit_id',
      'inventory': 'product_id',
      'resupplied_items': 'resupplied_items_id',
      'sales': 'sales_id',
      'sale_items': 'sales_items_id',
      'stock_card': 'stock_card_id',
      'backup': 'backup_id',
      'deleted_items': 'deleted_id'
    };
    
    return primaryKeys[tableName] || 'id';
  }

  async ensureInitialized() {
    if (!this.isInitialized) await this.init();
  }

  async close() {
    if (this.db && this.isInitialized && this.isNative) {
      await this.db.close();
      this.isInitialized = false;
    }
  }

  isReadyForMobile() {
    return this.isNative && this.isInitialized && this.db !== null;
  }

  // Helper to match Dexie helper functions
  async getUserByUsername(username) {
    if (!this.isNative) {
      return this.apiCall('GET', '/users', { where: { username } });
    }
    
    try {
      const result = await this.db.query(
        'SELECT * FROM users WHERE username = ?',
        [username]
      );
      return result.values?.[0] || null;
    } catch (error) {
      console.error('Error getting user by username:', error);
      return null;
    }
  }
}

export const sqliteAdapter = new SQLiteAdapter();

// Optional Dexie-like helper functions for compatibility
export const addUser = async (user) => {
  return await sqliteAdapter.add('users', user);
};

export const getUserByUsername = async (username) => {
  return await sqliteAdapter.getUserByUsername(username);
};