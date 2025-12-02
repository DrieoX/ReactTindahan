const SERVER_URL = window.serverIP ? `http://${window.serverIP}:5000` : 'http://localhost:5000';

// Helper for GET requests
const getJSON = async (url) => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('GET request error:', err);
    return [];
  }
};

// Helper for POST/PUT/DELETE requests
const sendJSON = async (url, method, body) => {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : null
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`${method} request error:`, err);
    return { success: false, error: err.message };
  }
};

// ===== INVENTORY APIs =====
export const fetchInventory = async () => getJSON(`${SERVER_URL}/api/inventory`);
export const addInventoryItem = async (item) => sendJSON(`${SERVER_URL}/api/inventory`, 'POST', item);
export const updateInventoryItem = async (id, item) => sendJSON(`${SERVER_URL}/api/inventory/${id}`, 'PUT', item);
export const deleteInventoryItem = async (id) => sendJSON(`${SERVER_URL}/api/inventory/${id}`, 'DELETE');

// ===== SUPPLIER APIs =====
export const fetchSuppliers = async () => getJSON(`${SERVER_URL}/api/suppliers`);
export const addSupplier = async (supplier) => sendJSON(`${SERVER_URL}/api/suppliers`, 'POST', supplier);
export const updateSupplier = async (id, supplier) => sendJSON(`${SERVER_URL}/api/suppliers/${id}`, 'PUT', supplier);
export const deleteSupplier = async (id) => sendJSON(`${SERVER_URL}/api/suppliers/${id}`, 'DELETE');

// ===== CATEGORY APIs =====
export const fetchCategories = async () => getJSON(`${SERVER_URL}/api/categories`);
export const addCategory = async (name) => sendJSON(`${SERVER_URL}/api/categories`, 'POST', { name });
export const updateCategory = async (id, name) => sendJSON(`${SERVER_URL}/api/categories/${id}`, 'PUT', { name });
export const deleteCategory = async (id) => sendJSON(`${SERVER_URL}/api/categories/${id}`, 'DELETE');

// ===== PRODUCT APIs =====
export const fetchProducts = async () => getJSON(`${SERVER_URL}/api/products`);
export const addProduct = async (product) => sendJSON(`${SERVER_URL}/api/products`, 'POST', product);
export const updateProduct = async (id, product) => sendJSON(`${SERVER_URL}/api/products/${id}`, 'PUT', product);
export const deleteProduct = async (id) => sendJSON(`${SERVER_URL}/api/products/${id}`, 'DELETE');

// ===== RESUPPLY APIs =====
export const fetchResupplies = async () => getJSON(`${SERVER_URL}/api/resupplied_items`);
export const addResupply = async (resupply) => sendJSON(`${SERVER_URL}/api/resupplied_items`, 'POST', resupply);

// ===== SALES APIs =====
export const fetchSales = async () => getJSON(`${SERVER_URL}/api/sales`);
export const fetchSaleItems = async () => getJSON(`${SERVER_URL}/api/sale_items`);
export const fetchSaleById = async (id) => getJSON(`${SERVER_URL}/api/sales/${id}`);
export const fetchSalesToday = async () => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const sales = await fetchSales();
    return sales.filter(sale => sale.sales_date === today || sale.date === today);
  } catch (err) {
    console.error('Error fetching today\'s sales:', err);
    return [];
  }
};
export const addSale = async (sale) => sendJSON(`${SERVER_URL}/api/sales`, 'POST', sale);
export const updateSale = async (id, sale) => sendJSON(`${SERVER_URL}/api/sales/${id}`, 'PUT', sale);
export const deleteSale = async (id) => sendJSON(`${SERVER_URL}/api/sales/${id}`, 'DELETE');
export const addSaleItems = async (items) => sendJSON(`${SERVER_URL}/api/sale_items`, 'POST', items);
export const updateSaleItem = async (id, item) => sendJSON(`${SERVER_URL}/api/sale_items/${id}`, 'PUT', item);
export const deleteSaleItem = async (id) => sendJSON(`${SERVER_URL}/api/sale_items/${id}`, 'DELETE');

// ===== STOCK CARD APIs =====
export const fetchStockCard = async () => getJSON(`${SERVER_URL}/api/stock_card`);
export const addStockCard = async (record) => sendJSON(`${SERVER_URL}/api/stock_card`, 'POST', record);

// ===== USER & AUTH APIs =====
export const loginUser = async (credentials) => sendJSON(`${SERVER_URL}/api/login`, 'POST', credentials);
export const registerUser = async (userData) => sendJSON(`${SERVER_URL}/api/users`, 'POST', userData);
export const fetchUsers = async () => getJSON(`${SERVER_URL}/api/users`);

