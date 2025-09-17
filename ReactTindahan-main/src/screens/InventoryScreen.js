import React, { useEffect, useState } from 'react'; 
import { db } from '../db';

export default function InventoryScreen({ userMode }) {
  const mode = userMode || 'client';

  const [inventory, setInventory] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [newItem, setNewItem] = useState({ 
    name: '', 
    sku: '', 
    description: '', 
    unit_price: '', 
    unit: 'pieces',
    expiration_date: ''
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

  useEffect(() => {
    fetchInventory();
    fetchSuppliers();
  }, []);

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
          suppliers: invRecord
            ? [{
                supplier_id: invRecord.supplier_id,
                name: (supplierList.find(s => s.supplier_id === invRecord.supplier_id)?.name) || 'N/A',
                quantity: invRecord.quantity,
                expiration_date: invRecord.expiration_date || 'N/A',
                threshold: invRecord.threshold || 0,
                unit_cost: 0, // optional
              }]
            : [],
        };
      });

      // Stats
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

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.unit_price)
      return alert('Please fill out all required fields.');
    try {
      const existing = await db.products.where('sku').equals(newItem.sku).first();
      if (existing) return alert('A product with this SKU already exists.');

      await db.products.add({
        sku: newItem.sku || null,
        name: newItem.name,
        description: newItem.description,
        unit_price: parseFloat(newItem.unit_price),
        unit: newItem.unit,
        expiration_date: newItem.expiration_date
      });

      setShowAddModal(false);
      setNewItem({ 
        name: '', 
        sku: '', 
        description: '', 
        unit_price: '', 
        unit: 'pieces',
        expiration_date: ''
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
        description: editingItem.description,
        unit_price: parseFloat(editingItem.unit_price),
        unit: editingItem.unit,
        expiration_date: editingItem.expiration_date
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

  const handleSupplierDetails = (item) => {
    setSupplierDetails(item.suppliers);
    setShowSupplierModal(true);
  };

  // search by supplier, name, or sku
  const filteredInventory = inventory.filter((item) => {
    const q = searchQuery.toLowerCase();
    if (item.name.toLowerCase().includes(q)) return true;
    if (item.sku && item.sku.toLowerCase().includes(q)) return true;
    if (item.suppliers.some((s) => s.name.toLowerCase().includes(q))) return true;
    return false;
  });

  return (
    <div style={styles.container}>
      {/* Header Section */}
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

      {/* Stats Cards */}
      <div style={styles.statsContainer}>
        <div style={styles.statCard}>
          <h3 style={styles.statTitle}>Total Products</h3>
          <p style={styles.statValue}>{stats.totalProducts}</p>
        </div>
        <div style={{...styles.statCard, backgroundColor: '#fffbeb', borderColor: '#f59e0b'}}>
          <h3 style={styles.statTitle}>Low Stock Items</h3>
          <p style={{...styles.statValue, color: '#b45309'}}>{stats.lowStock}</p>
          <p style={styles.statChange}>{stats.lowStock > 0 ? `${stats.lowStock} items need to be restocked` : 'No low stock items'}</p>
        </div>
        <div style={{...styles.statCard, backgroundColor: '#fef2f2', borderColor: '#ef4444'}}>
          <h3 style={styles.statTitle}>Expiring Soon</h3>
          <p style={{...styles.statValue, color: '#dc2626'}}>{stats.expiringSoon}</p>
          <p style={styles.statChange}>{stats.expiringSoon > 0 ? `${stats.expiringSoon} items expiring within 7 days` : 'No items expiring soon'}</p>
        </div>
        <div style={{...styles.statCard, backgroundColor: '#f0f9ff', borderColor: '#0ea5e9'}}>
          <h3 style={styles.statTitle}>Inventory Value</h3>
          <p style={{...styles.statValue, color: '#0369a1'}}>₱{stats.inventoryValue.toFixed(2)}</p>
        </div>
      </div>

      {/* Products Section */}
      <div style={styles.productsSection}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Products</h2>
          <div style={styles.sectionActions}>
            <button style={styles.primaryButton} onClick={() => setShowAddModal(true)}>
              Add New Item
            </button>
          </div>
        </div>

        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.tableCell}>PRODUCT</th>
                <th style={styles.tableCell}>SKU</th>
                <th style={styles.tableCell}>UNIT</th>
                <th style={styles.tableCell}>PRICE</th>
                <th style={styles.tableCell}>STOCK</th>
                <th style={styles.tableCell}>SUPPLIERS</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map((item) => (
                <React.Fragment key={item.product_id}>
                  <tr style={styles.tableRow}>
                    <td style={styles.tableCell}>
                      <div style={styles.productInfo}>
                        <div style={styles.productName}>{item.name}</div>
                      </div>
                    </td>
                    <td style={styles.tableCell}>{item.sku || 'N/A'}</td>
                    <td style={styles.tableCell}>{item.unit || 'pieces'}</td>
                    <td style={styles.tableCell}>₱{item.unit_price || '0.00'}</td>
                    <td style={styles.tableCell}>{item.quantity || 0}</td>
                    <td style={styles.tableCell}>
                      <div style={styles.actionButtons}>
                        <button 
                          style={styles.editButton} 
                          onClick={() => handleEditItem(item)}
                        >
                          Edit
                        </button>
                        <button 
                          style={styles.viewButton} 
                          onClick={() => handleSupplierDetails(item)}
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr style={styles.detailsRow}>
                    <td colSpan="6" style={styles.detailsCell}>
                      <div style={styles.productDetails}>
                        <span>Cost: ₱{(item.unit_price * 0.8).toFixed(2)}</span>
                        <span>Reorder at: {item.threshold || 5}</span>
                        {item.expiration_date && (
                          <span>Expires: {new Date(item.expiration_date).toLocaleDateString()}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
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
          title={showAddModal ? 'Add New Product' : 'Edit Product'}
          isEdit={showEditModal}
        />
      )}

      {showSupplierModal && (
        <SupplierModal suppliers={supplierDetails} onClose={() => setShowSupplierModal(false)} />
      )}
    </div>
  );
}

function ProductModal({ visible, onClose, onSubmit, onDelete, item, setItem, title, isEdit }) {
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
            <label style={styles.inputLabel}>Description</label>
            <textarea
              placeholder="Enter product description"
              value={item?.description || ''}
              onChange={(e) => setItem({ ...item, description: e.target.value })}
              style={{...styles.input, minHeight: '80px'}}
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Unit *</label>
            <select 
              style={styles.input}
              value={item?.unit || 'pieces'}
              onChange={(e) => setItem({ ...item, unit: e.target.value })}
            >
              <option value="pieces">Pieces</option>
              <option value="dozen">Dozen</option>
              <option value="kilos">Kilos</option>
              <option value="grams">Grams</option>
              <option value="packs">Packs</option>
              <option value="boxes">Boxes</option>
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
            <label style={styles.inputLabel}>Expiration Date</label>
            <input
              type="date"
              value={item?.expiration_date || ''}
              onChange={(e) => setItem({ ...item, expiration_date: e.target.value })}
              style={styles.input}
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Category</label>
            <select 
              style={styles.input}
              value={item?.category || ''}
              onChange={(e) => setItem({ ...item, category: e.target.value })}
            >
              <option value="">Select category</option>
              <option value="Grains">Grains</option>
              <option value="Dairy">Dairy</option>
              <option value="Bakery">Bakery</option>
              <option value="Canned Goods">Canned Goods</option>
              <option value="Beverages">Beverages</option>
            </select>
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
        <h2 style={styles.modalHeader}>Supplier Details</h2>
        <div style={styles.modalContent}>
          {suppliers.length === 0 ? (
            <p style={styles.noDataText}>No supplier information available</p>
          ) : (
            <div style={styles.supplierDetails}>
              {suppliers.map((s, idx) => (
                <div key={idx} style={styles.supplierDetailCard}>
                  <h4 style={styles.supplierName}>{s.name}</h4>
                  <div style={styles.supplierDetailGrid}>
                    <div style={styles.detailItem}>
                      <span style={styles.detailLabel}>Quantity Supplied:</span>
                      <span style={styles.detailValue}>{s.quantity}</span>
                    </div>
                    <div style={styles.detailItem}>
                      <span style={styles.detailLabel}>Unit Cost:</span>
                      <span style={styles.detailValue}>₱{s.unit_cost || '0.00'}</span>
                    </div>
                    <div style={styles.detailItem}>
                      <span style={styles.detailLabel}>Expiration Date:</span>
                      <span style={styles.detailValue}>{s.expiration_date || 'N/A'}</span>
                    </div>
                    <div style={styles.detailItem}>
                      <span style={styles.detailLabel}>Reorder Threshold:</span>
                      <span style={styles.detailValue}>{s.threshold || 0}</span>
                    </div>
                  </div>
                </div>
              ))}
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