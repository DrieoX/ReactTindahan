const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const os = require('os');
const CryptoJS = require('crypto-js');
const bonjour = require('bonjour')();

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// --- LAN IP helper ---
const getLocalIP = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .find(i => i.family === 'IPv4' && !i.internal)?.address;

// --- SQLite DB ---
const db = new Database('pos.db');

// --- Create tables if not exists ---
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password_hash TEXT,
  role TEXT,
  full_name TEXT,
  store_name TEXT
);

CREATE TABLE IF NOT EXISTS suppliers (
  supplier_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  contact_info TEXT,
  address TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  category_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  product_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE,
  name TEXT,
  unit_price REAL,
  supplier_id INTEGER,
  base_unit TEXT,
  category_id INTEGER,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id),
  FOREIGN KEY (category_id) REFERENCES categories(category_id)
);

CREATE TABLE IF NOT EXISTS product_units (
  unit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  unit_name TEXT,
  conversion_factor REAL,
  price_per_unit REAL,
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE TABLE IF NOT EXISTS inventory (
  inventory_id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER UNIQUE,
  supplier_id INTEGER,
  quantity REAL DEFAULT 0,
  expiration_date TEXT,
  threshold REAL DEFAULT 5,
  FOREIGN KEY (product_id) REFERENCES products(product_id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id)
);

CREATE TABLE IF NOT EXISTS resupplied_items (
  resupplied_items_id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  user_id INTEGER,
  supplier_id INTEGER,
  quantity REAL,
  unit_cost REAL,
  resupply_date TEXT DEFAULT CURRENT_TIMESTAMP,
  expiration_date TEXT,
  FOREIGN KEY (product_id) REFERENCES products(product_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id)
);

CREATE TABLE IF NOT EXISTS sales (
  sales_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  sales_date TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS sale_items (
  sales_items_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_id INTEGER,
  product_id INTEGER,
  quantity REAL,
  amount REAL,
  total_amount REAL,
  stockout_reason TEXT,
  FOREIGN KEY (sales_id) REFERENCES sales(sales_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE TABLE IF NOT EXISTS stock_card (
  stock_card_id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  supplier_id INTEGER,
  user_id INTEGER,
  quantity REAL,
  unit_cost REAL,
  unit_price REAL,
  resupply_date TEXT,
  expiration_date TEXT,
  sales_id INTEGER,
  sale_items_id INTEGER,
  transaction_type TEXT,
  running_balance REAL,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(product_id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (sales_id) REFERENCES sales(sales_id),
  FOREIGN KEY (sale_items_id) REFERENCES sale_items(sales_items_id)
);

CREATE TABLE IF NOT EXISTS backup (
  backup_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  location TEXT,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS reports (
  report_id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_type TEXT,
  data TEXT,
  generated_date TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// --- Helper function for common responses ---
const sendError = (res, status, message) => {
  console.error(`Error ${status}: ${message}`);
  res.status(status).json({ 
    error: message,
    timestamp: new Date().toISOString()
  });
};

const sendSuccess = (res, data) => {
  res.json(data);
};

// --- Secure user endpoints ---
app.post('/api/users', (req, res) => {
  try {
    const { username, password, role, full_name, store_name } = req.body;
    
    if (!username || !password) {
      return sendError(res, 400, 'Username and password are required');
    }
    
    // Check if username already exists
    const existingUser = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return sendError(res, 400, 'Username already exists');
    }
    
    const hashedPassword = CryptoJS.SHA256(password).toString();
    
    const stmt = db.prepare(`
      INSERT INTO users (username, password_hash, role, full_name, store_name)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const info = stmt.run(username, hashedPassword, role, full_name || '', store_name || '');
    
    const user = db.prepare(`
      SELECT user_id, username, role, full_name, store_name 
      FROM users WHERE user_id = ?
    `).get(info.lastInsertRowid);
    
    sendSuccess(res, user);
  } catch (error) {
    sendError(res, 500, `Registration failed: ${error.message}`);
  }
});

app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return sendError(res, 400, 'Username and password are required');
    }
    
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user) {
      return sendError(res, 401, 'Invalid username or password');
    }
    
    const hashed = CryptoJS.SHA256(password).toString();
    if (user.password_hash !== hashed) {
      return sendError(res, 401, 'Invalid username or password');
    }
    
    // Remove password hash from response
    const { password_hash, ...userData } = user;
    sendSuccess(res, userData);
  } catch (error) {
    sendError(res, 500, `Login failed: ${error.message}`);
  }
});

// --- HEALTH CHECK ENDPOINT ---
app.get('/api/health', (req, res) => {
  try {
    // Test database connection
    db.prepare('SELECT 1 as test').get();
    
    const ip = getLocalIP();
    sendSuccess(res, {
      status: 'healthy',
      server: 'POS Desktop',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      ip: ip || 'Unknown',
      port: PORT,
      database: 'connected',
      uptime: process.uptime()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    sendError(res, 500, `Server error: ${error.message}`);
  }
});

// --- DEBUG ENDPOINT ---
app.get('/api/debug', (req, res) => {
  const interfaces = os.networkInterfaces();
  sendSuccess(res, {
    serverTime: new Date().toISOString(),
    ip: getLocalIP(),
    port: PORT,
    nodeVersion: process.version,
    platform: process.platform,
    memoryUsage: process.memoryUsage(),
    interfaces: Object.keys(interfaces).map(key => ({
      name: key,
      addresses: interfaces[key].map(i => ({
        address: i.address,
        family: i.family,
        internal: i.internal
      }))
    })),
    bonjourActive: true
  });
});

// --- Full CRUD endpoints function ---
const createFullCRUDEndpoints = (tableName, idColumn = 'id') => {
  // GET all
  app.get(`/api/${tableName}`, (req, res) => {
    try {
      const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
      sendSuccess(res, rows);
    } catch (error) {
      sendError(res, 500, `Failed to fetch ${tableName}: ${error.message}`);
    }
  });

  // GET single
  app.get(`/api/${tableName}/:id`, (req, res) => {
    try {
      const row = db.prepare(`SELECT * FROM ${tableName} WHERE ${idColumn} = ?`).get(req.params.id);
      if (row) {
        sendSuccess(res, row);
      } else {
        sendError(res, 404, `${tableName.slice(0, -1)} not found`);
      }
    } catch (error) {
      sendError(res, 500, `Failed to fetch ${tableName}: ${error.message}`);
    }
  });

  // POST create
  app.post(`/api/${tableName}`, (req, res) => {
    try {
      const keys = Object.keys(req.body);
      const values = Object.values(req.body);
      
      if (keys.length === 0) {
        return sendError(res, 400, 'No data provided');
      }
      
      const placeholders = keys.map(() => '?').join(',');
      const stmt = db.prepare(`INSERT INTO ${tableName} (${keys.join(',')}) VALUES (${placeholders})`);
      const info = stmt.run(...values);
      
      const newRow = db.prepare(`SELECT * FROM ${tableName} WHERE ${idColumn} = ?`).get(info.lastInsertRowid);
      sendSuccess(res, newRow);
    } catch (error) {
      sendError(res, 500, `Failed to create ${tableName.slice(0, -1)}: ${error.message}`);
    }
  });

  // PUT update
  app.put(`/api/${tableName}/:id`, (req, res) => {
    try {
      const updates = Object.entries(req.body)
        .map(([key, value]) => `${key} = ?`)
        .join(', ');
      const values = [...Object.values(req.body), req.params.id];
      
      if (Object.keys(req.body).length === 0) {
        return sendError(res, 400, 'No update data provided');
      }
      
      const stmt = db.prepare(`UPDATE ${tableName} SET ${updates} WHERE ${idColumn} = ?`);
      const result = stmt.run(...values);
      
      if (result.changes > 0) {
        const updated = db.prepare(`SELECT * FROM ${tableName} WHERE ${idColumn} = ?`).get(req.params.id);
        sendSuccess(res, updated);
      } else {
        sendError(res, 404, `${tableName.slice(0, -1)} not found`);
      }
    } catch (error) {
      sendError(res, 500, `Failed to update ${tableName.slice(0, -1)}: ${error.message}`);
    }
  });

  // DELETE
  app.delete(`/api/${tableName}/:id`, (req, res) => {
    try {
      const stmt = db.prepare(`DELETE FROM ${tableName} WHERE ${idColumn} = ?`);
      const result = stmt.run(req.params.id);
      
      if (result.changes > 0) {
        sendSuccess(res, { 
          success: true, 
          message: `${tableName.slice(0, -1)} deleted successfully` 
        });
      } else {
        sendError(res, 404, `${tableName.slice(0, -1)} not found`);
      }
    } catch (error) {
      sendError(res, 500, `Failed to delete ${tableName.slice(0, -1)}: ${error.message}`);
    }
  });
};

// --- Custom Inventory Endpoint (returns products with inventory data) ---
app.get('/api/inventory', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        p.product_id,
        p.sku,
        p.name,
        p.unit_price,
        p.base_unit,
        p.category_id,
        COALESCE(i.quantity, 0) as quantity,
        i.expiration_date,
        COALESCE(i.threshold, 5) as threshold,
        i.supplier_id,
        c.name as category_name,
        s.name as supplier_name
      FROM products p
      LEFT JOIN inventory i ON p.product_id = i.product_id
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
      ORDER BY p.name
    `).all();
    
    const formatted = rows.map(row => ({
      product_id: row.product_id,
      id: row.product_id,
      sku: row.sku,
      name: row.name,
      unit_price: row.unit_price,
      base_unit: row.base_unit,
      category_id: row.category_id,
      quantity: row.quantity,
      threshold: row.threshold,
      expiration_date: row.expiration_date,
      suppliers: row.supplier_id ? [{
        supplier_id: row.supplier_id,
        name: row.supplier_name || 'N/A'
      }] : []
    }));
    
    sendSuccess(res, formatted);
  } catch (error) {
    sendError(res, 500, `Failed to fetch inventory: ${error.message}`);
  }
});

// Create/Update inventory record
app.post('/api/inventory', (req, res) => {
  try {
    const { product_id, supplier_id, quantity, expiration_date, threshold } = req.body;
    
    if (!product_id) {
      return sendError(res, 400, 'Product ID is required');
    }
    
    // Check if product exists
    const product = db.prepare('SELECT * FROM products WHERE product_id = ?').get(product_id);
    if (!product) {
      return sendError(res, 404, 'Product not found');
    }
    
    // Check if inventory record exists
    const existing = db.prepare('SELECT * FROM inventory WHERE product_id = ?').get(product_id);
    
    let result;
    if (existing) {
      // Update existing
      const stmt = db.prepare(`
        UPDATE inventory 
        SET supplier_id = ?, quantity = ?, expiration_date = ?, threshold = ?
        WHERE product_id = ?
      `);
      result = stmt.run(supplier_id, quantity, expiration_date, threshold, product_id);
    } else {
      // Create new
      const stmt = db.prepare(`
        INSERT INTO inventory (product_id, supplier_id, quantity, expiration_date, threshold)
        VALUES (?, ?, ?, ?, ?)
      `);
      result = stmt.run(product_id, supplier_id, quantity, expiration_date, threshold);
    }
    
    // Return updated record
    const updatedRow = db.prepare(`
      SELECT 
        p.product_id, p.sku, p.name, p.unit_price, p.base_unit, p.category_id,
        COALESCE(i.quantity, 0) as quantity,
        i.expiration_date,
        COALESCE(i.threshold, 5) as threshold,
        i.supplier_id,
        s.name as supplier_name
      FROM products p
      LEFT JOIN inventory i ON p.product_id = i.product_id
      LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
      WHERE p.product_id = ?
    `).get(product_id);
    
    const response = {
      product_id: updatedRow.product_id,
      sku: updatedRow.sku,
      name: updatedRow.name,
      unit_price: updatedRow.unit_price,
      base_unit: updatedRow.base_unit,
      category_id: updatedRow.category_id,
      quantity: updatedRow.quantity,
      threshold: updatedRow.threshold,
      expiration_date: updatedRow.expiration_date,
      suppliers: updatedRow.supplier_id ? [{
        supplier_id: updatedRow.supplier_id,
        name: updatedRow.supplier_name || 'N/A'
      }] : []
    };
    
    sendSuccess(res, response);
  } catch (error) {
    sendError(res, 500, `Failed to update inventory: ${error.message}`);
  }
});

// Update inventory item
app.put('/api/inventory/:id', (req, res) => {
  try {
    const { quantity, expiration_date, threshold, supplier_id } = req.body;
    const productId = req.params.id;
    
    const stmt = db.prepare(`
      UPDATE inventory 
      SET quantity = ?, expiration_date = ?, threshold = ?, supplier_id = ?
      WHERE product_id = ?
    `);
    
    const result = stmt.run(quantity, expiration_date, threshold, supplier_id, productId);
    
    if (result.changes > 0) {
      const updated = db.prepare(`
        SELECT 
          p.product_id, p.sku, p.name, p.unit_price, p.base_unit, p.category_id,
          COALESCE(i.quantity, 0) as quantity,
          i.expiration_date,
          COALESCE(i.threshold, 5) as threshold,
          i.supplier_id,
          s.name as supplier_name
        FROM products p
        LEFT JOIN inventory i ON p.product_id = i.product_id
        LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
        WHERE p.product_id = ?
      `).get(productId);
      
      const response = {
        product_id: updated.product_id,
        sku: updated.sku,
        name: updated.name,
        unit_price: updated.unit_price,
        base_unit: updated.base_unit,
        category_id: updated.category_id,
        quantity: updated.quantity,
        threshold: updated.threshold,
        expiration_date: updated.expiration_date,
        suppliers: updated.supplier_id ? [{
          supplier_id: updated.supplier_id,
          name: updated.supplier_name || 'N/A'
        }] : []
      };
      
      sendSuccess(res, response);
    } else {
      sendError(res, 404, 'Inventory record not found');
    }
  } catch (error) {
    sendError(res, 500, `Failed to update inventory: ${error.message}`);
  }
});

// Delete inventory item
app.delete('/api/inventory/:id', (req, res) => {
  try {
    const productId = req.params.id;
    
    const stmt = db.prepare('DELETE FROM inventory WHERE product_id = ?');
    const result = stmt.run(productId);
    
    if (result.changes > 0) {
      sendSuccess(res, { 
        success: true, 
        message: 'Inventory record deleted' 
      });
    } else {
      sendError(res, 404, 'Inventory record not found');
    }
  } catch (error) {
    sendError(res, 500, `Failed to delete inventory: ${error.message}`);
  }
});

// --- Use full CRUD for other tables ---
const tables = [
  ['suppliers','supplier_id'],
  ['categories','category_id'],
  ['products','product_id'],
  ['product_units','unit_id'],
  ['resupplied_items','resupplied_items_id'],
  ['sales','sales_id'],
  ['sale_items','sales_items_id'],
  ['stock_card','stock_card_id'],
  ['backup','backup_id'],
  ['reports','report_id']
];

tables.forEach(([table, id]) => createFullCRUDEndpoints(table, id));

// --- 404 Handler ---
app.use((req, res) => {
  sendError(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
});

// --- Error Handler ---
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  sendError(res, 500, 'Internal server error');
});

// --- Start server ---
const server = app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`
╔══════════════════════════════════════════════════════════╗
║              POS Desktop API Server v1.0.0               ║
╠══════════════════════════════════════════════════════════╣
║ ✅ Server running on port ${PORT}                        ║
║ 📍 Local:  http://localhost:${PORT}                      ║
║ 🌐 Network: http://${ip || '0.0.0.0'}:${PORT}            ║
║ 📊 Health:  http://${ip || 'localhost'}:${PORT}/api/health ║
║ 🔧 Debug:   http://${ip || 'localhost'}:${PORT}/api/debug  ║
╚══════════════════════════════════════════════════════════╝
  `);

  // Populate test data if empty
  try {
    const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    
    if (productCount === 0) {
      console.log('📦 Populating test data...');
      
      // Add sample categories
      const categories = ['Beverages', 'Snacks', 'Dairy', 'Bakery', 'Canned Goods'];
      categories.forEach(name => {
        db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(name);
      });
      
      // Add sample suppliers
      const suppliers = [
        ['Supplier 1', '123-456-7890', '123 Main St'],
        ['Supplier 2', '987-654-3210', '456 Oak Ave'],
        ['Supplier 3', '555-123-4567', '789 Pine Rd']
      ];
      
      suppliers.forEach(([name, contact, address]) => {
        db.prepare('INSERT OR IGNORE INTO suppliers (name, contact_info, address) VALUES (?, ?, ?)')
          .run(name, contact, address);
      });
      
      // Add sample products
      const sampleProducts = [
        ['PROD001', 'Coca Cola', 25.00, 1, 'can', 1],
        ['PROD002', 'Potato Chips', 50.00, 1, 'pack', 2],
        ['PROD003', 'Fresh Milk', 65.00, 2, 'liter', 3],
        ['PROD004', 'Bread', 35.00, 3, 'loaf', 4],
        ['PROD005', 'Canned Corn', 45.00, 2, 'can', 5]
      ];
      
      sampleProducts.forEach(([sku, name, price, supplierId, unit, catId]) => {
        const result = db.prepare(`
          INSERT INTO products (sku, name, unit_price, supplier_id, base_unit, category_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(sku, name, price, supplierId, unit, catId);
        
        // Add inventory for each product
        db.prepare(`
          INSERT INTO inventory (product_id, supplier_id, quantity, expiration_date, threshold)
          VALUES (?, ?, ?, ?, ?)
        `).run(result.lastInsertRowid, supplierId, Math.floor(Math.random() * 100) + 20, '2024-12-31', 10);
      });
      
      console.log('✅ Test data populated!');
    }
    
    if (userCount === 0) {
      console.log('👤 Creating default admin user...');
      const hashedPassword = CryptoJS.SHA256('admin123').toString();
      db.prepare(`
        INSERT INTO users (username, password_hash, role, full_name, store_name)
        VALUES (?, ?, ?, ?, ?)
      `).run('admin', hashedPassword, 'admin', 'Administrator', 'My Store');
      console.log('✅ Default admin created: username=admin, password=admin123');
    }
    
  } catch (error) {
    console.error('❌ Error populating test data:', error);
  }

  // --- Advertise service via Bonjour ---
  try {
    bonjour.publish({ 
      name: 'POS Desktop', 
      type: 'http', 
      port: PORT,
      txt: {
        version: '1.0.0',
        service: 'pos-api',
        ip: ip || 'localhost'
      }
    });
    
    console.log('🔍 Service advertised via Bonjour/mDNS');
    console.log('   Name: POS Desktop');
    console.log(`   Type: _http._tcp.local`);
    console.log(`   Port: ${PORT}`);
  } catch (error) {
    console.error('⚠️  Bonjour/mDNS not available:', error.message);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  bonjour.unpublishAll();
  server.close(() => {
    console.log('✅ Server shut down');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  bonjour.unpublishAll();
  server.close(() => {
    console.log('✅ Server shut down');
    process.exit(0);
  });
});