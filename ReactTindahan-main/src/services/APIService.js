// Configurable server URL
let serverConfig = {
  baseURL: window.serverIP ? `http://${window.serverIP}:5000` : 'http://localhost:5000'
};

// Helper functions
const getServerURL = () => serverConfig.baseURL;
export const setServerURL = (url) => {
  serverConfig.baseURL = url;
  return url;
};
export const getCurrentServerURL = () => getServerURL();

// Date filtering helper
const filterByDateRange = (items, dateField, startDate, endDate) => {
  return items.filter(item => {
    const itemDate = new Date(item[dateField] || item.date);
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    return itemDate >= start && itemDate <= end;
  });
};

// Product lookup helper
const getProductById = (products, productId) => {
  return products.find(p => 
    p.product_id === productId || p.id === productId
  ) || { name: 'Unknown Product' };
};

// Supplier lookup helper
const getSupplierById = (suppliers, supplierId) => {
  return suppliers.find(s => 
    s.supplier_id === supplierId || s.id === supplierId
  ) || { name: 'Unknown Supplier' };
};

// Error handling helper
const handleApiError = (error, context) => {
  console.error(`${context} error:`, error);
  return {
    success: false,
    error: error.message,
    context
  };
};

// Base fetch helpers
const getJSON = async (endpoint) => {
  try {
    const res = await fetch(`${getServerURL()}${endpoint}`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('GET request error:', err);
    return [];
  }
};

const sendJSON = async (endpoint, method, body) => {
  try {
    const res = await fetch(`${getServerURL()}${endpoint}`, {
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
export const fetchInventory = async () => getJSON(`/api/inventory`);
export const addInventoryItem = async (item) => sendJSON(`/api/inventory`, 'POST', item);
export const updateInventoryItem = async (id, item) => sendJSON(`/api/inventory/${id}`, 'PUT', item);
export const deleteInventoryItem = async (id) => sendJSON(`/api/inventory/${id}`, 'DELETE');

// ===== SUPPLIER APIs =====
export const fetchSuppliers = async () => getJSON(`/api/suppliers`);
export const addSupplier = async (supplier) => sendJSON(`/api/suppliers`, 'POST', supplier);
export const updateSupplier = async (id, supplier) => sendJSON(`/api/suppliers/${id}`, 'PUT', supplier);
export const deleteSupplier = async (id) => sendJSON(`/api/suppliers/${id}`, 'DELETE');

// ===== CATEGORY APIs =====
export const fetchCategories = async () => getJSON(`/api/categories`);
export const addCategory = async (name) => sendJSON(`/api/categories`, 'POST', { name });
export const updateCategory = async (id, name) => sendJSON(`/api/categories/${id}`, 'PUT', { name });
export const deleteCategory = async (id) => sendJSON(`/api/categories/${id}`, 'DELETE');

// ===== PRODUCT APIs =====
export const fetchProducts = async () => getJSON(`/api/products`);
export const addProduct = async (product) => sendJSON(`/api/products`, 'POST', product);
export const updateProduct = async (id, product) => sendJSON(`/api/products/${id}`, 'PUT', product);
export const deleteProduct = async (id) => sendJSON(`/api/products/${id}`, 'DELETE');

// ===== RESUPPLY APIs =====
export const fetchResupplies = async () => getJSON(`/api/resupplied_items`);
export const addResupply = async (resupply) => sendJSON(`/api/resupplied_items`, 'POST', resupply);

// ===== SALES APIs =====
export const fetchSales = async () => getJSON(`/api/sales`);
export const fetchSaleItems = async () => getJSON(`/api/sale_items`);
export const fetchSaleById = async (id) => getJSON(`/api/sales/${id}`);
export const fetchSalesToday = async () => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const sales = await fetchSales();
    return sales.filter(sale => (sale.sales_date || sale.date) === today);
  } catch (err) {
    console.error('Error fetching today\'s sales:', err);
    return [];
  }
};
export const addSale = async (sale) => sendJSON(`/api/sales`, 'POST', sale);
export const updateSale = async (id, sale) => sendJSON(`/api/sales/${id}`, 'PUT', sale);
export const deleteSale = async (id) => sendJSON(`/api/sales/${id}`, 'DELETE');
export const addSaleItems = async (items) => sendJSON(`/api/sale_items`, 'POST', items);
export const updateSaleItem = async (id, item) => sendJSON(`/api/sale_items/${id}`, 'PUT', item);
export const deleteSaleItem = async (id) => sendJSON(`/api/sale_items/${id}`, 'DELETE');

// ===== STOCK CARD APIs =====
export const fetchStockCard = async () => getJSON(`/api/stock_card`);
export const addStockCard = async (record) => sendJSON(`/api/stock_card`, 'POST', record);

// ===== USER & AUTH APIs =====
export const loginUser = async (credentials) => {
  // Trim username for consistency
  const trimmedCredentials = {
    ...credentials,
    username: credentials.username.trim().toLowerCase()
  };
  return sendJSON(`/api/login`, 'POST', trimmedCredentials);
};

export const registerUser = async (userData) => {
  // Trim username for consistency
  const trimmedUserData = {
    ...userData,
    username: userData.username.trim().toLowerCase(),
    full_name: userData.full_name?.trim(),
    store_name: userData.store_name?.trim()
  };
  return sendJSON(`/api/users`, 'POST', trimmedUserData);
};

export const fetchUsers = async () => getJSON(`/api/users`);

// ===== REPORT APIs =====
export const fetchReports = async () => getJSON(`/api/reports`);
export const addReport = async (report) => sendJSON(`/api/reports`, 'POST', report);

export const fetchSalesReport = async (startDate, endDate) => {
  try {
    const [sales, saleItems, products] = await Promise.all([
      fetchSales(),
      fetchSaleItems(),
      fetchProducts()
    ]);
    
    const filteredSales = filterByDateRange(sales, 'sales_date', startDate, endDate);
    
    const report = filteredSales.map(sale => {
      const items = saleItems.filter(item => 
        item.sales_id === sale.sales_id || item.sales_id === sale.id
      );
      const totalAmount = items.reduce((sum, item) => sum + (item.amount || 0), 0);
      const itemDetails = items.map(item => {
        const product = getProductById(products, item.product_id);
        return {
          name: product.name,
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
    return handleApiError(err, 'fetchSalesReport');
  }
};

export const fetchResupplyReport = async (startDate, endDate) => {
  try {
    const [resupplies, products, suppliers] = await Promise.all([
      fetchResupplies(),
      fetchProducts(),
      fetchSuppliers()
    ]);
    
    const filteredResupplies = filterByDateRange(resupplies, 'resupply_date', startDate, endDate);
    
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
        const product = getProductById(products, item.product_id);
        const supplier = getSupplierById(suppliers, item.supplier_id);
        return {
          product_name: product.name,
          supplier_name: supplier.name,
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
    return handleApiError(err, 'fetchResupplyReport');
  }
};

// ===== BACKUP APIs =====
export const fetchBackups = async () => getJSON(`/api/backup`);
export const addBackup = async (backup) => sendJSON(`/api/backup`, 'POST', backup);

// ===== PRODUCT UNITS APIs =====
export const fetchProductUnits = async () => getJSON(`/api/product_units`);
export const addProductUnit = async (unit) => sendJSON(`/api/product_units`, 'POST', unit);

// ===== BULK OPERATIONS =====
export const syncLocalToAPI = async (data) => {
  console.log('Sync function called with data:', data);
  return { success: true, message: 'Sync functionality to be implemented' };
};

// ===== HEALTH CHECK =====
export const checkAPIHealth = async () => {
  try {
    const startTime = Date.now();
    const response = await fetch(`${getServerURL()}/api/health`, { 
      method: 'GET',
      timeout: 5000
    });
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    const data = await response.json().catch(() => ({}));
    
    return {
      success: response.ok,
      latency: `${latency}ms`,
      status: response.status,
      data: data,
      url: getServerURL()
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      url: getServerURL()
    };
  }
};

// Alias for backward compatibility
export const testConnection = checkAPIHealth;

// ===== UTILITY FUNCTIONS =====
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
  }).format(amount);
};

export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};