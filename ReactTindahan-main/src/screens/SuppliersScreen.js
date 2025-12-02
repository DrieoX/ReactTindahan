import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { useLocation } from 'react-router-dom';
import * as API from '../services/APIService'; // Import APIService

export default function SuppliersScreen({ userMode }) {
  const location = useLocation();
  const mode = userMode || location.state?.userMode || 'client';

  const [suppliers, setSuppliers] = useState([]);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [mode]);

  const fetchData = async () => {
    setLoading(true);
    if (mode === 'server') {
      await fetchSuppliersDB();
    } else {
      await fetchSuppliersAPI();
    }
    setLoading(false);
  };

  const fetchSuppliersDB = async () => {
    try {
      const list = await db.suppliers.toArray();
      setSuppliers(list);
    } catch (err) {
      console.error('Error fetching suppliers from DB:', err);
    }
  };

  const fetchSuppliersAPI = async () => {
    try {
      const apiSuppliers = await API.fetchSuppliers(); // Use imported API function
      setSuppliers(apiSuppliers);
    } catch (err) {
      console.error('Error fetching suppliers from API:', err);
      // Fallback to local DB if API fails
      await fetchSuppliersDB();
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return alert('Name is required.');
    
    try {
      if (mode === 'server') {
        // Database mode
        if (editingId) {
          await db.suppliers.update(editingId, { name, contact_info: contact, address });
        } else {
          await db.suppliers.add({ name, contact_info: contact, address });
        }
      } else {
        // API mode
        const supplierData = { 
          name, 
          contact_info: contact, 
          address 
        };
        
        if (editingId) {
          await API.updateSupplier(editingId, supplierData); // Use imported API function
        } else {
          await API.addSupplier(supplierData); // Use imported API function
        }
      }
      
      // Reset form
      setName('');
      setContact('');
      setAddress('');
      setEditingId(null);
      
      // Refresh data
      await fetchData();
      
    } catch (err) {
      console.error('Error saving supplier:', err);
      alert('Failed to save supplier. Please try again.');
    }
  };

  const handleEdit = (supplier) => {
    setEditingId(supplier.supplier_id || supplier.id);
    setName(supplier.name);
    setContact(supplier.contact_info || supplier.contact);
    setAddress(supplier.address || '');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this supplier?')) return;
    
    try {
      if (mode === 'server') {
        // Database mode
        await db.suppliers.delete(id);
      } else {
        // API mode
        await API.deleteSupplier(id); // Use imported API function
      }
      
      await fetchData();
    } catch (err) {
      console.error('Error deleting supplier:', err);
      alert('Failed to delete supplier. Please try again.');
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.pageTitle}>Suppliers Management</h1>
      <p style={styles.pageSubtitle}>Manage product suppliers and contact information</p>
      
      {/* Mode Indicator */}
      <div style={styles.modeIndicator}>
        Mode: <span style={styles.modeText}>{mode === 'server' ? 'Local Database' : 'API Server'}</span>
        {loading && <span style={styles.loadingText}> Loading...</span>}
      </div>

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
        {editingId && (
          <button 
            onClick={() => {
              setName('');
              setContact('');
              setAddress('');
              setEditingId(null);
            }}
            style={styles.cancelButton}
          >
            Cancel Edit
          </button>
        )}
      </div>

      {/* Suppliers List */}
      <div style={styles.listContainer}>
        <h3 style={styles.sectionHeader}>Suppliers List ({suppliers.length})</h3>
        {loading ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>Loading suppliers...</p>
          </div>
        ) : suppliers.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>No suppliers found</p>
            <p style={styles.emptySubText}>Add suppliers to get started</p>
          </div>
        ) : (
          suppliers.map((item) => (
            <div key={item.supplier_id || item.id} style={styles.supplierCard}>
              <p style={styles.supplierName}>{item.name}</p>
              {item.contact_info && <p style={styles.supplierDetail}>Contact: {item.contact_info}</p>}
              {item.address && <p style={styles.supplierDetail}>Address: {item.address}</p>}
              <div style={styles.actionButtons}>
                <button onClick={() => handleEdit(item)} style={styles.editButton}>Edit</button>
                <button onClick={() => handleDelete(item.supplier_id || item.id)} style={styles.deleteButton}>Delete</button>
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
    flex: 1,
    padding: '28px',
    backgroundColor: '#f8fafc',
    minHeight: '100vh',
  },
  headerSection: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '32px',
    marginBottom: '24px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  },
  pageTitle: {
    fontSize: '32px',
    fontWeight: 700,
    color: '#1e293b',
    margin: 0,
    marginBottom: '8px',
  },
  pageSubtitle: {
    fontSize: '16px',
    color: '#64748b',
    margin: 0,
    marginBottom: '16px',
  },
  modeIndicator: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#f0f9ff',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#0369a1',
    marginBottom: '24px',
  },
  modeText: {
    fontWeight: 600,
    color: '#3b82f6',
  },
  loadingText: {
    color: '#94a3b8',
    fontWeight: 500,
  },
  formContainer: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '32px',
    marginBottom: '32px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    border: '1px solid #e2e8f0',
  },
  formHeader: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#1e293b',
    margin: 0,
    marginBottom: '24px',
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '12px',
    border: '2px solid #e2e8f0',
    fontSize: '16px',
    marginBottom: '16px',
    transition: 'all 0.2s',
    outline: 'none',
    backgroundColor: '#f8fafc',
  },
  inputFocus: {
    borderColor: '#3b82f6',
    backgroundColor: 'white',
    boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)',
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
  },
  saveButton: {
    flex: 1,
    padding: '16px 24px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  saveButtonHover: {
    backgroundColor: '#059669',
    transform: 'translateY(-1px)',
    boxShadow: '0 4px 6px -1px rgba(5, 150, 105, 0.2)',
  },
  cancelButton: {
    flex: 1,
    padding: '16px 24px',
    backgroundColor: '#f1f5f9',
    color: '#64748b',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  cancelButtonHover: {
    backgroundColor: '#e2e8f0',
  },
  listContainer: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  },
  sectionHeader: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#1e293b',
    margin: 0,
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  supplierCount: {
    backgroundColor: '#f0f9ff',
    color: '#0369a1',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: 600,
  },
  emptyState: {
    backgroundColor: '#f8fafc',
    padding: '60px 32px',
    borderRadius: '12px',
    textAlign: 'center',
    border: '2px dashed #cbd5e1',
  },
  emptyIcon: {
    fontSize: '48px',
    color: '#cbd5e1',
    marginBottom: '16px',
  },
  emptyText: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#64748b',
    marginBottom: '8px',
  },
  emptySubText: {
    fontSize: '14px',
    color: '#94a3b8',
    maxWidth: '300px',
    margin: '0 auto',
  },
  suppliersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '20px',
  },
  supplierCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    border: '1px solid #e2e8f0',
    transition: 'all 0.2s',
    position: 'relative',
    overflow: 'hidden',
  },
  supplierCardHover: {
    transform: 'translateY(-2px)',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    borderColor: '#cbd5e1',
  },
  supplierName: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#1e293b',
    margin: 0,
    marginBottom: '16px',
    paddingBottom: '16px',
    borderBottom: '2px solid #f1f5f9',
  },
  supplierDetail: {
    fontSize: '14px',
    color: '#64748b',
    margin: 0,
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  detailIcon: {
    fontSize: '16px',
    color: '#94a3b8',
  },
  actionButtons: {
    display: 'flex',
    gap: '12px',
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: '2px solid #f1f5f9',
  },
  editButton: {
    flex: 1,
    padding: '12px 16px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  editButtonHover: {
    backgroundColor: '#2563eb',
    transform: 'translateY(-1px)',
  },
  deleteButton: {
    flex: 1,
    padding: '12px 16px',
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    border: '2px solid #fecaca',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  deleteButtonHover: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  supplierId: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    backgroundColor: '#f1f5f9',
    color: '#64748b',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
  },
};

const responsiveStyles = {
  '@media (max-width: 768px)': {
    container: {
      padding: '16px',
    },
    headerSection: {
      padding: '24px',
    },
    formContainer: {
      padding: '24px',
    },
    listContainer: {
      padding: '24px',
    },
    buttonGroup: {
      flexDirection: 'column',
    },
    suppliersGrid: {
      gridTemplateColumns: '1fr',
    },
  },
  '@media (max-width: 480px)': {
    supplierCard: {
      padding: '20px',
    },
  },
};

// Add to global styles
const globalStyles = `
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.supplier-card {
  animation: slideIn 0.3s ease-out;
}
`;