import React, { useEffect, useState } from 'react';
import { db } from '../db';

export default function InventoryScreen({ userMode }) {
  const mode = userMode || 'client';

  const [inventory, setInventory] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', sku: '', description: '', unit_price: '' });
  const [editingItem, setEditingItem] = useState(null);
  const [supplierDetails, setSupplierDetails] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

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
                unit_cost: 0, // optional, could pull from latest resupply
              }]
            : [],
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
      <h1 style={styles.pageTitle}>Inventory Management</h1>

      <input
        style={styles.searchInput}
        placeholder="Search by name, SKU, or Supplier..."
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
              <th style={{ width: 80 }}>Total Stock</th>
              <th style={{ width: 150 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredInventory.map((item) => (
              <tr key={item.product_id} style={styles.tableRow}>
                <td style={{ fontWeight: 'bold' }}>{item.name}</td>
                <td>{item.sku || 'N/A'}</td>
                <td>₱{item.unit_price || '0.00'}</td>
                <td>{item.quantity || 0}</td>
                <td>
                  <button style={styles.editButton} onClick={() => handleEditItem(item)}>
                    Edit
                  </button>
                  <button style={styles.viewButton} onClick={() => handleSupplierDetails(item)}>
                    View Suppliers
                  </button>
                </td>
              </tr>
            ))}
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

function SupplierModal({ suppliers, onClose }) {
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContainer}>
        <h2 style={styles.modalHeader}>Suppliers</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ ...styles.table, minWidth: '100%' }}>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Quantity</th>
                <th>Unit Cost</th>
                <th>Expiry</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s, idx) => (
                <tr key={idx}>
                  <td>{s.name}</td>
                  <td>{s.quantity}</td>
                  <td>₱{s.unit_cost || '0.00'}</td>
                  <td>{s.expiration_date || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button style={{ ...styles.cancelButton, marginTop: 16 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: { padding: '5vw', backgroundColor: '#F8FAFC', minHeight: '100vh' },
  pageTitle: {
    fontSize: 'clamp(20px, 2vw, 28px)',
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 16,
  },
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
    color: '#374151',
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

  editButton: {
    backgroundColor: '#3B82F6',
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    marginRight: 8,
  },
  viewButton: {
    backgroundColor: '#10B981',
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: 8,
    cursor: 'pointer',
  },
  addButton: {
    backgroundColor: '#3B82F6',
    color: '#fff',
    padding: '1rem',
    borderRadius: 12,
    cursor: 'pointer',
    marginTop: 16,
    border: 'none',
    fontSize: 'clamp(14px, 1.5vw, 18px)',
    fontWeight: 600,
    width: '100%',
    maxWidth: '400px',
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
    maxWidth: '600px',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalHeader: {
    fontSize: 'clamp(18px, 2vw, 24px)',
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1E293B',
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
  modalButtons: { display: 'flex', flexDirection: 'row', gap: '0.5rem' },
  submitButton: {
    backgroundColor: '#3B82F6',
    color: '#fff',
    border: 'none',
    padding: '0.9rem',
    borderRadius: 12,
    cursor: 'pointer',
    flex: 1,
  },
  deleteButton: {
    backgroundColor: '#ef4444',
    color: '#fff',
    border: 'none',
    padding: '0.9rem',
    borderRadius: 12,
    cursor: 'pointer',
    flex: 1,
  },
  cancelButton: {
    backgroundColor: '#6B7280',
    color: '#fff',
    border: 'none',
    padding: '0.9rem',
    borderRadius: 12,
    cursor: 'pointer',
    flex: 1,
  },
};
