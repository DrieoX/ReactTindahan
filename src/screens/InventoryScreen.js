import React, { useEffect, useState } from 'react';
import { db } from '../db';

export default function InventoryScreen({ userMode }) {
  const mode = userMode || 'client';

  const [inventory, setInventory] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', sku: '', description: '', unit_price: '' });
  const [editingItem, setEditingItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchInventory();
    fetchSuppliers();
  }, []);

  const fetchInventory = async () => {
    try {
      const products = await db.products.toArray();
      const inventoryData = await db.inventory.toArray();
      const supplierList = await db.suppliers.toArray();

      const items = products.map((p) => {
        const inv = inventoryData.find((i) => i.product_id === p.product_id) || {};
        const supplier = supplierList.find((s) => s.supplier_id === inv.supplier_id);
        return {
          ...p,
          quantity: inv.quantity || 0,
          expiration_date: inv.expiration_date || null,
          threshold: inv.threshold || 0,
          supplier_name: supplier ? supplier.name : 'N/A',
        };
      });

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
      const existing = await db.products.where('name').equals(newItem.name).first();
      if (existing) return alert('A product with this name already exists.');

      await db.products.add({
        sku: newItem.sku || null,
        name: newItem.name,
        description: newItem.description,
        unit_price: parseFloat(newItem.unit_price),
        supplier_id: null, // ❌ Supplier not chosen here
      });

      setShowAddModal(false);
      setNewItem({ name: '', sku: '', description: '', unit_price: '' });
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
        // ❌ supplier_id excluded here — handled only by resupply
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

      setShowEditModal(false);
      setEditingItem(null);
      fetchInventory();
    } catch (err) {
      console.error('Error deleting product:', err);
    }
  };

  const filteredInventory = inventory.filter(
    (item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const expiredCount = inventory.filter(
    (item) => item.expiration_date && new Date(item.expiration_date) < new Date()
  ).length;
  const lowStockCount = inventory.filter((item) => item.quantity < (item.threshold || 10)).length;

  return (
    <div style={styles.container}>
      <h1 style={styles.pageTitle}>Inventory Management</h1>
      <p style={styles.pageSubtitle}>Manage products, track stock levels & expiration dates</p>

      {(expiredCount > 0 || lowStockCount > 0) && (
        <div style={styles.attentionContainer}>
          <strong style={styles.attentionHeader}>Attention Required</strong>
          {expiredCount > 0 && (
            <div style={styles.attentionText}>{expiredCount} product(s) expired</div>
          )}
          {lowStockCount > 0 && (
            <div style={styles.attentionText}>{lowStockCount} product(s) low in stock</div>
          )}
        </div>
      )}

      <input
        style={styles.searchInput}
        placeholder="Search products by name, SKU..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <h3 style={styles.sectionHeader}>Products</h3>
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={{ width: 150 }}>Product</th>
              <th style={{ width: 100 }}>SKU</th>
              <th style={{ width: 80 }}>Price</th>
              <th style={{ width: 80 }}>Stock</th>
              <th style={{ width: 120 }}>Expiry Date</th>
              <th style={{ width: 120 }}>Supplier</th>
              <th style={{ width: 100 }}>Status</th>
              <th style={{ width: 100 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredInventory.map((item) => {
              let status = 'Good';
              let statusStyle = styles.statusGood;
              if (item.expiration_date && new Date(item.expiration_date) < new Date()) {
                status = 'Expired';
                statusStyle = styles.statusExpired;
              } else if (item.quantity < (item.threshold || 10)) {
                status = 'Low Stock';
                statusStyle = styles.statusLowStock;
              }
              return (
                <tr key={item.product_id} style={styles.tableRow}>
                  <td style={{ width: 150, fontWeight: 'bold' }}>{item.name}</td>
                  <td style={{ width: 100 }}>{item.sku || 'N/A'}</td>
                  <td style={{ width: 80 }}>₱{item.unit_price || '0.00'}</td>
                  <td style={{ width: 80 }}>{item.quantity || 0}</td>
                  <td style={{ width: 120 }}>{item.expiration_date || 'N/A'}</td>
                  <td style={{ width: 120 }}>{item.supplier_name || 'N/A'}</td>
                  <td style={{ width: 100, ...statusStyle }}>{status}</td>
                  <td style={{ width: 100 }}>
                    <button style={styles.editButton} onClick={() => handleEditItem(item)}>
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button style={styles.addButton} onClick={() => setShowAddModal(true)}>
        Add New Product
      </button>

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
    </div>
  );
}

function ProductModal({ visible, onClose, onSubmit, onDelete, item, setItem, title, isEdit }) {
  if (!visible) return null;
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContainer}>
        <h2 style={styles.modalHeader}>{title}</h2>
        <input
          placeholder="SKU"
          value={item?.sku || ''}
          onChange={(e) => setItem({ ...item, sku: e.target.value })}
          style={styles.input}
          autoFocus
        />
        <input
          placeholder="Name"
          value={item?.name || ''}
          onChange={(e) => setItem({ ...item, name: e.target.value })}
          style={styles.input}
        />
        <input
          placeholder="Description"
          value={item?.description || ''}
          onChange={(e) => setItem({ ...item, description: e.target.value })}
          style={styles.input}
        />
        <input
          placeholder="Unit Price"
          value={item?.unit_price?.toString() || ''}
          type="number"
          onChange={(e) => setItem({ ...item, unit_price: e.target.value })}
          style={styles.input}
        />

        <div style={styles.modalButtons}>
          <button style={styles.submitButton} onClick={onSubmit}>
            Submit
          </button>
          {isEdit && (
            <button style={styles.deleteButton} onClick={onDelete}>
              Delete
            </button>
          )}
          <button style={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { 
    padding: '5vw', // adapts padding to screen width
    backgroundColor: '#F8FAFC',
    minHeight: '100vh',
  },
  pageTitle: { 
    fontSize: 'clamp(20px, 2vw, 28px)', // scales with screen size
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  pageSubtitle: { 
    fontSize: 'clamp(14px, 1.5vw, 18px)',
    fontWeight: 500, 
    color: '#64748B',
    marginBottom: 16,
  },
  attentionContainer: {
    backgroundColor: '#fef3c7',
    padding: '1rem',
    borderRadius: 12,
    marginBottom: 16,
    borderLeft: '4px solid #f59e0b',
  },
  attentionHeader: { 
    fontSize: 'clamp(14px, 1.5vw, 18px)', 
    fontWeight: 600, 
    marginBottom: 4, 
    color: '#92400e' 
  },
  attentionText: { fontSize: 'clamp(12px, 1.3vw, 16px)', color: '#92400e' },
  
  searchInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: '0.8rem',
    marginBottom: 20,
    backgroundColor: '#fff',
    width: '100%',
    fontSize: 'clamp(14px, 1.2vw, 16px)',
  },

  sectionHeader: { 
    fontSize: 'clamp(16px, 1.5vw, 20px)', 
    fontWeight: 600, 
    marginBottom: 12, 
    color: '#374151' 
  },

  tableWrapper: { overflowX: 'auto', marginBottom: 16 },
  table: { 
    borderCollapse: 'collapse', 
    width: '100%', 
    border: '1px solid #d1d5db', 
    borderRadius: 12,
    fontSize: 'clamp(12px, 1.2vw, 14px)',
  },
  tableHeader: { backgroundColor: '#f3f4f6', textAlign: 'left', color: '#374151' },
  tableRow: { borderBottom: '1px solid #e5e7eb' },

  statusExpired: { color: '#dc2626', fontWeight: 600 },
  statusLowStock: { color: '#ea580c', fontWeight: 600 },
  statusGood: { color: '#16a34a', fontWeight: 600 },

  editButton: {
    backgroundColor: '#3B82F6',
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 'clamp(12px, 1.2vw, 14px)',
  },

  addButton: {
    backgroundColor: '#3B82F6',
    color: '#fff',
    padding: '1rem',
    borderRadius: 12,
    cursor: 'pointer',
    marginBottom: 20,
    border: 'none',
    fontSize: 'clamp(14px, 1.5vw, 18px)',
    fontWeight: 600,
    width: '100%',
    maxWidth: '400px',
  },

  deleteButton: {
    backgroundColor: '#ef4444',
    color: '#fff',
    border: 'none',
    padding: '0.9rem',
    borderRadius: 12,
    cursor: 'pointer',
    flex: 1,
    fontSize: 'clamp(14px, 1.2vw, 16px)',
  },

  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: '1rem',
  },
  modalContainer: {
    backgroundColor: '#F8FAFC',
    padding: 'clamp(16px, 3vw, 30px)',
    borderRadius: 12,
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalHeader: { 
    fontSize: 'clamp(18px, 2vw, 24px)', 
    fontWeight: 'bold', 
    marginBottom: 16, 
    color: '#1E293B' 
  },

  input: {
    width: '100%',
    padding: '0.8rem',
    borderRadius: 12,
    border: '1px solid #d1d5db',
    marginBottom: 16,
    backgroundColor: '#fff',
    fontSize: 'clamp(14px, 1.2vw, 16px)',
  },

  pickerLabel: { fontSize: 'clamp(14px, 1.2vw, 16px)', marginBottom: 8, color: '#374151' },
  pickerContainer: {
    width: '100%',
    padding: '0.8rem',
    borderRadius: 12,
    border: '1px solid #d1d5db',
    marginBottom: 16,
    backgroundColor: '#fff',
    fontSize: 'clamp(14px, 1.2vw, 16px)',
  },

  modalButtons: { display: 'flex', flexDirection: 'row', gap: '0.5rem' },
  submitButton: {
    backgroundColor: '#3B82F6',
    color: '#fff',
    border: 'none',
    padding: '0.9rem',
    borderRadius: 12,
    cursor: 'pointer',
    flex: 1,
    fontSize: 'clamp(14px, 1.2vw, 16px)',
  },
  cancelButton: {
    backgroundColor: '#EF4444',
    color: '#fff',
    border: 'none',
    padding: '0.9rem',
    borderRadius: 12,
    cursor: 'pointer',
    flex: 1,
    fontSize: 'clamp(14px, 1.2vw, 16px)',
  },
};

