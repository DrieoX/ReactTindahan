import React, { useEffect, useState } from 'react'; 
import { db } from '../db';

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
    name: '', 
    sku: '', 
    unit_price: '', 
    base_unit: 'pcs',
    category_id: null,
    threshold: 5,
  });
  const [editingItem, setEditingItem] = useState(null);
  const [currentStockItem, setCurrentStockItem] = useState(null);
  const [supplierDetails, setSupplierDetails] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    totalProducts: 0,
    lowStock: 0,
    expiringSoon: 0,
    inventoryValue: 0
  });
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  const [barcode, setBarcode] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);

  useEffect(() => {
    prepopulateCategories();
    fetchInventory();
    fetchSuppliers();
    fetchCategories();

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
  }, [barcode]);

  const prepopulateCategories = async () => {
    try {
      const count = await db.categories.count();
      if (count === 0) {
        const defaultCategories = [
          'Beverages',
          'Bakery',
          'Dairy & Eggs',
          'Meat & Poultry',
          'Seafood',
          'Fruits',
          'Vegetables',
          'Pantry & Dry Goods',
          'Snacks & Confectionery',
          'Frozen Foods',
          'Canned & Packaged Foods',
          'Condiments & Spices',
          'Baking Supplies',
          'Household & Cleaning',
          'Personal Care'
        ];
        await Promise.all(defaultCategories.map(name => db.categories.add({ name })));
        fetchCategories();
      }
    } catch (err) {
      console.error('Error prepopulating categories:', err);
    }
  };

  const fetchCategories = async () => {
    try {
      const list = await db.categories.toArray();
      setCategories(list);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchInventory = async () => {
    try {
      const products = await db.products.toArray();
      const inventoryRecords = await db.inventory.toArray();
      const supplierList = await db.suppliers.toArray();

      const items = products.map((p) => {
        const invRecord = inventoryRecords.find(inv => inv.product_id === p.product_id);
        const invQuantity = invRecord ? invRecord.quantity : 0;

        return {
          ...p,
          quantity: invQuantity,
          threshold: invRecord?.threshold || p.threshold || 5,
          suppliers: invRecord
            ? [ {
                supplier_id: invRecord.supplier_id,
                name: (supplierList.find(s => s.supplier_id === invRecord.supplier_id)?.name) || 'N/A',
                quantity: invRecord.quantity,
                expiration_date: invRecord.expiration_date || 'N/A',
                unit_cost: 0, 
              } ]
            : [],
        };
      });

      const totalProducts = items.length;
      const lowStock = items.filter(item => item.quantity <= (item.threshold || 5)).length;
      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      const expiringSoon = items.filter(item => {
        if (!item.expiration_date) return false;
        const expDate = new Date(item.expiration_date);
        return expDate <= nextWeek && expDate >= today;
      }).length;
      const inventoryValue = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);

      setStats({ totalProducts, lowStock, expiringSoon, inventoryValue });
      setInventory(items);
    } catch (err) {
      console.error('Error fetching inventory:', err);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const list = await db.suppliers.toArray();
      setSuppliers(list);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
    }
  };

  // --- Product handlers ---
  const handleAddItem = async () => {
    if (!newItem.name || !newItem.unit_price || !newItem.base_unit)
      return alert('Please fill out all required fields.');

    try {
      const existing = await db.products.where('sku').equals(newItem.sku).first();
      if (existing) return alert('A product with this SKU already exists.');

      const productId = await db.products.add({
        sku: newItem.sku || null,
        name: newItem.name,
        unit_price: parseFloat(newItem.unit_price),
        base_unit: newItem.base_unit,
        category_id: newItem.category_id || null,
      });

      await db.inventory.add({
        product_id: productId,
        supplier_id: null,
        quantity: 0,
        threshold: parseInt(newItem.threshold) || 5,
      });

      setShowAddModal(false);
      setNewItem({ 
        name: '', 
        sku: '', 
        unit_price: '', 
        base_unit: 'pcs',
        category_id: null,
        threshold: 5,
      });
      fetchInventory();
    } catch (err) {
      console.error('Error adding product:', err);
    }
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    try {
      await db.products.update(editingItem.product_id, {
        sku: editingItem.sku,
        name: editingItem.name,
        unit_price: parseFloat(editingItem.unit_price),
        base_unit: editingItem.base_unit,
        category_id: editingItem.category_id || null,
      });

      await db.inventory.where({ product_id: editingItem.product_id }).modify(inv => {
        inv.threshold = parseInt(editingItem.threshold) || 5;
      });

      setShowEditModal(false);
      setEditingItem(null);
      fetchInventory();
    } catch (err) {
      console.error('Error saving product edit:', err);
    }
  };

  const handleDeleteItem = async () => {
    if (!editingItem) return;
    if (!window.confirm(`Are you sure you want to delete "${editingItem.name}"?`)) return;

    try {
      await db.products.delete(editingItem.product_id);
      await db.inventory.where('product_id').equals(editingItem.product_id).delete();
      await db.resupplied_items.where('product_id').equals(editingItem.product_id).delete();
      await db.stock_card.where('product_id').equals(editingItem.product_id).delete();
      await db.sale_items.where('product_id').equals(editingItem.product_id).delete();

      setShowEditModal(false);
      setEditingItem(null);
      fetchInventory();
    } catch (err) {
      console.error('Error deleting product:', err);
    }
  };

  const handleSupplierDetails = async (item) => {
    try {
      // Set the current item for stock card display
      setCurrentStockItem(item);
      
      // Fetch all stock card records for this product
      const stockRecords = await db.stock_card
        .where('product_id')
        .equals(item.product_id)
        .sortBy('transaction_date');

      // If no records found, show empty state
      if (stockRecords.length === 0) {
        setSupplierDetails([]);
        setShowSupplierModal(true);
        return;
      }

      // Fetch all supplier info
      const supplierInfo = await Promise.all(stockRecords.map(async (record) => {
        const supplier = record.supplier_id 
          ? await db.suppliers.get(record.supplier_id) 
          : null;
        
        // Determine if it's stock-in or stock-out
        const isStockIn = record.quantity > 0;
        const isStockOut = record.quantity < 0;
        
        return {
          name: supplier?.name || 'N/A',
          transaction_date: record.transaction_date || record.resupply_date || 'N/A',
          quantity: record.quantity || 0, // Keep original signed quantity
          stock_in: isStockIn ? record.quantity : 0,
          stock_out: isStockOut ? Math.abs(record.quantity) : 0,
          unit: record.unit_type || item.base_unit || 'pcs',
          unit_cost: record.unit_cost || 0,
          unit_price: record.unit_price || item.unit_price || 0,
          expiration_date: record.expiration_date || 'N/A',
          transaction_type: record.transaction_type || (isStockIn ? 'RESUPPLY' : 'SALE'),
          running_balance: record.running_balance || 0,
          supplier_id: record.supplier_id,
        };
      }));

      setSupplierDetails(supplierInfo);
      setShowSupplierModal(true);
    } catch (err) {
      console.error('Error fetching supplier details:', err);
      alert('Error loading stock card data');
    }
  };

  // --- Category handlers ---
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return alert("Enter a category name.");
    try {
      await db.categories.add({ name: newCategoryName.trim() });
      setNewCategoryName('');
      setShowCategoryModal(false);
      fetchCategories();
    } catch (err) {
      console.error("Error adding category:", err);
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
      await db.categories.update(editingCategory.category_id, { name: newCategoryName.trim() });
      setEditingCategory(null);
      setNewCategoryName('');
      setShowCategoryModal(false);
      fetchCategories();
    } catch (err) {
      console.error("Error editing category:", err);
    }
  };

  const handleDeleteCategory = async (category) => {
    if (!window.confirm(`Are you sure you want to delete category "${category.name}"?`)) return;
    try {
      // Check if any products use this category
      const productsWithCategory = await db.products
        .where('category_id')
        .equals(category.category_id)
        .toArray();
      
      if (productsWithCategory.length > 0) {
        alert(`Cannot delete category. ${productsWithCategory.length} product(s) use this category. Update those products first.`);
        return;
      }
      
      await db.categories.delete(category.category_id);
      fetchCategories();
    } catch (err) {
      console.error("Error deleting category:", err);
    }
  };

  // Fixed search logic to include product names
  const filteredInventory = inventory.filter((item) => {
    if (showLowStockOnly && item.quantity > (item.threshold || 5)) return false;
    
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    
    // Search in product name
    if (item.name?.toLowerCase().includes(q)) return true;
    
    // Search in SKU/barcode
    if (item.sku?.toLowerCase().includes(q)) return true;
    
    // Search in category name
    const categoryName = categories.find(c => c.category_id === item.category_id)?.name?.toLowerCase();
    if (categoryName?.includes(q)) return true;
    
    // Search in supplier names
    if (item.suppliers?.some(s => s.name?.toLowerCase().includes(q))) return true;
    
    return false;
  });

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Inventory Management</h1>
          <p style={styles.pageSubtitle}>Manage your products, track stock levels, and monitor expiry dates</p>
        </div>
        <div style={styles.headerActions}>
          <div style={styles.searchContainer}>
            <input
              style={styles.searchInput}
              placeholder="Search products, barcode, categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button 
                style={styles.clearSearchButton}
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={styles.statsContainer}>
        <div style={styles.statCard}>
          <h3 style={styles.statTitle}>Total Products</h3>
          <p style={styles.statValue}>{stats.totalProducts}</p>
        </div>
        <div
          style={{...styles.statCard, ...(showLowStockOnly ? styles.lowStockCardActive : styles.lowStockCard)}}
          onClick={() => setShowLowStockOnly(!showLowStockOnly)}
        >
          <h3 style={styles.statTitle}>Low Stock Items</h3>
          <p style={styles.lowStockValue}>{stats.lowStock}</p>
          <p style={styles.lowStockLabel}>
            {showLowStockOnly ? 'Showing Low Stock' : 'Click to View'}
          </p>
        </div>
        <div style={{...styles.statCard, ...styles.expiringCard}}>
          <h3 style={styles.statTitle}>Expiring Soon</h3>
          <p style={styles.expiringValue}>{stats.expiringSoon}</p>
        </div>
        <div style={{...styles.statCard, ...styles.valueCard}}>
          <h3 style={styles.statTitle}>Inventory Value</h3>
          <p style={styles.valueAmount}>₱{stats.inventoryValue.toFixed(2)}</p>
        </div>
      </div>

      {/* Products */}
      <div style={styles.productsSection}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Products</h2>
            <p style={styles.sectionSubtitle}>
              {filteredInventory.length} of {inventory.length} products
              {searchQuery && ` • Searching: "${searchQuery}"`}
              {showLowStockOnly && ' • Showing low stock only'}
            </p>
          </div>
          <div style={styles.sectionActions}>
            <button style={styles.primaryButton} onClick={() => setShowAddModal(true)}>
              Add New Item
            </button>
            <button style={styles.secondaryButton} onClick={() => { setEditingCategory(null); setNewCategoryName(''); setShowCategoryModal(true); }}>
              Add Category
            </button>
          </div>
        </div>

        <div style={styles.tableContainer}>
          {filteredInventory.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyStateIcon}>📦</div>
              <h3 style={styles.emptyStateTitle}>No products found</h3>
              <p style={styles.emptyStateText}>
                {searchQuery 
                  ? `No products matching "${searchQuery}"`
                  : showLowStockOnly 
                    ? 'No low stock products'
                    : 'Add your first product to get started'}
              </p>
              {searchQuery && (
                <button 
                  style={styles.clearFilterButton}
                  onClick={() => {
                    setSearchQuery('');
                    setShowLowStockOnly(false);
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Mobile/Tablet View */}
              <div style={styles.mobileView}>
                {filteredInventory.map((item) => (
                  <div key={item.product_id} style={styles.mobileCard}>
                    <div style={styles.mobileCardHeader}>
                      <div>
                        <h4 style={styles.mobileProductName}>{item.name}</h4>
                        <p style={styles.mobileProductSku}>
                          SKU: {item.sku || 'N/A'} • {categories.find(c => c.category_id === item.category_id)?.name || 'Uncategorized'}
                        </p>
                      </div>
                      <div style={styles.mobilePrice}>
                        ₱{item.unit_price || '0.00'}
                      </div>
                    </div>
                    
                    <div style={styles.mobileCardDetails}>
                      <div style={styles.mobileDetail}>
                        <span style={styles.mobileDetailLabel}>Unit:</span>
                        <span style={styles.mobileDetailValue}>{item.base_unit || 'pcs'}</span>
                      </div>
                      <div style={styles.mobileDetail}>
                        <span style={styles.mobileDetailLabel}>Stock:</span>
                        <span style={{
                          ...styles.mobileDetailValue,
                          color: item.quantity <= (item.threshold || 5) ? '#dc2626' : '#16a34a',
                          fontWeight: '600'
                        }}>
                          {item.quantity || 0}
                        </span>
                      </div>
                      <div style={styles.mobileDetail}>
                        <span style={styles.mobileDetailLabel}>Threshold:</span>
                        <span style={styles.mobileDetailValue}>{item.threshold || 5}</span>
                      </div>
                    </div>
                    
                    <div style={styles.mobileCardActions}>
                      <button style={styles.mobileEditButton} onClick={() => handleEditItem(item)}>
                        Edit
                      </button>
                      <button style={styles.mobileViewButton} onClick={() => handleSupplierDetails(item)}>
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop View */}
              <div style={styles.desktopView}>
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
                    {filteredInventory.map((item) => (
                      <tr key={item.product_id} style={{
                        ...styles.tableRow,
                        backgroundColor: item.quantity <= (item.threshold || 5) ? '#fef2f2' : 'transparent'
                      }}>
                        <td style={styles.tableCell}>
                          <div style={styles.productNameCell}>
                            <span style={styles.productName}>{item.name}</span>
                            {item.quantity <= (item.threshold || 5) && (
                              <span style={styles.lowStockBadge}>Low Stock</span>
                            )}
                          </div>
                        </td>
                        <td style={styles.tableCell}>
                          {categories.find(c => c.category_id === item.category_id)?.name || 'N/A'}
                        </td>
                        <td style={styles.tableCell}>{item.sku || 'N/A'}</td>
                        <td style={styles.tableCell}>{item.base_unit || 'pcs'}</td>
                        <td style={styles.tableCell}>₱{item.unit_price || '0.00'}</td>
                        <td style={{
                          ...styles.tableCell,
                          color: item.quantity <= (item.threshold || 5) ? '#dc2626' : '#16a34a',
                          fontWeight: '600'
                        }}>
                          {item.quantity || 0}
                        </td>
                        <td style={styles.tableCell}>{item.threshold || 5}</td>
                        <td style={styles.tableCell}>
                          <div style={styles.actionButtons}>
                            <button style={styles.editButton} onClick={() => handleEditItem(item)}>Edit</button>
                            <button style={styles.viewButton} onClick={() => handleSupplierDetails(item)}>View</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
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
          onDelete={showEditModal ? handleDeleteItem : null}
          item={showAddModal ? newItem : editingItem}
          setItem={showAddModal ? setNewItem : setEditingItem}
          categories={categories}
          title={showAddModal ? 'Add New Product' : 'Edit Product'}
          isEdit={showEditModal}
        />
      )}

      {showSupplierModal && (
        <SupplierModal 
          suppliers={supplierDetails} 
          inventory={currentStockItem} 
          onClose={() => {
            setShowSupplierModal(false);
            setCurrentStockItem(null);
            setSupplierDetails([]);
          }} 
        />
      )}

      {showCategoryModal && (
        <CategoryModal 
          visible={showCategoryModal} 
          onClose={() => {
            setShowCategoryModal(false);
            setEditingCategory(null);
            setNewCategoryName('');
          }} 
          newCategoryName={newCategoryName}
          setNewCategoryName={setNewCategoryName}
          onSubmit={editingCategory ? handleSaveCategory : handleAddCategory}
          editingCategory={editingCategory}
          onDelete={editingCategory ? handleDeleteCategory : null}
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
            <label style={styles.inputLabel}>SKU *</label>
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
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Category</label>
            <select 
              style={styles.input}
              value={item?.category_id || ''}
              onChange={(e) => setItem({ ...item, category_id: parseInt(e.target.value) })}
            >
              <option value="">Select Category</option>
              {categories.map(c => (
                <option key={c.category_id} value={c.category_id}>{c.name}</option>
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
              min="0"
              onChange={(e) => setItem({ ...item, unit_price: e.target.value })}
              style={styles.input}
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Low Stock Threshold *</label>
            <input
              placeholder="5"
              value={item?.threshold?.toString() || ''}
              type="number"
              min="1"
              onChange={(e) => setItem({ ...item, threshold: e.target.value })}
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

function SupplierModal({ suppliers, inventory, onClose }) {
  const currentStock = inventory?.quantity ?? 0;
  const productName = inventory?.name || 'Product';
  const productSku = inventory?.sku || 'N/A';

  // Calculate totals from raw data
  const totalStockIn = suppliers.reduce((sum, item) => sum + (item.stock_in > 0 ? item.stock_in : 0), 0);
  const totalStockOut = suppliers.reduce((sum, item) => sum + (item.stock_out > 0 ? item.stock_out : 0), 0);
  const totalCost = suppliers.reduce((sum, item) => sum + (item.unit_cost || 0) * (item.stock_in > 0 ? item.stock_in : 0), 0);
  const totalValue = suppliers.reduce((sum, item) => sum + (item.unit_price || 0) * (item.stock_in > 0 ? item.stock_in : 0), 0);

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContainer}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h2 style={styles.modalHeader}>Stock Card - {productName}</h2>
            <p style={{ color: '#64748b', fontSize: '14px' }}>SKU: {productSku}</p>
          </div>
          <div style={{ 
            backgroundColor: '#f8fafc', 
            padding: '12px 16px', 
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontWeight: 'bold', color: '#1e293b', fontSize: '16px' }}>
              Current Stock: {currentStock}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              (Total In: {totalStockIn} - Total Out: {totalStockOut})
            </div>
          </div>
        </div>

        <div style={styles.modalContent}>
          {suppliers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
              <p style={{ fontSize: '16px', color: '#64748b' }}>No stock transactions found for this product.</p>
              <p style={{ fontSize: '14px', color: '#94a3b8' }}>Stock card records will appear after resupply or sales.</p>
            </div>
          ) : (
            <>
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeader}>
                      <th style={styles.tableCell}>Date/Time</th>
                      <th style={styles.tableCell}>Transaction</th>
                      <th style={styles.tableCell}>Supplier</th>
                      <th style={styles.tableCell}>Stock-in</th>
                      <th style={styles.tableCell}>Stock-out</th>
                      <th style={styles.tableCell}>Unit Cost</th>
                      <th style={styles.tableCell}>Unit Price</th>
                      <th style={styles.tableCell}>Expiry Date</th>
                      <th style={styles.tableCell}>Running Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((s, idx) => (
                      <tr key={idx} style={{
                        ...styles.tableRow,
                        backgroundColor: s.transaction_type === 'RESUPPLY' ? '#f0fdf4' : 
                                        s.transaction_type === 'SALE' ? '#fef2f2' : 'transparent'
                      }}>
                        <td style={styles.tableCell}>{s.transaction_date}</td>
                        <td style={styles.tableCell}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '500',
                            backgroundColor: s.transaction_type === 'RESUPPLY' ? '#10b981' : 
                                          s.transaction_type === 'SALE' ? '#ef4444' : '#6b7280',
                            color: 'white'
                          }}>
                            {s.transaction_type}
                          </span>
                        </td>
                        <td style={styles.tableCell}>{s.name || '-'}</td>
                        <td style={styles.tableCell}>
                          {s.stock_in > 0 ? (
                            <span style={{ color: '#10b981', fontWeight: '600' }}>+{s.stock_in}</span>
                          ) : '-'}
                        </td>
                        <td style={styles.tableCell}>
                          {s.stock_out > 0 ? (
                            <span style={{ color: '#ef4444', fontWeight: '600' }}>-{s.stock_out}</span>
                          ) : '-'}
                        </td>
                        <td style={styles.tableCell}>
                          {s.unit_cost > 0 ? `₱${s.unit_cost.toFixed(2)}` : '-'}
                        </td>
                        <td style={styles.tableCell}>
                          {s.unit_price > 0 ? `₱${s.unit_price.toFixed(2)}` : '-'}
                        </td>
                        <td style={styles.tableCell}>
                          {s.expiration_date && s.expiration_date !== 'N/A' ? s.expiration_date : '-'}
                        </td>
                        <td style={styles.tableCell}>
                          <span style={{
                            fontWeight: '600',
                            color: s.running_balance > 0 ? '#1e293b' : '#ef4444'
                          }}>
                            {s.running_balance}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ 
                      backgroundColor: '#f8fafc', 
                      borderTop: '2px solid #e2e8f0' 
                    }}>
                      <td colSpan="3" style={{ 
                        ...styles.tableCell, 
                        fontWeight: '600',
                        textAlign: 'right'
                      }}>
                        Totals:
                      </td>
                      <td style={{ 
                        ...styles.tableCell, 
                        color: '#10b981',
                        fontWeight: '600'
                      }}>
                        +{totalStockIn}
                      </td>
                      <td style={{ 
                        ...styles.tableCell, 
                        color: '#ef4444',
                        fontWeight: '600'
                      }}>
                        -{totalStockOut}
                      </td>
                      <td style={{ 
                        ...styles.tableCell, 
                        fontWeight: '600'
                      }}>
                        ₱{totalCost.toFixed(2)}
                      </td>
                      <td style={{ 
                        ...styles.tableCell, 
                        fontWeight: '600'
                      }}>
                        ₱{totalValue.toFixed(2)}
                      </td>
                      <td colSpan="2" style={{ 
                        ...styles.tableCell, 
                        fontWeight: '600',
                        color: '#1e293b'
                      }}>
                        Net Stock: {currentStock}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              
              {/* Summary Stats */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                marginTop: '20px',
                padding: '16px',
                backgroundColor: '#f8fafc',
                borderRadius: '8px'
              }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Total Stock-in</div>
                  <div style={{ fontSize: '18px', fontWeight: '600', color: '#10b981' }}>+{totalStockIn}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Total Stock-out</div>
                  <div style={{ fontSize: '18px', fontWeight: '600', color: '#ef4444' }}>-{totalStockOut}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Total Cost</div>
                  <div style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>₱{totalCost.toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Total Value</div>
                  <div style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>₱{totalValue.toFixed(2)}</div>
                </div>
              </div>
            </>
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
                    <tr key={c.category_id} style={styles.tableRow}>
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
            <button style={styles.deleteButton} onClick={() => onDelete(editingCategory)}>Delete</button>
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
    padding: '16px', 
    backgroundColor: '#f8fafc', 
    minHeight: '100vh',
    maxWidth: '1400px',
    margin: '0 auto',
    '@media (max-width: 768px)': {
      padding: '12px',
    },
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '16px',
    '@media (max-width: 768px)': {
      flexDirection: 'column',
      gap: '12px',
    },
  },
  pageTitle: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: '8px',
    '@media (max-width: 768px)': {
      fontSize: '24px',
    },
  },
  pageSubtitle: {
    fontSize: '16px',
    color: '#64748b',
    '@media (max-width: 768px)': {
      fontSize: '14px',
    },
  },
  headerActions: {
    display: 'flex',
    gap: '12px',
    '@media (max-width: 768px)': {
      width: '100%',
    },
  },
  searchContainer: {
    position: 'relative',
    width: '100%',
    maxWidth: '400px',
    '@media (max-width: 768px)': {
      maxWidth: '100%',
    },
  },
  searchInput: {
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    padding: '10px 16px',
    paddingRight: '40px',
    backgroundColor: '#fff',
    width: '100%',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  clearSearchButton: {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px',
  },
  statsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
    '@media (max-width: 640px)': {
      gridTemplateColumns: 'repeat(2, 1fr)',
    },
    '@media (max-width: 480px)': {
      gridTemplateColumns: '1fr',
    },
  },
  statCard: {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    '@media (max-width: 768px)': {
      padding: '16px',
    },
  },
  lowStockCard: {
    backgroundColor: '#fffbeb',
    borderColor: '#f59e0b',
    cursor: 'pointer',
  },
  lowStockCardActive: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
    cursor: 'pointer',
  },
  expiringCard: {
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444',
  },
  valueCard: {
    backgroundColor: '#f0f9ff',
    borderColor: '#0ea5e9',
  },
  statTitle: {
    fontSize: '14px',
    color: '#64748b',
    marginBottom: '8px',
    fontWeight: '500',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: '4px',
  },
  lowStockValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#b45309',
    marginBottom: '4px',
  },
  lowStockLabel: {
    fontSize: '0.9rem',
    color: '#92400e',
  },
  expiringValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#dc2626',
    marginBottom: '4px',
  },
  valueAmount: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#0369a1',
    marginBottom: '4px',
  },
  productsSection: {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    '@media (max-width: 768px)': {
      padding: '16px',
    },
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '12px',
    '@media (max-width: 768px)': {
      flexDirection: 'column',
      alignItems: 'stretch',
    },
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '4px',
  },
  sectionSubtitle: {
    fontSize: '14px',
    color: '#64748b',
  },
  sectionActions: {
    display: 'flex',
    gap: '8px',
    '@media (max-width: 768px)': {
      width: '100%',
    },
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    '@media (max-width: 768px)': {
      flex: 1,
    },
  },
  secondaryButton: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    border: '1px solid #e2e8f0',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    '@media (max-width: 768px)': {
      flex: 1,
    },
  },
  tableContainer: {
    overflowX: 'auto',
  },
  desktopView: {
    display: 'block',
    '@media (max-width: 1024px)': {
      display: 'none',
    },
  },
  mobileView: {
    display: 'none',
    '@media (max-width: 1024px)': {
      display: 'block',
    },
  },
  mobileCard: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '12px',
  },
  mobileCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  mobileProductName: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '4px',
  },
  mobileProductSku: {
    fontSize: '12px',
    color: '#64748b',
  },
  mobilePrice: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#4f46e5',
  },
  mobileCardDetails: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    marginBottom: '12px',
    '@media (max-width: 480px)': {
      gridTemplateColumns: 'repeat(2, 1fr)',
    },
  },
  mobileDetail: {
    display: 'flex',
    flexDirection: 'column',
  },
  mobileDetailLabel: {
    fontSize: '11px',
    color: '#64748b',
    marginBottom: '2px',
  },
  mobileDetailValue: {
    fontSize: '14px',
    color: '#1e293b',
    fontWeight: '500',
  },
  mobileCardActions: {
    display: 'flex',
    gap: '8px',
  },
  mobileEditButton: {
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    flex: 1,
  },
  mobileViewButton: {
    backgroundColor: '#10b981',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    flex: 1,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeader: {
    backgroundColor: '#f8fafc',
    borderBottom: '2px solid #e2e8f0',
  },
  tableRow: {
    borderBottom: '1px solid #e2e8f0',
    '&:hover': {
      backgroundColor: '#f8fafc',
    },
  },
  tableCell: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '14px',
    '@media (max-width: 1200px)': {
      padding: '10px 12px',
    },
  },
  productNameCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  productName: {
    fontWeight: '500',
    color: '#1e293b',
  },
  lowStockBadge: {
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '10px',
    display: 'inline-block',
  },
  actionButtons: {
    display: 'flex',
    gap: '8px',
  },
  editButton: {
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  viewButton: {
    backgroundColor: '#10b981',
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 20px',
  },
  emptyStateIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  emptyStateTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '8px',
  },
  emptyStateText: {
    fontSize: '14px',
    color: '#64748b',
    marginBottom: '16px',
  },
  clearFilterButton: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    border: '1px solid #e2e8f0',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modalContainer: {
    backgroundColor: '#fff',
    padding: '24px',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
    '@media (max-width: 768px)': {
      padding: '20px',
      maxWidth: '95%',
    },
  },
  modalHeader: {
    fontSize: '20px',
    fontWeight: 'bold',
    marginBottom: '20px',
    color: '#1e293b',
  },
  modalContent: {
    marginBottom: '20px',
  },
  inputGroup: {
    marginBottom: '16px',
  },
  inputLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  modalButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    '@media (max-width: 480px)': {
      flexDirection: 'column',
    },
  },
  submitButton: {
    backgroundColor: '#4f46e5',
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    '@media (max-width: 480px)': {
      width: '100%',
    },
  },
  deleteButton: {
    backgroundColor: '#ef4444',
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    '@media (max-width: 480px)': {
      width: '100%',
    },
  },
  cancelButton: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    border: '1px solid #e2e8f0',
    padding: '10px 20px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    '@media (max-width: 480px)': {
      width: '100%',
    },
  },
  noDataText: {
    color: '#94a3b8',
    fontSize: '14px',
    textAlign: 'center',
    padding: '20px',
  },
};