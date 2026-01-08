const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  res.header(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );

  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const dbPath = path.join(__dirname, 'database.db');
let db;

const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Failed to connect to SQLite database:', err.message);
        reject(err);
        return;
      }
      
      console.log('✅ Connected to SQLite database');
      createTables().then(resolve).catch(reject);
    });
  });
};

const createTables = () => {
  return new Promise((resolve) => {
    const tables = [
      // Users - matches Dexie schema
      `CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'staff',
        full_name TEXT,
        store_name TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Suppliers - matches Dexie schema
      `CREATE TABLE IF NOT EXISTS suppliers (
        supplier_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        contact_info TEXT,
        address TEXT,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Categories - matches Dexie schema
      `CREATE TABLE IF NOT EXISTS categories (
        category_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Products - matches Dexie schema
      `CREATE TABLE IF NOT EXISTS products (
        product_id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT UNIQUE,
        name TEXT NOT NULL,
        unit_price REAL DEFAULT 0,
        supplier_id INTEGER,
        base_unit TEXT DEFAULT 'pcs',
        category_id INTEGER,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id),
        FOREIGN KEY (category_id) REFERENCES categories(category_id)
      )`,
      
      // Product Units - matches Dexie schema
      `CREATE TABLE IF NOT EXISTS product_units (
        unit_id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        unit_name TEXT NOT NULL,
        conversion_factor REAL DEFAULT 1,
        price_per_unit REAL,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(product_id)
      )`,
      
      // Inventory - matches Dexie schema (product_id as primary key)
      `CREATE TABLE IF NOT EXISTS inventory (
        product_id INTEGER PRIMARY KEY,
        supplier_id INTEGER,
        quantity INTEGER DEFAULT 0,
        expiration_date TEXT,
        threshold INTEGER DEFAULT 10,
        updated_by INTEGER,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(product_id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id)
      )`,
      
      // Resupplied Items - matches Dexie schema
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
        FOREIGN KEY (product_id) REFERENCES products(product_id),
        FOREIGN KEY (user_id) REFERENCES users(user_id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id)
      )`,
      
      // Sales - matches Dexie schema
      `CREATE TABLE IF NOT EXISTS sales (
        sales_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        sales_date TEXT DEFAULT (date('now')),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id)
      )`,
      
      // Sale Items - matches Dexie schema
      `CREATE TABLE IF NOT EXISTS sale_items (
        sales_items_id INTEGER PRIMARY KEY AUTOINCREMENT,
        sales_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        amount REAL NOT NULL,
        total_amount REAL NOT NULL,
        stockout_reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sales_id) REFERENCES sales(sales_id),
        FOREIGN KEY (product_id) REFERENCES products(product_id)
      )`,
      
      // Stock Card - matches Dexie schema exactly
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
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(product_id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id),
        FOREIGN KEY (user_id) REFERENCES users(user_id),
        FOREIGN KEY (sales_id) REFERENCES sales(sales_id),
        FOREIGN KEY (sale_items_id) REFERENCES sale_items(sales_items_id)
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
        FOREIGN KEY (user_id) REFERENCES users(user_id)
      )`,
      
      // Deleted Items - matches Dexie schema
      `CREATE TABLE IF NOT EXISTS deleted_items (
        deleted_id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        original_data TEXT NOT NULL,
        deleted_by INTEGER,
        deleted_at TEXT DEFAULT CURRENT_TIMESTAMP,
        restored_at TEXT,
        confirmed_at TEXT,
        FOREIGN KEY (deleted_by) REFERENCES users(user_id)
      )`
    ];

    let completed = 0;
    tables.forEach((sql, index) => {
      db.run(sql, (err) => {
        if (err) console.warn(`⚠️ Table ${index + 1} warning:`, err.message);
        completed++;
        if (completed === tables.length) {
          console.log('✅ Database tables initialized to match Dexie schema');
          resolve();
        }
      });
    });
  });
};

// Helper to get all data with filters
const dbHelpers = {
  getAll: (tableName, filters = {}) => {
    return new Promise((resolve, reject) => {
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
      
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  getById: (tableName, id) => {
    return new Promise((resolve, reject) => {
      const idField = getPrimaryKey(tableName);
      db.get(`SELECT * FROM ${tableName} WHERE ${idField} = ?`, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  },

  add: (tableName, data) => {
    return new Promise((resolve, reject) => {
      // Filter out undefined values
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
      
      db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  },

  update: (tableName, id, changes) => {
    return new Promise((resolve, reject) => {
      const idField = getPrimaryKey(tableName);
      const updates = [];
      const values = [];
      
      Object.entries(changes).forEach(([key, value]) => {
        if (value !== undefined) {
          updates.push(`${key} = ?`);
          values.push(value);
        }
      });
      
      if (updates.length === 0) {
        resolve(0);
        return;
      }
      
      values.push(id);
      const sql = `UPDATE ${tableName} SET ${updates.join(', ')} WHERE ${idField} = ?`;
      
      db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  },

  delete: (tableName, id) => {
    return new Promise((resolve, reject) => {
      const idField = getPrimaryKey(tableName);
      db.run(`DELETE FROM ${tableName} WHERE ${idField} = ?`, [id], function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  },

  // Process sale with transaction - matches Dexie transaction approach
  processSale: async (saleData) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        const saleSql = `INSERT INTO sales (user_id, sales_date) VALUES (?, ?)`;
        const saleDate = saleData.sales_date || new Date().toISOString().split('T')[0];
        
        db.run(saleSql, [saleData.user_id, saleDate], function(err) {
          if (err) {
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          
          const saleId = this.lastID;
          let processedItems = 0;
          
          saleData.items.forEach((item) => {
            const saleItemSql = `INSERT INTO sale_items (sales_id, product_id, quantity, amount, total_amount, stockout_reason) VALUES (?, ?, ?, ?, ?, ?)`;
            
            db.run(saleItemSql, [
              saleId,
              item.product_id,
              item.quantity,
              item.amount,
              item.total_amount,
              item.stockout_reason || null
            ], function(err) {
              if (err) {
                db.run('ROLLBACK');
                reject(err);
                return;
              }
              
              const saleItemId = this.lastID;
              
              // Update inventory quantity
              const inventorySql = `
                INSERT OR REPLACE INTO inventory (product_id, quantity, updated_at) 
                VALUES (
                  ?, 
                  COALESCE((SELECT quantity FROM inventory WHERE product_id = ?), 0) - ?,
                  CURRENT_TIMESTAMP
                )
              `;
              
              db.run(inventorySql, [item.product_id, item.product_id, item.quantity], (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  reject(err);
                  return;
                }
                
                // Add to stock card - matches Dexie schema
                const stockCardSql = `
                  INSERT INTO stock_card (
                    product_id, user_id, quantity, 
                    unit_price, sales_id, sale_items_id, 
                    transaction_type, running_balance
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `;
                
                // Calculate running balance
                const getRunningBalance = () => {
                  return new Promise((resolveBalance) => {
                    db.get(
                      'SELECT running_balance FROM stock_card WHERE product_id = ? ORDER BY stock_card_id DESC LIMIT 1',
                      [item.product_id],
                      (err, row) => {
                        if (err || !row) resolveBalance(-item.quantity);
                        else resolveBalance((row.running_balance || 0) - item.quantity);
                      }
                    );
                  });
                };
                
                getRunningBalance().then(runningBalance => {
                  db.run(stockCardSql, [
                    item.product_id,
                    saleData.user_id,
                    -item.quantity,
                    item.amount,
                    saleId,
                    saleItemId,
                    'SALE',
                    runningBalance
                  ], (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      reject(err);
                      return;
                    }
                    
                    processedItems++;
                    
                    if (processedItems === saleData.items.length) {
                      db.run('COMMIT', (err) => {
                        if (err) {
                          db.run('ROLLBACK');
                          reject(err);
                          return;
                        }
                        resolve({ saleId, saleItemIds: Array.from({ length: processedItems }, (_, i) => saleItemId - processedItems + i + 1) });
                      });
                    }
                  });
                });
              });
            });
          });
        });
      });
    });
  },

  // Bulk operations for sync
  bulkAdd: (tableName, items) => {
    return new Promise((resolve, reject) => {
      if (!items || items.length === 0) {
        resolve([]);
        return;
      }
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        const insertedIds = [];
        const keys = Object.keys(items[0]);
        const placeholders = keys.map(() => '?').join(', ');
        const sql = `INSERT OR REPLACE INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
        
        items.forEach((item, index) => {
          const values = keys.map(key => item[key]);
          
          db.run(sql, values, function(err) {
            if (err) {
              db.run('ROLLBACK');
              reject(err);
              return;
            }
            
            insertedIds.push(this.lastID);
            
            if (index === items.length - 1) {
              db.run('COMMIT', (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  reject(err);
                  return;
                }
                resolve(insertedIds);
              });
            }
          });
        });
      });
    });
  }
};