// ===== REPORT APIs =====
export const fetchReports = async () => getJSON(`${SERVER_URL}/api/reports`);
export const addReport = async (report) => sendJSON(`${SERVER_URL}/api/reports`, 'POST', report);
export const fetchSalesReport = async (startDate, endDate) => {
  try {
    const sales = await fetchSales();
    const saleItems = await fetchSaleItems();
    const products = await fetchProducts();
    
    // Filter sales by date range
    const filteredSales = sales.filter(sale => {
      const saleDate = new Date(sale.sales_date || sale.date);
      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(endDate) : new Date();
      return saleDate >= start && saleDate <= end;
    });
    
    // Group sales data
    const report = filteredSales.map(sale => {
      const items = saleItems.filter(item => item.sales_id === sale.sales_id || item.sales_id === sale.id);
      const totalAmount = items.reduce((sum, item) => sum + (item.amount || 0), 0);
      const itemDetails = items.map(item => {
        const product = products.find(p => p.product_id === item.product_id || p.id === item.product_id);
        return {
          name: product?.name || 'Unknown Product',
          quantity: item.quantity,
          amount: item.amount
        };
      });
      
      return {
        sales_date: sale.sales_date || sale.date,
        items: itemDetails,
        totalAmount
      };
    });
    
    return report.sort((a, b) => new Date(b.sales_date) - new Date(a.sales_date));
  } catch (err) {
    console.error('Error generating sales report:', err);
    return [];
  }
};

export const fetchResupplyReport = async (startDate, endDate) => {
  try {
    const resupplies = await fetchResupplies();
    const products = await fetchProducts();
    const suppliers = await fetchSuppliers();
    
    // Filter resupplies by date range
    const filteredResupplies = resupplies.filter(item => {
      const resupplyDate = new Date(item.resupply_date || item.date);
      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(endDate) : new Date();
      return resupplyDate >= start && resupplyDate <= end;
    });
    
    // Group resupplies by date
    const groupedResupplies = {};
    filteredResupplies.forEach(item => {
      const date = item.resupply_date || item.date;
      if (!groupedResupplies[date]) groupedResupplies[date] = [];
      groupedResupplies[date].push(item);
    });
    
    // Format report
    const report = Object.entries(groupedResupplies).map(([date, items]) => {
      const itemDetails = items.map(item => {
        const product = products.find(p => p.product_id === item.product_id || p.id === item.product_id);
        const supplier = suppliers.find(s => s.supplier_id === item.supplier_id || s.id === item.supplier_id);
        return {
          product_name: product?.name || 'Unknown Product',
          supplier_name: supplier?.name || 'Unknown Supplier',
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          expiration_date: item.expiration_date || 'N/A'
        };
      });
      
      const totalItems = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
      
      return {
        resupply_date: date,
        items: itemDetails,
        totalItems
      };
    });
    
    return report.sort((a, b) => new Date(b.resupply_date) - new Date(a.resupply_date));
  } catch (err) {
    console.error('Error generating resupply report:', err);
    return [];
  }
};

// ===== BACKUP APIs =====
export const fetchBackups = async () => getJSON(`${SERVER_URL}/api/backup`);
export const addBackup = async (backup) => sendJSON(`${SERVER_URL}/api/backup`, 'POST', backup);

// ===== PRODUCT UNITS APIs =====
export const fetchProductUnits = async () => getJSON(`${SERVER_URL}/api/product_units`);
export const addProductUnit = async (unit) => sendJSON(`${SERVER_URL}/api/product_units`, 'POST', unit);

// ===== BULK OPERATIONS =====
export const syncLocalToAPI = async (data) => {
  // This function can be used to sync local IndexedDB data to API
  // You can implement based on your sync needs
  console.log('Sync function called with data:', data);
  return { success: true, message: 'Sync functionality to be implemented' };
};

// ===== HEALTH CHECK =====
export const checkAPIHealth = async () => {
  try {
    const response = await fetch(`${SERVER_URL}/api/health`, { 
      method: 'GET'
    });
    return response.ok;
  } catch (err) {
    console.error('API health check failed:', err);
    return false;
  }
};

// ===== UTILITY FUNCTIONS =====
export const setServerURL = (url) => {
  // Note: SERVER_URL is a const, so we can't reassign it directly
  // We'll need to use a different approach
  console.warn('setServerURL function needs to be reimplemented as SERVER_URL is const');
  console.log('Would update server URL to:', url);
  return url;
};

export const getServerURL = () => SERVER_URL;

// ===== TEST ENDPOINTS =====
export const testConnection = async () => {
  try {
    const startTime = Date.now();
    const response = await fetch(`${SERVER_URL}/api/health`);
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    return {
      success: response.ok,
      latency: `${latency}ms`,
      status: response.status,
      url: SERVER_URL
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      url: SERVER_URL
    };
  }
};