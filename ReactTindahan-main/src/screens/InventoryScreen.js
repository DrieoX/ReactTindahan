import React, { useEffect, useState } from 'react'; 
import { db } from '../db';
import * as API from '../services/APIService';

export default function InventoryScreen({ userMode }) {
  const mode = userMode || 'client';

  const [inventory, setInventory] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newItem, setNewItem] = useState({ 
    name: '', sku: '', unit_price: '', base_unit: 'pcs', category_id: null, threshold: 5 
  });
  const [editingItem, setEditingItem] = useState(null);
  const [supplierDetails, setSupplierDetails] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    totalProducts: 0, lowStock: 0, expiringSoon: 0, inventoryValue: 0
  });
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    prepopulateCategories();
    fetchData();

    const handleGlobalScan = (e) => {
      if (e.key === 'Enter' && barcode.trim()) {
        setSearchQuery(barcode.trim());
        setBarcode('');
      } else if (e.key.length === 1) {
        setBarcode(prev => prev + e.key);
      }
    };

    window.addEventListener('keydown', handleGlobalScan);
    return () => window.removeEventListener('keydown', handleGlobalScan);
  }, [barcode, mode]);

  // --- Fetch based on mode ---
  const fetchData = async () => {
    setLoading(true);
    if (mode === 'server') {
      await fetchFromDB();
    } else {
      await fetchFromAPI();
    }
    setLoading(false);
  };

  const fetchFromDB = async () => {
    await fetchInventoryDB();
    await fetchSuppliersDB();
    await fetchCategoriesDB();
  };

  const fetchFromAPI = async () => {
    try {
      // Use the imported API functions
      const [apiInventory, apiSuppliers, apiCategories] = await Promise.all([
        API.fetchInventory(),
        API.fetchSuppliers(),  
        API.fetchCategories()
      ]);

      console.log('API Inventory response:', apiInventory);
      console.log('API Suppliers response:', apiSuppliers);
      console.log('API Categories response:', apiCategories);

      // Format the data to match expected structure
      const items = apiInventory.map(p => ({
        ...p,
        id: p.product_id || p.id,
        product_id: p.product_id || p.id, // Ensure product_id exists
        quantity: p.quantity || 0,
        threshold: p.threshold || 5,
        suppliers: p.suppliers || [],
      }));

      updateStats(items);
      setInventory(items);
      setSuppliers(apiSuppliers);
      setCategories(apiCategories);
    } catch (err) {
      console.error('Error fetching inventory from API:', err);
      // Fallback to empty arrays
      setInventory([]);
      setSuppliers([]);
      setCategories([]);
    }
  };

  const updateStats = (items) => {
    const totalProducts = items.length;
    const lowStock = items.filter(item => item.quantity <= (item.threshold || 5)).length;
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const expiringSoon = items.filter(item => {
      if (!item.expiration_date) return false;
      const expDate = new Date(item.expiration_date);
      return expDate <= nextWeek && expDate >= today;
    }).length;
    const inventoryValue = items.reduce((sum, item) => sum + ((item.unit_price || 0) * (item.quantity || 0)), 0);
    setStats({ totalProducts, lowStock, expiringSoon, inventoryValue });
  };

  // --- Prepopulate categories ---
  const prepopulateCategories = async () => {
    if (mode !== 'server') return; // skip for API mode
    try {
      const count = await db.categories.count();
      if (count === 0) {
        const defaultCategories = [
          'Beverages','Bakery','Dairy & Eggs','Meat & Poultry','Seafood','Fruits','Vegetables',
          'Pantry & Dry Goods','Snacks & Confectionery','Frozen Foods','Canned & Packaged Foods',
          'Condiments & Spices','Baking Supplies','Household & Cleaning','Personal Care'
        ];
        await Promise.all(defaultCategories.map(name => db.categories.add({ name })));
        fetchCategoriesDB();
      }
    } catch (err) {
      console.error('Error prepopulating categories:', err);
    }
  };

  // --- Local DB fetch ---
  const fetchCategoriesDB = async () => {
    if (mode !== 'server') return;
    try {
      const list = await db.categories.toArray();
      setCategories(list);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchInventoryDB = async () => {
    if (mode !== 'server') return;
    try {
      const products = await db.products.toArray();
      const inventoryRecords = await db.inventory.toArray();
      const supplierList = await db.suppliers.toArray();

      const items = products.map((p) => {
        const invRecord = inventoryRecords.find(inv => inv.product_id === p.product_id);
        return {
          ...p,
          id: p.product_id,
          product_id: p.product_id,
          quantity: invRecord?.quantity || 0,
          threshold: invRecord?.threshold || p.threshold || 5,
          suppliers: invRecord
            ? [{
                supplier_id: invRecord.supplier_id,
                name: supplierList.find(s => s.supplier_id === invRecord.supplier_id)?.name || 'N/A',
                quantity: invRecord.quantity,
                expiration_date: invRecord.expiration_date || 'N/A',
                unit_cost: 0, 
              }]
            : [],
        };
      });

      updateStats(items);
      setInventory(items);
    } catch (err) {
      console.error('Error fetching inventory:', err);
    }
  };

  const fetchSuppliersDB = async () => {
    if (mode !== 'server') return;
    try {
      const list = await db.suppliers.toArray();
      setSuppliers(list);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
    }
  };

  // --- Category handlers ---
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return alert("Enter a category name.");
    try {
      if (mode === 'server') {
        // Local DB mode
        await db.categories.add({ name: newCategoryName.trim() });
      } else {
        // API mode
        await API.addCategory(newCategoryName.trim());
      }
      
      setNewCategoryName('');
      setShowCategoryModal(false);
      fetchData(); // This will refresh categories from either DB or API
    } catch (err) {
      console.error("Error adding category:", err);
      alert('Failed to add category: ' + err.message);
    }
  };

  const handleEditCategory = (category) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async () => {
    if (!newCategoryName.trim()) return alert("Enter a category name.");
    try {
      if (mode === 'server') {
        // Local DB mode
        await db.categories.update(editingCategory.category_id, { name: newCategoryName.trim() });
      } else {
        // API mode
        await API.updateCategory(editingCategory.category_id || editingCategory.id, newCategoryName.trim());
      }
      
      setEditingCategory(null);
      setNewCategoryName('');
      setShowCategoryModal(false);
      fetchData(); // This will refresh categories from either DB or API
    } catch (err) {
      console.error("Error editing category:", err);
      alert('Failed to edit category: ' + err.message);
    }
  };

  const handleDeleteCategory = async (category) => {
    if (!window.confirm(`Are you sure you want to delete category "${category.name}"?`)) return;
    try {
      if (mode === 'server') {
        // Local DB mode
        await db.categories.delete(category.category_id);
      } else {
        // API mode
        await API.deleteCategory(category.category_id || category.id);
      }
      
      fetchData(); // This will refresh categories from either DB or API
    } catch (err) {
      console.error("Error deleting category:", err);
      alert('Failed to delete category: ' + err.message);
    }
  };

  // --- Add/Edit/Delete functions ---
  const handleAddItem = async () => {
    if (!newItem.name || !newItem.unit_price) {
      alert('Name and unit price are required');
      return;
    }

    try {
      if (mode === 'server') {
        // Local DB mode
        const productId = await db.products.add({
          sku: newItem.sku,
          name: newItem.name,
          unit_price: parseFloat(newItem.unit_price),
          base_unit: newItem.base_unit,
          category_id: newItem.category_id,
          supplier_id: 1 // Default supplier
        });

        await db.inventory.add({
          product_id: productId,
          supplier_id: 1,
          quantity: 0,
          threshold: newItem.threshold || 5,
          expiration_date: null
        });
      } else {
        // API mode
        // First create the product
        const productData = {
          sku: newItem.sku,
          name: newItem.name,
          unit_price: parseFloat(newItem.unit_price),
          base_unit: newItem.base_unit,
          category_id: newItem.category_id,
          supplier_id: 1 // Default supplier
        };

        // Use API.addProduct function
        const productResponse = await API.addProduct(productData);
        const product = productResponse;
        
        // Then create inventory record
        const inventoryData = {
          product_id: product.product_id || product.id,
          supplier_id: 1,
          quantity: 0,
          threshold: newItem.threshold || 5,
          expiration_date: null
        };

        await API.addInventoryItem(inventoryData);
      }

      // Reset form and refresh
      setNewItem({ name: '', sku: '', unit_price: '', base_unit: 'pcs', category_id: null, threshold: 5 });
      setShowAddModal(false);
      fetchData();
    } catch (err) {
      console.error('Error adding item:', err);
      alert('Failed to add item: ' + err.message);
    }
  };

  // This function opens the edit modal
  const handleEditItemClick = (item) => {
    setEditingItem(item);
    setShowEditModal(true);
  };

  // This function saves the edited item
  const handleSaveEdit = async () => {
    if (!editingItem || !editingItem.name || !editingItem.unit_price) {
      alert('Name and unit price are required');
      return;
    }

    try {
      const productId = editingItem.product_id || editingItem.id;
      
      if (mode === 'server') {
        // Update product in IndexedDB
        await db.products.update(productId, {
          sku: editingItem.sku,
          name: editingItem.name,
          unit_price: parseFloat(editingItem.unit_price),
          base_unit: editingItem.base_unit,
          category_id: editingItem.category_id
        });

        // Update inventory in IndexedDB
        const invRecord = await db.inventory.where('product_id').equals(productId).first();
        if (invRecord) {
          await db.inventory.update(invRecord.inventory_id, {
            threshold: editingItem.threshold || 5
          });
        }
      } else {
        // API mode
        // Update product via API
        const productData = {
          sku: editingItem.sku,
          name: editingItem.name,
          unit_price: parseFloat(editingItem.unit_price),
          base_unit: editingItem.base_unit,
          category_id: editingItem.category_id
        };

        await API.updateProduct(productId, productData);

        // Update inventory via API
        const inventoryData = {
          quantity: editingItem.quantity || 0,
          threshold: editingItem.threshold || 5,
          expiration_date: editingItem.expiration_date || null,
          supplier_id: 1
        };

        await API.updateInventoryItem(productId, inventoryData);
      }

      // Reset and refresh
      setEditingItem(null);
      setShowEditModal(false);
      fetchData();
    } catch (err) {
      console.error('Error updating item:', err);
      alert('Failed to update item: ' + err.message);
    }
  };

  // Delete function for individual items
  const handleDeleteItem = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;

    try {
      if (mode === 'server') {
        // Delete from IndexedDB
        await db.inventory.where('product_id').equals(id).delete();
        await db.products.delete(id);
      } else {
        // Delete from API - use the correct ID (product_id)
        await API.deleteInventoryItem(id);
      }

      fetchData();
    } catch (err) {
      console.error('Error deleting item:', err);
      alert('Failed to delete item: ' + err.message);
    }
  };

  const handleSupplierDetails = async (item) => {
    try {
      if (mode === 'server') {
        // Get supplier details from IndexedDB
        const stockRecords = await db.stock_card
          .where('product_id')
          .equals(item.product_id)
          .toArray();

        const supplierInfo = await Promise.all(stockRecords.map(async (record) => {
          const supplier = record.supplier_id 
            ? await db.suppliers.get(record.supplier_id) 
            : null;
          return {
            name: supplier?.name || 'N/A',
            resupply_date: record.resupply_date || 'N/A',
            quantity: record.quantity || 0,
            unit: item.base_unit || 'pcs',
            unit_cost: record.unit_cost || 0,
            unit_price: record.unit_price || item.unit_price || 0,
            expiration_date: record.expiration_date || 'N/A',
            transaction_type: record.transaction_type || 'N/A',
            running_balance: record.running_balance ?? null,
          };
        }));

        setSupplierDetails(supplierInfo);
        setShowSupplierModal(true);
      } else {
        // For API mode, show a message that this feature is not available
        alert('Supplier details feature is currently only available in Server mode.');
      }
    } catch (err) {
      console.error('Error fetching supplier details:', err);
      alert('Error fetching supplier details: ' + err.message);
    }
  };

  const filteredInventory = inventory.filter((item) => {
    if (showLowStockOnly) return item.quantity <= (item.threshold || 5);
    const q = searchQuery.toLowerCase();
    if (item.name.toLowerCase().includes(q)) return true;
    if (item.sku && item.sku.toLowerCase().includes(q)) return true;
    if (item.suppliers && item.suppliers.some((s) => s.name && s.name.toLowerCase().includes(q))) return true;
    return false;
  });

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Inventory Management</h1>
          <p style={styles.pageSubtitle}>Manage your products, track stock levels, and monitor expiry dates</p>
          <div style={styles.modeIndicator}>
            Mode: <span style={styles.modeText}>{mode === 'server' ? 'Local Database' : 'API Server'}</span>
          </div>
        </div>
        <div style={styles.headerActions}>
          <input
            style={styles.searchInput}
            placeholder="Search inventory or suppliers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Stats */}
      <div style={styles.statsContainer}>
        <div style={styles.statCard}>
          <h3 style={styles.statTitle}>Total Products</h3>
          <p style={styles.statValue}>{stats.totalProducts}</p>
        </div>
        <div
          style={{...styles.statCard, backgroundColor: '#fffbeb', borderColor: '#f59e0b', cursor: 'pointer'}}
          onClick={() => setShowLowStockOnly(!showLowStockOnly)}
        >
          <h3 style={styles.statTitle}>Low Stock Items</h3>
          <p style={{...styles.statValue, color: '#b45309'}}>{stats.lowStock}</p>
          <p style={{fontSize: '0.9rem', color: '#92400e'}}>
            {showLowStockOnly ? 'Showing Low Stock' : 'Click to View'}
          </p>
        </div>
        <div style={{...styles.statCard, backgroundColor: '#fef2f2', borderColor: '#ef4444'}}>
          <h3 style={styles.statTitle}>Expiring Soon</h3>
          <p style={{...styles.statValue, color: '#dc2626'}}>{stats.expiringSoon}</p>
        </div>
        <div style={{...styles.statCard, backgroundColor: '#f0f9ff', borderColor: '#0ea5e9'}}>
          <h3 style={styles.statTitle}>Inventory Value</h3>
          <p style={{...styles.statValue, color: '#0369a1'}}>₱{stats.inventoryValue.toFixed(2)}</p>
        </div>
      </div>

      {/* Products */}
      <div style={styles.productsSection}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Products</h2>
          <div style={styles.sectionActions}>
            <button style={styles.primaryButton} onClick={() => setShowAddModal(true)}>
              Add New Item
            </button>
            <button style={styles.secondaryButton} onClick={() => { setEditingCategory(null); setNewCategoryName(''); setShowCategoryModal(true); }}>
              Add Category
            </button>
          </div>
        </div>

        {loading ? (
          <div style={styles.loadingContainer}>
            <div style={styles.loadingSpinner}></div>
            <p>Loading inventory data...</p>
          </div>
        ) : (
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeader}>
                  <th style={styles.tableCell}>PRODUCT</th>
                  <th style={styles.tableCell}>CATEGORY</th>
                  <th style={styles.tableCell}>SKU</th>
                  <th style={styles.tableCell}>UNIT</th>
                  <th style={styles.tableCell}>PRICE</th>
                  <th style={styles.tableCell}>STOCK</th>
                  <th style={styles.tableCell}>THRESHOLD</th>
                  <th style={styles.tableCell}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{textAlign: 'center', padding: '40px', color: '#64748b'}}>
                      No products found. Add your first product to get started.
                    </td>
                  </tr>
                ) : (
                  filteredInventory.map((item) => (
                    <tr key={item.product_id || item.id} style={styles.tableRow}>
                      <td style={styles.tableCell}>{item.name}</td>
                      <td style={styles.tableCell}>{categories.find(c => c.category_id === item.category_id)?.name || 'N/A'}</td>
                      <td style={styles.tableCell}>{item.sku || 'N/A'}</td>
                      <td style={styles.tableCell}>{item.base_unit || 'pcs'}</td>
                      <td style={styles.tableCell}>₱{item.unit_price || '0.00'}</td>
                      <td style={styles.tableCell}>{item.quantity || 0}</td>
                      <td style={styles.tableCell}>{item.threshold || 5}</td>
                      <td style={styles.tableCell}>
                        <div style={styles.actionButtons}>
                          <button style={styles.editButton} onClick={() => handleEditItemClick(item)}>Edit</button>
                          <button style={styles.viewButton} onClick={() => handleSupplierDetails(item)}>View</button>
                          <button 
                            style={styles.deleteButtonSmall} 
                            onClick={() => handleDeleteItem(item.product_id || item.id, item.name)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {(showAddModal || showEditModal) && (
        <ProductModal
          visible={showAddModal || showEditModal}
          onClose={() => {
            setShowAddModal(false);
            setShowEditModal(false);
            setEditingItem(null);
          }}
          onSubmit={showAddModal ? handleAddItem : handleSaveEdit}
          onDelete={showEditModal ? () => handleDeleteItem(editingItem.product_id || editingItem.id, editingItem.name) : null}
          item={showAddModal ? newItem : editingItem}
          setItem={showAddModal ? setNewItem : setEditingItem}
          categories={categories}
          title={showAddModal ? 'Add New Product' : 'Edit Product'}
          isEdit={showEditModal}
        />
      )}

      {showSupplierModal && (
        <SupplierModal suppliers={supplierDetails} onClose={() => setShowSupplierModal(false)} />
      )}

      {showCategoryModal && (
        <CategoryModal 
          visible={showCategoryModal} 
          onClose={() => setShowCategoryModal(false)} 
          newCategoryName={newCategoryName}
          setNewCategoryName={setNewCategoryName}
          onSubmit={editingCategory ? handleSaveCategory : handleAddCategory}
          editingCategory={editingCategory}
          onDelete={editingCategory ? () => handleDeleteCategory(editingCategory) : null}
          categories={categories}
          handleEditCategory={handleEditCategory}
        />
      )}
    </div>
  );
}

function ProductModal({ visible, onClose, onSubmit, onDelete, item, setItem, title, isEdit, categories }) {
  if (!visible) return null;

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContainer}>
        <h2 style={styles.modalHeader}>{title}</h2>
        <div style={styles.modalContent}>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>SKU</label>
            <input
              placeholder="Enter product SKU"
              value={item?.sku || ''}
              onChange={(e) => setItem({ ...item, sku: e.target.value })}
              style={styles.input}
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Name *</label>
            <input
              placeholder="Enter product name"
              value={item?.name || ''}
              onChange={(e) => setItem({ ...item, name: e.target.value })}
              style={styles.input}
              required
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Category</label>
            <select 
              style={styles.input}
              value={item?.category_id || ''}
              onChange={(e) => setItem({ ...item, category_id: e.target.value ? parseInt(e.target.value) : null })}
            >
              <option value="">Select Category</option>
              {categories.map(c => (
                <option key={c.category_id || c.id} value={c.category_id || c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Base Unit *</label>
            <select 
              style={styles.input}
              value={item?.base_unit || 'pcs'}
              onChange={(e) => setItem({ ...item, base_unit: e.target.value })}
            >
              <option value="pcs">Pieces</option>
              <option value="dozen">Dozen</option>
              <option value="grams">Grams</option>
              <option value="kilos">Kilos</option>
              <option value="ml">Milliliters</option>
              <option value="liters">Liters</option>
              <option value="boxes">Boxes</option>
              <option value="packs">Packs</option>
            </select>
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Unit Price *</label>
            <input
              placeholder="0.00"
              value={item?.unit_price?.toString() || ''}
              type="number"
              step="0.01"
              onChange={(e) => setItem({ ...item, unit_price: e.target.value })}
              style={styles.input}
              required
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Stock Threshold *</label>
            <input
              placeholder="5"
              value={item?.threshold?.toString() || '5'}
              type="number"
              onChange={(e) => setItem({ ...item, threshold: e.target.value || 5 })}
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.modalButtons}>
          {isEdit && (
            <button style={styles.deleteButton} onClick={onDelete}>
              Delete
            </button>
          )}
          <button style={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button style={styles.submitButton} onClick={onSubmit}>
            {isEdit ? 'Save Changes' : 'Add Product'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SupplierModal({ suppliers, onClose }) {
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContainer}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={styles.modalHeader}>Stock Card</h2>
        </div>

        <div style={styles.modalContent}>
          {suppliers.length === 0 ? (
            <p style={styles.noDataText}>No stock card records available</p>
          ) : (
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeader}>
                    <th style={styles.tableCell}>Supplier</th>
                    <th style={styles.tableCell}>Transaction Date</th>
                    <th style={styles.tableCell}>Stock-in</th>
                    <th style={styles.tableCell}>Units</th>
                    <th style={styles.tableCell}>Expiry Date</th>
                    <th style={styles.tableCell}>Unit Cost</th>
                    <th style={styles.tableCell}>Unit Price</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s, idx) => (
                    <tr key={idx} style={styles.tableRow}>
                      <td style={styles.tableCell}>{s.name}</td>
                      <td style={styles.tableCell}>{s.resupply_date || 'N/A'}</td>
                      <td style={styles.tableCell}>{s.quantity}</td>
                      <td style={styles.tableCell}>{s.unit}</td>
                      <td style={styles.tableCell}>{s.expiration_date || 'N/A'}</td>
                      <td style={styles.tableCell}>₱{(s.unit_cost || 0).toFixed(2)}</td>
                      <td style={styles.tableCell}>₱{(s.unit_price || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={styles.modalButtons}>
          <button style={styles.cancelButton} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryModal({ visible, onClose, newCategoryName, setNewCategoryName, onSubmit, editingCategory, onDelete, categories, handleEditCategory }) {
  if (!visible) return null;
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContainer}>
        <h2 style={styles.modalHeader}>{editingCategory ? 'Edit Category' : 'Add New Category'}</h2>
        <div style={styles.modalContent}>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Category Name</label>
            <input 
              style={styles.input} 
              placeholder="Enter category name" 
              value={newCategoryName} 
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
          </div>

          <div style={{marginTop: '20px'}}>
            <h3>Existing Categories</h3>
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeader}>
                    <th style={styles.tableCell}>Category Name</th>
                    <th style={styles.tableCell}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.category_id || c.id} style={styles.tableRow}>
                      <td style={styles.tableCell}>{c.name}</td>
                      <td style={styles.tableCell}>
                        <button style={styles.editButton} onClick={() => handleEditCategory(c)}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
        <div style={styles.modalButtons}>
          {editingCategory && (
            <button style={styles.deleteButton} onClick={onDelete}>Delete</button>
          )}
          <button style={styles.cancelButton} onClick={onClose}>Cancel</button>
          <button style={styles.submitButton} onClick={onSubmit}>{editingCategory ? 'Save Changes' : 'Add Category'}</button>
        </div>
      </div>
    </div>
  );
}
const styles = {
  container: { 
    padding: '28px',
    backgroundColor: '#f8fafc', 
    minHeight: '100vh',
    maxWidth: '1440px',
    margin: '0 auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '32px',
    flexWrap: 'wrap',
    gap: '20px',
    backgroundColor: '#ffffff',
    padding: '24px',
    borderRadius: '16px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.03)',
    border: '1px solid #e2e8f0'
  },
  pageTitle: {
    fontSize: '32px',
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: '8px',
    letterSpacing: '-0.5px',
    background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  pageSubtitle: {
    fontSize: '15px',
    color: '#64748b',
    lineHeight: '1.5',
    maxWidth: '600px'
  },
  headerActions: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  },
  searchInput: {
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    padding: '12px 20px',
    backgroundColor: '#ffffff',
    width: '320px',
    fontSize: '15px',
    transition: 'all 0.2s ease',
    outline: 'none',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)'
  },
  statsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '20px',
    marginBottom: '32px'
  },
  statCard: {
    backgroundColor: '#ffffff',
    border: '2px solid #e2e8f0',
    borderRadius: '14px',
    padding: '24px',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.04)',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    position: 'relative',
    overflow: 'hidden'
  },
  statTitle: {
    fontSize: '14px',
    color: '#64748b',
    marginBottom: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  statValue: {
    fontSize: '36px',
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: '4px',
    lineHeight: '1.1'
  },
  productsSection: {
    backgroundColor: '#ffffff',
    border: '2px solid #e2e8f0',
    borderRadius: '16px',
    padding: '28px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
    overflow: 'hidden'
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '28px',
    flexWrap: 'wrap',
    gap: '16px'
  },
  sectionTitle: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#1e293b',
    position: 'relative',
    paddingLeft: '16px'
  },
  sectionActions: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center'
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
    color: '#ffffff',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    boxShadow: '0 4px 6px rgba(79, 70, 229, 0.2)'
  },
  secondaryButton: {
    backgroundColor: '#f8fafc',
    color: '#475569',
    border: '2px solid #e2e8f0',
    padding: '12px 24px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  tableContainer: {
    overflowX: 'auto',
    borderRadius: '12px',
    border: '2px solid #f1f5f9'
  },
  table: {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: '0',
    minWidth: '1000px'
  },
  tableHeader: {
    backgroundColor: '#f8fafc',
    borderBottom: '2px solid #e2e8f0'
  },
  tableRow: {
    borderBottom: '1px solid #f1f5f9',
    transition: 'background-color 0.2s ease'
  },
  tableCell: {
    padding: '18px 20px',
    textAlign: 'left',
    fontSize: '14.5px',
    color: '#334155',
    verticalAlign: 'middle',
    fontWeight: '500'
  },
  actionButtons: {
    display: 'flex',
    gap: '8px'
  },
  editButton: {
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
    minWidth: '70px'
  },
  viewButton: {
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
    minWidth: '70px'
  },
  deleteButtonSmall: {
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
    minWidth: '70px'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: '20px',
    backdropFilter: 'blur(4px)'
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    padding: '32px',
    borderRadius: '20px',
    width: '100%',
    maxWidth: '540px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 20px 25px rgba(0, 0, 0, 0.15)',
    border: '1px solid #e2e8f0'
  },
  modalHeader: {
    fontSize: '24px',
    fontWeight: '800',
    marginBottom: '24px',
    color: '#1e293b',
    paddingBottom: '16px',
    borderBottom: '2px solid #f1f5f9'
  },
  modalContent: {
    marginBottom: '28px'
  },
  inputGroup: {
    marginBottom: '20px'
  },
  inputLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px',
    letterSpacing: '0.3px'
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '10px',
    border: '2px solid #e2e8f0',
    fontSize: '15px',
    backgroundColor: '#f8fafc',
    transition: 'all 0.2s ease',
    outline: 'none',
    boxSizing: 'border-box'
  },
  modalButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '16px',
    paddingTop: '24px',
    borderTop: '2px solid #f1f5f9'
  },
  submitButton: {
    backgroundColor: '#4f46e5',
    color: '#ffffff',
    border: 'none',
    padding: '14px 28px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
    minWidth: '140px',
    boxShadow: '0 4px 6px rgba(79, 70, 229, 0.3)'
  },
  deleteButton: {
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    padding: '14px 28px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
    minWidth: '120px',
    boxShadow: '0 4px 6px rgba(239, 68, 68, 0.2)'
  },
  cancelButton: {
    backgroundColor: '#f8fafc',
    color: '#475569',
    border: '2px solid #e2e8f0',
    padding: '14px 28px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
    minWidth: '120px'
  },
  noDataText: {
    color: '#94a3b8',
    fontSize: '15px',
    textAlign: 'center',
    padding: '40px 20px',
    fontStyle: 'italic'
  }
};

// Add CSS animation for spinner
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  input:focus, select:focus {
    border-color: #4f46e5 !important;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1) !important;
  }
  
  button:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 8px rgba(0, 0, 0, 0.1) !important;
  }
  
  button:active {
    transform: translateY(0);
  }
  
  .stat-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 20px rgba(0, 0, 0, 0.08) !important;
  }
  
  .table-row:hover {
    background-color: #f8fafc;
  }
`;
document.head.appendChild(styleSheet);