function getPrimaryKey(tableName) {
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

// Function to get all network addresses
function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  
  Object.keys(interfaces).forEach((ifaceName) => {
    interfaces[ifaceName].forEach((iface) => {
      // Skip internal and non-IPv4 addresses
      if (iface.internal || iface.family !== 'IPv4') return;
      
      addresses.push({
        interface: ifaceName,
        address: iface.address,
        family: iface.family
      });
    });
  });
  
  return addresses;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    app: 'inventory-system',
    schema_version: '6',
    status: 'online',
    timestamp: new Date().toISOString(),
    tables: [
      'users', 'suppliers', 'categories', 'products', 'product_units',
      'inventory', 'resupplied_items', 'sales', 'sale_items',
      'stock_card', 'backup', 'deleted_items'
    ]
  });
});

// Server discovery endpoint
app.get('/api/discover', (req, res) => {
  const addresses = getNetworkAddresses();
  const serverInfo = {
    app: 'inventory-system',
    server_ip: req.ip.replace('::ffff:', ''),
    local_ips: addresses.map(addr => addr.address),
    port: PORT,
    timestamp: new Date().toISOString()
  };
  
  console.log(`📡 Discovery request from: ${req.ip}`);
  res.json(serverInfo);
});

// CRUD endpoints for all tables
const tables = [
  'users', 'suppliers', 'categories', 'products', 'product_units',
  'inventory', 'resupplied_items', 'sales', 'sale_items',
  'stock_card', 'backup', 'deleted_items'
];

