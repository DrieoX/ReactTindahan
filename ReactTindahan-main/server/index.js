const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./db');

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:8080'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ======================
// HEALTH & DISCOVERY
// ======================
app.get('/api/health', (req, res) => {
  res.json({
    app: 'inventory-owner',
    mode: 'owner',
    status: 'online',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ======================
// AUTO-GENERATED CRUD FOR ALL TABLES
// ======================
const tables = [
  'users', 'suppliers', 'categories', 'products', 'product_units',
  'inventory', 'resupplied_items', 'sales', 'sale_items',
  'stock_card', 'backup', 'deleted_items'
];

tables.forEach(tableName => {
  // GET all
  app.get(`/api/${tableName}`, async (req, res) => {
    try {
      const data = await db.getAll(tableName);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET by ID
  app.get(`/api/${tableName}/:id`, async (req, res) => {
    try {
      const data = await db.getById(tableName, req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST create
  app.post(`/api/${tableName}`, async (req, res) => {
    try {
      const id = await db.add(tableName, req.body);
      res.json({ success: true, id });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // PUT update
  app.put(`/api/${tableName}/:id`, async (req, res) => {
    try {
      const updated = await db.update(tableName, req.params.id, req.body);
      res.json({ success: true, updated });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // DELETE
  app.delete(`/api/${tableName}/:id`, async (req, res) => {
    try {
      await db.delete(tableName, req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
});

// ======================
// BUSINESS ENDPOINTS
// ======================

// 1. SALES PROCESSING
app.post('/api/sales/process', async (req, res) => {
  try {
    const saleId = await db.processSale(req.body);
    res.json({ success: true, saleId });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. INVENTORY WITH DETAILS
app.get('/api/inventory/with-details', async (req, res) => {
  try {
    const inventory = await db.getAll('inventory');
    const enhanced = [];
    
    for (const item of inventory) {
      const [product, supplier] = await Promise.all([
        db.getById('products', item.product_id),
        db.getById('suppliers', item.supplier_id)
      ]);
      
      enhanced.push({
        ...item,
        product_name: product?.name,
        supplier_name: supplier?.name,
        sku: product?.sku
      });
    }
    
    res.json({ success: true, data: enhanced });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. DASHBOARD STATS
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const stats = {
      total_products: await db.db.products.count(),
      low_stock: await db.db.inventory.where('quantity').below('threshold').count(),
      today_sales: await db.db.sales.where('sales_date').equals(new Date().toDateString()).count(),
      total_suppliers: await db.db.suppliers.count()
    };
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. SYNC ENDPOINTS FOR MOBILE
app.post('/api/sync/pull', async (req, res) => {
  // For mobile to pull all data
  try {
    const syncData = {};
    for (const table of tables) {
      syncData[table] = await db.getAll(table);
    }
    res.json({ success: true, data: syncData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/sync/push', async (req, res) => {
  // For mobile to push changes
  try {
    const { changes } = req.body;
    const results = {};
    
    for (const table in changes) {
      for (const item of changes[table]) {
        if (item._deleted) {
          await db.delete(table, item.id);
        } else if (item.id) {
          await db.update(table, item.id, item);
        } else {
          await db.add(table, item);
        }
      }
      results[table] = { success: true };
    }
    
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. SEARCH ENDPOINTS
app.get('/api/search/products', async (req, res) => {
  try {
    const { q } = req.query;
    const products = await db.db.products
      .filter(product => 
        product.name.toLowerCase().includes(q.toLowerCase()) ||
        product.sku.toLowerCase().includes(q.toLowerCase())
      )
      .toArray();
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. REPORT ENDPOINTS
app.get('/api/reports/sales/:period', async (req, res) => {
  try {
    const { period } = req.params; // 'daily', 'weekly', 'monthly'
    const sales = await db.getAll('sales');
    // Add your reporting logic here
    res.json({ success: true, data: sales });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ======================
// ERROR HANDLING
// ======================
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start server
const PORT = process.env.API_PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`📦 Inventory Owner API Server running on port ${PORT}`);
  console.log(`🌐 Accessible at: http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔗 React app should run on: http://localhost:3000`);
});