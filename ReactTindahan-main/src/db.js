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

// Optional helper functions
export const addUser = async (user) => {
  return await db.users.add(user);
};

export const getUserByUsername = async (username) => {
  return await db.users.where('username').equals(username).first();
};
