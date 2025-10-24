import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { useLocation } from 'react-router-dom';

export default function SuppliersScreen({ userMode }) {
  const location = useLocation();
  const mode = userMode || location.state?.userMode || 'client';

  const [suppliers, setSuppliers] = useState([]);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [clickedButtons, setClickedButtons] = useState({});

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const list = await db.suppliers.toArray();
      setSuppliers(list);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
    }
  };

  // Button click handler
  const handleButtonClick = (buttonId, callback) => {
    setClickedButtons(prev => ({
      ...prev,
      [buttonId]: true
    }));

    if (callback) {
      callback();
    }

    setTimeout(() => {
      setClickedButtons(prev => ({
        ...prev,
        [buttonId]: false
      }));
    }, 300);
  };

  const handleSave = async () => {
    if (!name.trim()) return alert('Name is required.');
    try {
      if (editingId) {
        await db.suppliers.update(editingId, { name, contact_info: contact, address });
      } else {
        await db.suppliers.add({ name, contact_info: contact, address });
      }
      setName('');
      setContact('');
      setAddress('');
      setEditingId(null);
      fetchSuppliers();
    } catch (err) {
      console.error('Error saving supplier:', err);
    }
  };

  const handleEdit = (supplier) => {
    setEditingId(supplier.supplier_id);
    setName(supplier.name);
    setContact(supplier.contact_info);
    setAddress(supplier.address);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this supplier?')) return;
    try {
      await db.suppliers.delete(id);
      fetchSuppliers();
    } catch (err) {
      console.error('Error deleting supplier:', err);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.pageTitle}>Suppliers Management</h1>
      <p style={styles.pageSubtitle}>Manage product suppliers and contact information</p>

      {/* Form Section */}
      <div style={styles.formContainer}>
        <h3 style={styles.formHeader}>{editingId ? 'Edit Supplier' : 'Add New Supplier'}</h3>
        <input placeholder="Supplier Name" value={name} onChange={(e) => setName(e.target.value)} style={styles.input} />
        <input placeholder="Contact Information" value={contact} onChange={(e) => setContact(e.target.value)} style={styles.input} />
        <input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} style={styles.input} />
        <button 
          onClick={() => handleButtonClick('saveSupplier', handleSave)} 
          style={{
            ...styles.saveButton,
            backgroundColor: clickedButtons['saveSupplier'] ? '#ffffff' : '#0ea5e9',
            color: clickedButtons['saveSupplier'] ? '#0ea5e9' : '#ffffff',
            border: clickedButtons['saveSupplier'] ? '2px solid #0ea5e9' : 'none',
          }}
        >
          {editingId ? 'Update Supplier' : 'Add Supplier'}
        </button>
      </div>

      {/* Suppliers List */}
      <div style={styles.listContainer}>
        <h3 style={styles.sectionHeader}>Suppliers List</h3>
        {suppliers.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>No suppliers found</p>
            <p style={styles.emptySubText}>Add suppliers to get started</p>
          </div>
        ) : (
          suppliers.map((item) => (
            <div key={item.supplier_id} style={styles.supplierCard}>
              <p style={styles.supplierName}>{item.name}</p>
              {item.contact_info && <p style={styles.supplierDetail}>Contact: {item.contact_info}</p>}
              {item.address && <p style={styles.supplierDetail}>Address: {item.address}</p>}
              <div style={styles.actionButtons}>
                <button 
                  onClick={() => handleButtonClick(`edit-${item.supplier_id}`, () => handleEdit(item))} 
                  style={{
                    ...styles.editButton,
                    backgroundColor: clickedButtons[`edit-${item.supplier_id}`] ? '#ffffff' : '#0ea5e9',
                    color: clickedButtons[`edit-${item.supplier_id}`] ? '#0ea5e9' : '#ffffff',
                    border: clickedButtons[`edit-${item.supplier_id}`] ? '2px solid #0ea5e9' : 'none',
                  }}
                >
                  Edit
                </button>
                <button 
                  onClick={() => handleButtonClick(`delete-${item.supplier_id}`, () => handleDelete(item.supplier_id))} 
                  style={{
                    ...styles.deleteButton,
                    backgroundColor: clickedButtons[`delete-${item.supplier_id}`] ? '#ffffff' : '#ef4444',
                    color: clickedButtons[`delete-${item.supplier_id}`] ? '#ef4444' : '#ffffff',
                    border: clickedButtons[`delete-${item.supplier_id}`] ? '2px solid #ef4444' : 'none',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: 'clamp(12px, 4vw, 30px)',
    backgroundColor: '#F8FAFC',
    minHeight: '100vh',
  },

  pageTitle: {
    fontSize: 'clamp(18px, 2vw, 24px)',
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 'clamp(2px, 0.5vw, 4px)',
  },

  pageSubtitle: {
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    fontWeight: 500,
    color: '#64748B',
    marginBottom: 'clamp(12px, 2vw, 24px)',
  },

  formContainer: {
    backgroundColor: '#fff',
    padding: 'clamp(14px, 3vw, 20px)',
    borderRadius: '12px',
    marginBottom: 'clamp(16px, 2vw, 24px)',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  },

  formHeader: {
    fontSize: 'clamp(16px, 1.8vw, 18px)',
    fontWeight: 600,
    marginBottom: 'clamp(12px, 2vw, 16px)',
    color: '#1E293B',
  },

  input: {
    width: '100%',
    padding: 'clamp(10px, 2.5vw, 14px)',
    borderRadius: '12px',
    border: '1px solid #E5E7EB',
    marginBottom: 'clamp(12px, 2vw, 16px)',
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    backgroundColor: '#F9FAFB',
  },

  saveButton: {
    padding: 'clamp(12px, 3vw, 16px)',
    borderRadius: '12px',
    width: '100%',
    border: 'none',
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },

  listContainer: {
    marginBottom: 'clamp(16px, 2vw, 24px)',
  },

  sectionHeader: {
    fontSize: 'clamp(16px, 1.8vw, 18px)',
    fontWeight: 600,
    marginBottom: 'clamp(12px, 2vw, 16px)',
    color: '#1E293B',
  },

  emptyState: {
    backgroundColor: '#fff',
    padding: 'clamp(14px, 3vw, 20px)',
    borderRadius: '12px',
    textAlign: 'center',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  },

  emptyText: {
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    color: '#64748B',
    marginBottom: 'clamp(4px, 1vw, 8px)',
  },

  emptySubText: {
    fontSize: 'clamp(12px, 1.2vw, 14px)',
    color: '#9CA3AF',
  },

  supplierCard: {
    backgroundColor: '#fff',
    padding: 'clamp(14px, 3vw, 20px)',
    borderRadius: '12px',
    marginBottom: '12px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  },

  supplierName: {
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: '8px',
  },

  supplierDetail: {
    fontSize: 'clamp(12px, 1.2vw, 14px)',
    color: '#64748B',
    marginBottom: '4px',
  },

  actionButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'clamp(8px, 2vw, 12px)',
    marginTop: 'clamp(8px, 2vw, 12px)',
  },

  editButton: {
    padding: 'clamp(6px, 2vw, 8px) clamp(12px, 3vw, 16px)',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    flex: '1 1 auto',
    minWidth: '100px',
    fontSize: 'clamp(12px, 1.2vw, 14px)',
    fontWeight: 500,
    transition: 'all 0.2s ease',
  },

  deleteButton: {
    padding: 'clamp(6px, 2vw, 8px) clamp(12px, 3vw, 16px)',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    flex: '1 1 auto',
    minWidth: '100px',
    fontSize: 'clamp(12px, 1.2vw, 14px)',
    fontWeight: 500,
    transition: 'all 0.2s ease',
  },
};