tables.forEach(tableName => {
  app.get(`/api/${tableName}`, async (req, res) => {
    try {
      const filters = {};
      if (req.query) {
        Object.keys(req.query).forEach(key => {
          if (req.query[key] !== undefined && req.query[key] !== '') {
            try {
              filters[key] = JSON.parse(req.query[key]);
            } catch {
              filters[key] = req.query[key];
            }
          }
        });
      }
      
      const data = await dbHelpers.getAll(tableName, { where: filters });
      res.json({ success: true, data });
    } catch (error) {
      console.error(`Error in GET /api/${tableName}:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get(`/api/${tableName}/:id`, async (req, res) => {
    try {
      const data = await dbHelpers.getById(tableName, req.params.id);
      if (!data) return res.status(404).json({ success: false, error: 'Record not found' });
      res.json({ success: true, data });
    } catch (error) {
      console.error(`Error in GET /api/${tableName}/:id:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post(`/api/${tableName}`, async (req, res) => {
    try {
      const id = await dbHelpers.add(tableName, req.body);
      const data = await dbHelpers.getById(tableName, id);
      res.json({ success: true, id, data });
    } catch (error) {
      console.error(`Error in POST /api/${tableName}:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post(`/api/${tableName}/bulk`, async (req, res) => {
    try {
      const ids = await dbHelpers.bulkAdd(tableName, req.body);
      res.json({ success: true, ids, count: ids.length });
    } catch (error) {
      console.error(`Error in POST /api/${tableName}/bulk:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put(`/api/${tableName}/:id`, async (req, res) => {
    try {
      const updated = await dbHelpers.update(tableName, req.params.id, req.body);
      if (updated === 0) return res.status(404).json({ success: false, error: 'Record not found or no changes made' });
      const data = await dbHelpers.getById(tableName, req.params.id);
      res.json({ success: true, updated, data });
    } catch (error) {
      console.error(`Error in PUT /api/${tableName}/:id:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete(`/api/${tableName}/:id`, async (req, res) => {
    try {
      const deleted = await dbHelpers.delete(tableName, req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: 'Record not found' });
      res.json({ success: true, message: 'Record deleted successfully' });
    } catch (error) {
      console.error(`Error in DELETE /api/${tableName}/:id:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
});

// Special endpoints
app.post('/api/sales/process', async (req, res) => {
  try {
    const result = await dbHelpers.processSale(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error in /api/sales/process:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Inventory with product and supplier details
app.get('/api/inventory/with-details', async (req, res) => {
  try {
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
    
    db.all(sql, [], (err, rows) => {
      if (err) throw err;
      res.json({ success: true, data: rows });
    });
  } catch (error) {
    console.error('Error in /api/inventory/with-details:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dashboard statistics
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const queries = [
      // Total products
      new Promise((resolve) => {
        db.get('SELECT COUNT(*) as count FROM products', (err, row) => {
          resolve(row?.count || 0);
        });
      }),
      // Low stock items
      new Promise((resolve) => {
        db.get(`
          SELECT COUNT(*) as count 
          FROM inventory i
          JOIN products p ON i.product_id = p.product_id
          WHERE i.quantity <= i.threshold
        `, (err, row) => {
          resolve(row?.count || 0);
        });
      }),
      // Today's sales
      new Promise((resolve) => {
        db.get(`
          SELECT COALESCE(SUM(si.total_amount), 0) as total 
          FROM sales s
          JOIN sale_items si ON s.sales_id = si.sales_id
          WHERE s.sales_date = ?
        `, [today], (err, row) => {
          resolve(row?.total || 0);
        });
      }),
      // Expired items
      new Promise((resolve) => {
        db.get(`
          SELECT COUNT(*) as count 
          FROM inventory 
          WHERE expiration_date IS NOT NULL 
          AND expiration_date < ?
        `, [today], (err, row) => {
          resolve(row?.count || 0);
        });
      }),
      // Total sales count
      new Promise((resolve) => {
        db.get('SELECT COUNT(*) as count FROM sales', (err, row) => {
          resolve(row?.count || 0);
        });
      })
    ];
    
    const [totalProducts, lowStock, salesToday, expired, totalSales] = await Promise.all(queries);
    
    res.json({
      success: true,
      data: { totalProducts, lowStock, salesToday, expired, totalSales }
    });
  } catch (error) {
    console.error('Error in /api/dashboard/stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sync endpoint for mobile apps
app.post('/api/sync/push', async (req, res) => {
  try {
    const { table, data, lastSync } = req.body;
    
    if (!table || !data) {
      return res.status(400).json({ success: false, error: 'Table and data are required' });
    }
    
    const ids = await dbHelpers.bulkAdd(table, data);
    
    res.json({
      success: true,
      message: `Synced ${data.length} records to ${table}`,
      insertedIds: ids,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in /api/sync/push:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/sync/pull', async (req, res) => {
  try {
    const { table, lastSync } = req.query;
    
    if (!table) {
      return res.status(400).json({ success: false, error: 'Table is required' });
    }
    
    let sql = `SELECT * FROM ${table}`;
    const params = [];
    
    if (lastSync) {
      sql += ` WHERE created_at > ? OR updated_at > ?`;
      params.push(lastSync, lastSync);
    }
    
    db.all(sql, params, (err, rows) => {
      if (err) {
        throw err;
      }
      
      res.json({
        success: true,
        table,
        data: rows,
        count: rows.length,
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    console.error('Error in /api/sync/pull:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const PORT = process.env.API_PORT || 3001;

initDatabase()
  .then(() => {
    const server = http.createServer(app);
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`📦 Inventory System API Server running on port ${PORT}`);
      console.log(`💾 Database: SQLite (${dbPath})`);
      console.log(`📋 Schema Version: 6 (Dexie compatible)`);
      
      // Get all network addresses
      const addresses = getNetworkAddresses();
      
      console.log('\n🌐 Available Network Addresses:');
      console.log(`   Local:  http://localhost:${PORT}`);
      
      addresses.forEach((addr, index) => {
        console.log(`   ${addr.interface}: http://${addr.address}:${PORT}`);
      });
      
      console.log(`\n📊 Health Check:`);
      console.log(`   http://localhost:${PORT}/api/health`);
      console.log(`📡 Discovery Endpoint:`);
      console.log(`   http://localhost:${PORT}/api/discover`);
      
      if (addresses.length > 0) {
        console.log(`\n🌐 External Access:`);
        addresses.forEach((addr, index) => {
          console.log(`   ${addr.interface}: http://${addr.address}:${PORT}/api/health`);
        });
      }
    });
  })
  .catch((err) => {
    console.error('❌ Failed to initialize database:', err);
    process.exit(1);
  });

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  if (db) {
    db.close((err) => {
      if (err) console.error('Error closing database:', err.message);
      else console.log('✅ Database connection closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});