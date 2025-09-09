import React, { useState, useEffect } from 'react';
import { db } from '../db';
import MainLayout from '../components/MainLayout';
import { useLocation } from 'react-router-dom';

export default function SuppliersScreen({ userMode }) {
  const location = useLocation();
  const mode = userMode || location.state?.userMode || 'client';

  const [suppliers, setSuppliers] = useState([]);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');
  const [editingId, setEditingId] = useState(null);

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

  const handleSave = async () => {
    if (!name.trim()) return alert('Name is required.');
    try {
      if (editingId) {
        await db.suppliers.update(editingId, {
          name,
          contact_info: contact,
          address,
        });
      } else {
        await db.suppliers.add({
          name,
          contact_info: contact,
          address,
        });
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
    <MainLayout userMode={mode.toLowerCase()}>
      <div style={styles.container}>
        <h1 style={styles.pageTitle}>Suppliers Management</h1>
        <p style={styles.pageSubtitle}>Manage product suppliers and contact information</p>

        {/* Form Section */}
        <div style={styles.formContainer}>
          <h3 style={styles.formHeader}>{editingId ? 'Edit Supplier' : 'Add New Supplier'}</h3>
          <input
            placeholder="Supplier Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={styles.input}
          />
          <input
            placeholder="Contact Information"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            style={styles.input}
          />
          <input
            placeholder="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={styles.input}
          />
          <button onClick={handleSave} style={styles.saveButton}>
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
                {item.contact_info && (
                  <p style={styles.supplierDetail}>Contact: {item.contact_info}</p>
                )}
                {item.address && (
                  <p style={styles.supplierDetail}>Address: {item.address}</p>
                )}
                <div style={styles.actionButtons}>
                  <button
                    onClick={() => handleEdit(item)}
                    style={styles.editButton}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item.supplier_id)}
                    style={styles.deleteButton}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </MainLayout>
  );
}

const styles = {
  container: {
    padding: 30,
    backgroundColor: '#F8FAFC',
    minHeight: '100vh',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 16,
    fontWeight: 500,
    color: '#64748B',
    marginBottom: 24,
  },
  formContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  },
  formHeader: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 16,
    color: '#1E293B',
  },
  input: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    border: '1px solid #E5E7EB',
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: '#F9FAFB',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    color: '#fff',
    padding: 16,
    borderRadius: 12,
    width: '100%',
    border: 'none',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  },
  listContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 16,
    color: '#1E293B',
  },
  emptyState: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    textAlign: 'center',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  },
  emptyText: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 4,
  },
  emptySubText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  supplierCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  },
  supplierName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 8,
  },
  supplierDetail: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
  },
  actionButtons: {
    display: 'flex',
    gap: 12,
    marginTop: 12,
  },
  editButton: {
    backgroundColor: '#3B82F6',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: 12,
    border: 'none',
    cursor: 'pointer',
  },
  deleteButton: {
    backgroundColor: '#EF4444',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: 12,
    border: 'none',
    cursor: 'pointer',
  },
};
