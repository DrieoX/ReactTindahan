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
  const [showCategoryModal, setShowCategoryModal] = useState(false); // new
  const [newItem, setNewItem] = useState({ 
    name: '', 
    sku: '', 
    unit_price: '', 
    base_unit: 'pcs',
    category_id: null,
    threshold: 5,
  });
  const [editingItem, setEditingItem] = useState(null);
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
  const [newCategoryName, setNewCategoryName] = useState(''); // new
  const [editingCategory, setEditingCategory] = useState(null); // new

  useEffect(() => {
    prepopulateCategories(); // Add basic categories if empty
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

  // --- Prepopulate basic grocery categories ---
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

      setShowEditModal(false);
      setEditingItem(null);
      fetchInventory();
    } catch (err) {
      console.error('Error deleting product:', err);
    }
  };

  const handleSupplierDetails = async (item) => {
    try {
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
    } catch (err) {
      console.error('Error fetching supplier details:', err);
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
      await db.categories.delete(category.category_id);
      fetchCategories();
    } catch (err) {
      console.error("Error deleting category:", err);
    }
  };

  const filteredInventory = inventory.filter((item) => {
    if (showLowStockOnly) return item.quantity <= (item.threshold || 5);
    const q = searchQuery.toLowerCase();
    if (item.name.toLowerCase().includes(q)) return true;
    if (item.sku && item.sku.toLowerCase().includes(q)) return true;
    if (item.suppliers.some((s) => s.name.toLowerCase().includes(q))) return true;
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
              {filteredInventory.map((item) => (
                <tr key={item.product_id} style={styles.tableRow}>
                  <td style={styles.tableCell}>{item.name}</td>
                  <td style={styles.tableCell}>{categories.find(c => c.category_id === item.category_id)?.name || 'N/A'}</td>
                  <td style={styles.tableCell}>{item.sku || 'N/A'}</td>
                  <td style={styles.tableCell}>{item.base_unit || 'pcs'}</td>
                  <td style={styles.tableCell}>₱{item.unit_price || '0.00'}</td>
                  <td style={styles.tableCell}>{item.quantity || 0}</td>
                  <td style={styles.tableCell}>{item.threshold || 5}</td>
                  <td style={styles.tableCell}>
                    <button style={styles.editButton} onClick={() => handleEditItem(item)}>Edit</button>
                    <button style={styles.viewButton} onClick={() => handleSupplierDetails(item)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {(showAddModal || showEditModal) && (
        <ProductModal
          visible={showAddModal || showEditModal}
          onClose={() => {
            setShowAddModal(false);
            setShowEditModal(false);
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
          onDelete={editingCategory ? handleDeleteCategory : null}
          categories={categories} // pass categories for modal table
          handleEditCategory={handleEditCategory} // edit from modal
        />
      )}
    </div>
  );
}

function ProductModal({ visible, onClose, onSubmit, onDelete, item, setItem, title, isEdit, categories }) {
  if (!visible) return null;

  const getUnitOptions = (base_unit) => {
    switch(base_unit) {
      case 'pcs':
        return ['pcs', 'dozen', 'boxes', 'packs'];
      case 'grams':
      case 'kilos':
        return ['grams', 'kilos'];
      case 'ml':
      case 'liters':
        return ['ml', 'liters'];
      default:
        return [base_unit];
    }
  };

  const unitOptions = getUnitOptions(item?.base_unit || 'pcs');

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
              onChange={(e) => setItem({ ...item, unit_price: e.target.value })}
              style={styles.input}
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Threshold *</label>
            <input
              placeholder="5"
              value={item?.threshold?.toString() || ''}
              type="number"
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

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContainer}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={styles.modalHeader}>Stock Card</h2>
          <div style={{ fontWeight: 'bold', color: '#1e293b', fontSize: '16px' }}>
            Current Stock: {currentStock}
          </div>
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
                    <th style={styles.tableCell}>Stock-out</th>
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
                      <td style={styles.tableCell}>{s.stockout || 0}</td>
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
    padding: '20px', 
    backgroundColor: '#f8fafc', 
    minHeight: '100vh',
    maxWidth: '1400px',
    margin: '0 auto'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '16px'
  },
  pageTitle: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: '8px',
  },
  pageSubtitle: {
    fontSize: '16px',
    color: '#64748b',
  },
  headerActions: {
    display: 'flex',
    gap: '12px',
  },
  searchInput: {
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    padding: '10px 16px',
    backgroundColor: '#fff',
    width: '300px',
    fontSize: '14px',
  },
  statsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  statCard: {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
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
  statChange: {
    fontSize: '12px',
    color: '#64748b',
  },
  productsSection: {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '12px'
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b',
  },
  sectionActions: {
    display: 'flex',
    gap: '8px',
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
  },
  tableContainer: {
    overflowX: 'auto',
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
  },
  detailsRow: {
    backgroundColor: '#f8fafc',
  },
  tableCell: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '14px',
  },
  detailsCell: {
    padding: '8px 16px',
  },
  productInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  productName: {
    fontWeight: '500',
    color: '#1e293b',
  },
  productId: {
    fontSize: '12px',
    color: '#64748b',
  },
  productDetails: {
    display: 'flex',
    gap: '16px',
    fontSize: '12px',
    color: '#64748b',
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
  },
  modalButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
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
  },
  supplierDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  supplierDetailCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '16px',
  },
  supplierDetailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
  },
  detailLabel: {
    fontSize: '12px',
    color: '#64748b',
    marginBottom: '4px',
  },
  detailValue: {
    fontSize: '14px',
    color: '#1e293b',
    fontWeight: '500',
  },
  noDataText: {
    color: '#94a3b8',
    fontSize: '14px',
    textAlign: 'center',
    padding: '20px',
  },
};
