import Dexie from 'dexie';

export const db = new Dexie('POSDatabase');

db.version(1).stores({
  users: '++user_id, username, password_hash, role, full_name, store_name',
  suppliers: '++supplier_id, name, contact_info, address',
  products: '++product_id, sku, name, description, unit_price, supplier_id',
  inventory: "product_id, supplier_id, quantity, expiration_date, threshold",
  resupplied_items: '++resupplied_items_id, product_id, user_id, supplier_id, quantity, unit_cost, resupply_date, expiration_date',
  sales: '++sales_id, user_id, sales_date',
  sale_items: '++sales_items_id, sales_id, product_id, quantity, amount, total_amount, stockout_reason',
  backup: '++backup_id, user_id, timestamp, location'
});

db.version(2).stores({
  users: '++user_id, username, password_hash, role, full_name, store_name',
  suppliers: '++supplier_id, name, contact_info, address',
  products: '++product_id, sku, name, descrption, unit_price, supplier_id, base_unit',
  product_units: '++unit_id, product_id, unit_name, conversion_factor, price_per_unit',
  inventory: "product_id, supplier_id, quantity, expiration_date, threshold",
  resupplied_items: '++resupplied_items_id, product_id, user_id, supplier_id, quantity, unit_cost, resupply_date, expiration_date',
  sales: '++sales_id, user_id, sales_date',
  sale_items: '++sales_items_id, sales_id, product_id, quantity, amount, total_amount, stockout_reason',
  backup: '++backup_id, user_id, timestamp, location'
});
db.version(3).stores({
  users: '++user_id, username, password_hash, role, full_name, store_name',
  
  suppliers: '++supplier_id, name, contact_info, address',
  
  products: '++product_id, sku, name, unit_price, supplier_id, base_unit',
  
  product_units: '++unit_id, product_id, unit_name, conversion_factor, price_per_unit',
  
  inventory: 'product_id, supplier_id, quantity, expiration_date, threshold',
  
  resupplied_items: '++resupplied_items_id, product_id, user_id, supplier_id, quantity, unit_cost, resupply_date, expiration_date',
  
  sales: '++sales_id, user_id, sales_date',
  
  sale_items: '++sales_items_id, sales_id, product_id, quantity, amount, total_amount, stockout_reason',
  
  backup: '++backup_id, user_id, timestamp, location',

  stock_card: '++stock_card_id, product_id, supplier_id, user_id, ' +
              'quantity, unit_cost, unit_price, resupply_date, expiration_date, ' +
              'sales_id, sale_items_id, transaction_type, running_balance'
});


// Optional helper functions
export const addUser = async (user) => {
  return await db.users.add(user);
};

export const getUserByUsername = async (username) => {
  return await db.users.where('username').equals(username).first();
};
