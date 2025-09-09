import React, { useEffect, useState } from 'react';
import { db } from '../db';
import MainLayout from '../components/MainLayout';

export default function InventoryScreen({ userMode }) {
  const mode = userMode || 'client';

  const [inventory, setInventory] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', sku: '', description: '', unit_price: '', supplier_id: null });
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

      // merge products with inventory
      const items = products.map((p) => {
        const inv = inventoryData.find((i) => i.product_id === p.product_id) || {};
        return {
          ...p,
          quantity: inv.quantity || 0,
          expiration_date: inv.expiration_date || null,
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
    if (!newItem.name || !newItem.unit_price || !newItem.supplier_id)
      return alert('Please fill out all required fields.');
    try {
      const existing = await db.products.where('name').equals(newItem.name).first();
      if (existing) return alert('A product with this name already exists.');

      await db.products.add({
        sku: newItem.sku || null,
        name: newItem.name,
        description: newItem.description,
        unit_price: parseFloat(newItem.unit_price),
        supplier_id: parseInt(newItem.supplier_id),
      });

      setShowAddModal(false);
      setNewItem({ name: '', sku: '', description: '', unit_price: '', supplier_id: null });
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
        supplier_id: parseInt(editingItem.supplier_id),
      });

      setShowEditModal(false);
      setEditingItem(null);
      fetchInventory();
    } catch (err) {
      console.error('Error saving product edit:', err);
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
  const lowStockCount = inventory.filter((item) => item.quantity < 10).length;

  return (
    <MainLayout userMode={mode.toLowerCase()}>
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
          placeholder="Search products by name, SKU, or supplier..."
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
                } else if (item.quantity < 10) {
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
            item={showAddModal ? newItem : editingItem}
            setItem={showAddModal ? setNewItem : setEditingItem}
            suppliers={suppliers}
            title={showAddModal ? 'Add New Product' : 'Edit Product'}
          />
        )}
      </div>
    </MainLayout>
  );
}

function ProductModal({ visible, onClose, onSubmit, item, setItem, suppliers, title }) {
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
        <label style={styles.pickerLabel}>Select Supplier:</label>
        <select
          style={styles.pickerContainer}
          value={item?.supplier_id || ''}
          onChange={(e) => setItem({ ...item, supplier_id: parseInt(e.target.value) })}
        >
          <option value="">Select Supplier</option>
          {suppliers.map((sup) => (
            <option key={sup.supplier_id} value={sup.supplier_id}>
              {sup.name}
            </option>
          ))}
        </select>
        <div style={styles.modalButtons}>
          <button style={styles.submitButton} onClick={onSubmit}>
            Submit
          </button>
          <button style={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { padding: 30, backgroundColor: '#F8FAFC', minHeight: '100vh' },
  pageTitle: { fontSize: 24, fontWeight: 'bold', color: '#1E293B', marginBottom: 4 },
  pageSubtitle: { fontSize: 16, fontWeight: 500, color: '#64748B', marginBottom: 16 },
  attentionContainer: {
    backgroundColor: '#fef3c7',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderLeft: '4px solid #f59e0b',
  },
  attentionHeader: { fontSize: 16, fontWeight: 600, marginBottom: 4, color: '#92400e' },
  attentionText: { fontSize: 14, color: '#92400e' },
  searchInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    backgroundColor: '#fff',
    width: '100%',
  },
  sectionHeader: { fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#374151' },
  tableWrapper: { overflowX: 'auto', marginBottom: 16 },
  table: { borderCollapse: 'collapse', width: '100%', border: '1px solid #d1d5db', borderRadius: 12 },
  tableHeader: { backgroundColor: '#f3f4f6', textAlign: 'left', fontSize: 12, color: '#374151' },
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
  },
  addButton: {
    backgroundColor: '#3B82F6',
    color: '#fff',
    padding: 16,
    borderRadius: 12,
    cursor: 'pointer',
    marginBottom: 20,
    border: 'none',
    fontSize: 16,
    fontWeight: 600,
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
  },
  modalContainer: {
    backgroundColor: '#F8FAFC',
    padding: 30,
    borderRadius: 12,
    width: '400px',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalHeader: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: '#1E293B' },
  input: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    border: '1px solid #d1d5db',
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  pickerLabel: { fontSize: 16, marginBottom: 8, color: '#374151' },
  pickerContainer: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    border: '1px solid #d1d5db',
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  modalButtons: { display: 'flex', justifyContent: 'space-between', gap: 8 },
  submitButton: {
    backgroundColor: '#3B82F6',
    color: '#fff',
    border: 'none',
    padding: 14,
    borderRadius: 12,
    cursor: 'pointer',
    flex: 1,
  },
  cancelButton: {
    backgroundColor: '#EF4444',
    color: '#fff',
    border: 'none',
    padding: 14,
    borderRadius: 12,
    cursor: 'pointer',
    flex: 1,
  },
};
