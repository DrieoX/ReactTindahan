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
  username TEXT,
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
  name TEXT
);

CREATE TABLE IF NOT EXISTS products (
  product_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT,
  name TEXT,
  unit_price REAL,
  supplier_id INTEGER,
  base_unit TEXT,
  category_id INTEGER
);

CREATE TABLE IF NOT EXISTS product_units (
  unit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  unit_name TEXT,
  conversion_factor REAL,
  price_per_unit REAL
);

CREATE TABLE IF NOT EXISTS inventory (
  inventory_id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  supplier_id INTEGER,
  quantity REAL,
  expiration_date TEXT,
  threshold REAL
);

CREATE TABLE IF NOT EXISTS resupplied_items (
  resupplied_items_id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  user_id INTEGER,
  supplier_id INTEGER,
  quantity REAL,
  unit_cost REAL,
  resupply_date TEXT,
  expiration_date TEXT
);

CREATE TABLE IF NOT EXISTS sales (
  sales_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  sales_date TEXT
);

CREATE TABLE IF NOT EXISTS sale_items (
  sales_items_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_id INTEGER,
  product_id INTEGER,
  quantity REAL,
  amount REAL,
  total_amount REAL,
  stockout_reason TEXT
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
  running_balance REAL
);

CREATE TABLE IF NOT EXISTS backup (
  backup_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  timestamp TEXT,
  location TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  report_id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT
);
`);

// --- Secure user endpoints ---
app.post('/api/users', (req, res) => {
  const { username, password, role, full_name, store_name } = req.body;
  const hashedPassword = CryptoJS.SHA256(password).toString();

  const stmt = db.prepare(`
    INSERT INTO users (username, password_hash, role, full_name, store_name)
    VALUES (?,?,?,?,?)
  `);
  const info = stmt.run(username, hashedPassword, role, full_name, store_name);

  const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(info.lastInsertRowid);
  res.json(user);
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user) return res.status(400).json({ error: 'Invalid username' });

  const hashed = CryptoJS.SHA256(password).toString();
  if (user.password_hash !== hashed) return res.status(400).json({ error: 'Invalid password' });

  res.json(user);
});

// --- HEALTH CHECK ENDPOINT ---
app.get('/api/health', (req, res) => {
  try {
    // Test database connection
    db.prepare('SELECT 1 as test').get();
    
    res.json({
      status: 'healthy',
      server: 'POS Desktop',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      ip: getLocalIP(),
      port: PORT
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// --- DEBUG ENDPOINT ---
app.get('/api/debug', (req, res) => {
  const interfaces = os.networkInterfaces();
  res.json({
    serverTime: new Date().toISOString(),
    ip: getLocalIP(),
    port: PORT,
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
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
    res.json(rows);
  });

  // GET single
  app.get(`/api/${tableName}/:id`, (req, res) => {
    const row = db.prepare(`SELECT * FROM ${tableName} WHERE ${idColumn} = ?`).get(req.params.id);
    res.json(row || {});
  });

  // POST create
  app.post(`/api/${tableName}`, (req, res) => {
    const keys = Object.keys(req.body);
    const values = Object.values(req.body);
    const placeholders = keys.map(() => '?').join(',');
    const stmt = db.prepare(`INSERT INTO ${tableName} (${keys.join(',')}) VALUES (${placeholders})`);
    const info = stmt.run(...values);
    const newRow = db.prepare(`SELECT * FROM ${tableName} WHERE ${idColumn} = ?`).get(info.lastInsertRowid);
    res.json(newRow);
  });

  // PUT update
  app.put(`/api/${tableName}/:id`, (req, res) => {
    const updates = Object.entries(req.body)
      .map(([key, value]) => `${key} = ?`)
      .join(', ');
    const values = [...Object.values(req.body), req.params.id];
    
    const stmt = db.prepare(`UPDATE ${tableName} SET ${updates} WHERE ${idColumn} = ?`);
    const result = stmt.run(...values);
    
    if (result.changes > 0) {
      const updated = db.prepare(`SELECT * FROM ${tableName} WHERE ${idColumn} = ?`).get(req.params.id);
      res.json(updated);
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  // DELETE
  app.delete(`/api/${tableName}/:id`, (req, res) => {
    const stmt = db.prepare(`DELETE FROM ${tableName} WHERE ${idColumn} = ?`);
    const result = stmt.run(req.params.id);
    
    if (result.changes > 0) {
      res.json({ success: true, message: 'Deleted successfully' });
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });
};

// --- Custom Inventory Endpoint (returns products with inventory data) ---
app.get('/api/inventory', (req, res) => {
  const rows = db.prepare(`
    SELECT 
      p.product_id,
      p.sku,
      p.name,
      p.unit_price,
      p.base_unit,
      p.category_id,
      i.quantity,
      i.expiration_date,
      i.threshold,
      i.supplier_id,
      c.name as category_name,
      s.name as supplier_name
    FROM products p
    LEFT JOIN inventory i ON p.product_id = i.product_id
    LEFT JOIN categories c ON p.category_id = c.category_id
    LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
    ORDER BY p.name
  `).all();
  
  // Format to match frontend expectations
  const formatted = rows.map(row => ({
    product_id: row.product_id,
    id: row.product_id, // for compatibility
    sku: row.sku,
    name: row.name,
    unit_price: row.unit_price,
    base_unit: row.base_unit,
    category_id: row.category_id,
    quantity: row.quantity || 0,
    threshold: row.threshold || 5,
    expiration_date: row.expiration_date,
    suppliers: row.supplier_id ? [{
      supplier_id: row.supplier_id,
      name: row.supplier_name || 'N/A'
    }] : []
  }));
  
  res.json(formatted);
});

// Create inventory record
app.post('/api/inventory', (req, res) => {
  const { product_id, supplier_id, quantity, expiration_date, threshold } = req.body;
  
  try {
    // First, check if inventory record exists for this product
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
    
    // Return the updated inventory record
    const updatedRow = db.prepare(`
      SELECT 
        p.product_id, p.sku, p.name, p.unit_price, p.base_unit, p.category_id,
        i.quantity, i.expiration_date, i.threshold, i.supplier_id,
        s.name as supplier_name
      FROM products p
      LEFT JOIN inventory i ON p.product_id = i.product_id
      LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
      WHERE p.product_id = ?
    `).get(product_id);
    
    res.json({
      product_id: updatedRow.product_id,
      sku: updatedRow.sku,
      name: updatedRow.name,
      unit_price: updatedRow.unit_price,
      base_unit: updatedRow.base_unit,
      category_id: updatedRow.category_id,
      quantity: updatedRow.quantity || 0,
      threshold: updatedRow.threshold || 5,
      expiration_date: updatedRow.expiration_date,
      suppliers: updatedRow.supplier_id ? [{
        supplier_id: updatedRow.supplier_id,
        name: updatedRow.supplier_name || 'N/A'
      }] : []
    });
    
  } catch (err) {
    console.error('Error creating/updating inventory:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update inventory item
app.put('/api/inventory/:id', (req, res) => {
  const { quantity, expiration_date, threshold, supplier_id } = req.body;
  const productId = req.params.id;
  
  try {
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
          i.quantity, i.expiration_date, i.threshold, i.supplier_id,
          s.name as supplier_name
        FROM products p
        LEFT JOIN inventory i ON p.product_id = i.product_id
        LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
        WHERE p.product_id = ?
      `).get(productId);
      
      res.json({
        product_id: updated.product_id,
        sku: updated.sku,
        name: updated.name,
        unit_price: updated.unit_price,
        base_unit: updated.base_unit,
        category_id: updated.category_id,
        quantity: updated.quantity || 0,
        threshold: updated.threshold || 5,
        expiration_date: updated.expiration_date,
        suppliers: updated.supplier_id ? [{
          supplier_id: updated.supplier_id,
          name: updated.supplier_name || 'N/A'
        }] : []
      });
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  } catch (err) {
    console.error('Error updating inventory:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete inventory item
app.delete('/api/inventory/:id', (req, res) => {
  const productId = req.params.id;
  
  try {
    // Delete from inventory table
    const stmt = db.prepare('DELETE FROM inventory WHERE product_id = ?');
    const result = stmt.run(productId);
    
    // Note: We're NOT deleting from products table to keep product master data
    if (result.changes > 0) {
      res.json({ success: true, message: 'Inventory record deleted' });
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  } catch (err) {
    console.error('Error deleting inventory:', err);
    res.status(500).json({ error: err.message });
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

// --- Start server ---
app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`✅ POS API running`);
  console.log(`Localhost: http://localhost:${PORT}`);
  console.log(`LAN Access: http://${ip}:${PORT}`);
  console.log(`Health check: http://${ip}:${PORT}/api/health`);
  console.log(`Debug info: http://${ip}:${PORT}/api/debug`);

  // Populate some test data if empty
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (productCount === 0) {
    console.log('Populating test data...');
    
    // Add sample categories
    const categories = ['Beverages', 'Snacks', 'Dairy'];
    categories.forEach(name => {
      db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(name);
    });
    
    // Add sample suppliers
    db.prepare('INSERT OR IGNORE INTO suppliers (name, contact_info, address) VALUES (?, ?, ?)')
      .run('Supplier 1', '123-456-7890', '123 Main St');
    
    // Add sample products
    const sampleProducts = [
      ['PROD001', 'Coca Cola', 25.00, 1, 'can', 1],
      ['PROD002', 'Potato Chips', 50.00, 1, 'pack', 2],
      ['PROD003', 'Fresh Milk', 65.00, 1, 'liter', 3]
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
      `).run(result.lastInsertRowid, supplierId, 50, '2024-12-31', 10);
    });
    
    console.log('Test data populated!');
  }

  // --- Advertise service via Bonjour ---
  bonjour.publish({ 
    name: 'POS Desktop', 
    type: 'http', 
    port: PORT,
    txt: {
      version: '1.0.0',
      service: 'pos-api'
    }
  });
  
  console.log('🔍 Desktop is discoverable on local network via Bonjour/mDNS');
  console.log('Bonjour service published:');
  console.log(`- Name: POS Desktop`);
  console.log(`- Type: _http._tcp`);
  console.log(`- Port: ${PORT}`);
  console.log(`- IP: ${ip}`);
});