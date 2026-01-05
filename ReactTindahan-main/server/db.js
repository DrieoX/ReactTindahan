const Dexie = require('dexie');
const path = require('path');
const fs = require('fs');

class InventoryDB {
  constructor() {
    this.db = new Dexie('InventoryDB');
    
    // EXACT COPY OF YOUR SCHEMA
    this.db.version(6).stores({
      users: '++user_id, username, password_hash, role, full_name, store_name',
      suppliers: '++supplier_id, name, contact_info, address, created_by, created_at',
      categories: '++category_id, name, created_by, created_at',
      products: '++product_id, sku, name, unit_price, supplier_id, base_unit, category_id, created_by, created_at',
      product_units: '++unit_id, product_id, unit_name, conversion_factor, price_per_unit, created_by, created_at',
      inventory: 'product_id, supplier_id, quantity, expiration_date, threshold, updated_by, updated_at',
      resupplied_items: '++resupplied_items_id, product_id, user_id, supplier_id, quantity, unit_cost, resupply_date, expiration_date',
      sales: '++sales_id, user_id, sales_date',
      sale_items: '++sales_items_id, sales_id, product_id, quantity, amount, total_amount, stockout_reason',
      stock_card: '++stock_card_id, product_id, supplier_id, user_id, quantity, unit_cost, unit_price, resupply_date, expiration_date, sales_id, sale_items_id, transaction_type, running_balance',
      backup: '++backup_id, user_id, backup_name, backup_type, created_at, schema_version, file_path, checksum',
      deleted_items: '++deleted_id, entity_type, entity_id, original_data, deleted_by, deleted_at, restored_at, confirmed_at'
    });
    
    this.initDatabase();
  }

  async initDatabase() {
    try {
      // Check if database file exists, if not, create initial data
      const dbPath = path.join(__dirname, '..', 'data', 'inventory.db');
      if (!fs.existsSync(path.dirname(dbPath))) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      }
    } catch (error) {
      console.error('Database initialization error:', error);
    }
  }

  // CRUD operations
  async getAll(table, filters = {}) {
    let collection = this.db[table];
    
    if (filters.where) {
      collection = collection.where(filters.where);
    }
    
    return await collection.toArray();
  }

  async getById(table, id) {
    return await this.db[table].get(Number(id));
  }

  async add(table, data) {
    return await this.db[table].add(data);
  }

  async update(table, id, changes) {
    return await this.db[table].update(Number(id), changes);
  }

  async delete(table, id) {
    return await this.db[table].delete(Number(id));
  }

  // Business logic methods matching your app
  async processSale(saleData) {
    return await this.db.transaction('rw', 
      this.db.sales, 
      this.db.sale_items, 
      this.db.inventory, 
      this.db.stock_card,
    async () => {
      // Your existing sale processing logic here
      const saleId = await this.db.sales.add({
        user_id: saleData.user_id,
        sales_date: new Date()
      });

      for (const item of saleData.items) {
        await this.db.sale_items.add({
          sales_id: saleId,
          product_id: item.product_id,
          quantity: item.quantity,
          amount: item.amount,
          total_amount: item.total_amount,
          stockout_reason: item.stockout_reason
        });

        // Update inventory
        const current = await this.db.inventory.get(item.product_id);
        if (current) {
          await this.db.inventory.update(item.product_id, {
            quantity: current.quantity - item.quantity,
            updated_at: new Date(),
            updated_by: saleData.user_id
          });
        }

        // Add to stock card
        await this.db.stock_card.add({
          product_id: item.product_id,
          user_id: saleData.user_id,
          quantity: -item.quantity, // Negative for sales
          sales_id: saleId,
          sale_items_id: item.sale_item_id,
          transaction_type: 'SALE',
          transaction_date: new Date()
        });
      }

      return saleId;
    });
  }

  async getInventoryWithDetails() {
    return await this.db.inventory
      .toArray()
      .then(async (inventory) => {
        const enhanced = [];
        for (const item of inventory) {
          const product = await this.db.products.get(item.product_id);
          const supplier = await this.db.suppliers.get(item.supplier_id);
          enhanced.push({
            ...item,
            product_name: product?.name || 'Unknown',
            supplier_name: supplier?.name || 'Unknown',
            sku: product?.sku || 'N/A'
          });
        }
        return enhanced;
      });
  }
}

module.exports = new InventoryDB();