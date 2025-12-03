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
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (supplier.contact_info && supplier.contact_info.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (supplier.address && supplier.address.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Suppliers Management</h1>
          <p style={styles.pageSubtitle}>Manage product suppliers and contact information</p>
        </div>
        <div style={styles.headerActions}>
          <input
            style={styles.searchInput}
            placeholder="Search suppliers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Form Section */}
      <div style={styles.formContainer}>
        <h3 style={styles.formHeader}>{editingId ? 'Edit Supplier' : 'Add New Supplier'}</h3>
        <input 
          placeholder="Supplier Name *" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          style={styles.input} 
        />
        <input 
          placeholder="Contact Information (Phone/Email)" 
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
        <div style={styles.formButtons}>
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
          <button onClick={handleSave} style={styles.saveButton}>
            {editingId ? 'Update Supplier' : 'Add Supplier'}
          </button>
        </div>
      </div>

      {/* Suppliers List */}
      <div style={styles.listContainer}>
        <div style={styles.listHeader}>
          <h3 style={styles.sectionHeader}>
            Suppliers List ({filteredSuppliers.length})
            {searchQuery && ` • Searching: "${searchQuery}"`}
          </h3>
          {searchQuery && (
            <button 
              style={styles.clearSearchButton}
              onClick={() => setSearchQuery('')}
            >
              Clear Search
            </button>
          )}
        </div>
        {filteredSuppliers.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyStateIcon}>🏢</div>
            <p style={styles.emptyText}>
              {searchQuery 
                ? `No suppliers found matching "${searchQuery}"`
                : 'No suppliers found'}
            </p>
            <p style={styles.emptySubText}>
              {searchQuery 
                ? 'Try a different search term'
                : 'Add your first supplier to get started'}
            </p>
          </div>
        ) : (
          <div style={styles.suppliersGrid}>
            {filteredSuppliers.map((item) => (
              <div key={item.supplier_id} style={styles.supplierCard}>
                <div style={styles.supplierCardHeader}>
                  <p style={styles.supplierName}>{item.name}</p>
                  <div style={styles.supplierActions}>
                    <button onClick={() => handleEdit(item)} style={styles.editButton}>Edit</button>
                    <button onClick={() => handleDelete(item.supplier_id)} style={styles.deleteButton}>Delete</button>
                  </div>
                </div>
                
                {item.contact_info && (
                  <div style={styles.supplierDetail}>
                    <span style={styles.detailLabel}>Contact:</span>
                    <span style={styles.detailValue}>{item.contact_info}</span>
                  </div>
                )}
                
                {item.address && (
                  <div style={styles.supplierDetail}>
                    <span style={styles.detailLabel}>Address:</span>
                    <span style={styles.detailValue}>{item.address}</span>
                  </div>
                )}
                
                <div style={styles.supplierMeta}>
                  <span style={styles.metaItem}>ID: #{item.supplier_id}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '16px',
    backgroundColor: '#F8FAFC',
    minHeight: '100vh',
    maxWidth: '1200px',
    margin: '0 auto',
    '@media (min-width: 768px)': {
      padding: '24px',
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
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: '8px',
    '@media (max-width: 768px)': {
      fontSize: '20px',
    },
  },
  pageSubtitle: {
    fontSize: '16px',
    color: '#64748B',
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
  searchInput: {
    border: '1px solid #D1D5DB',
    borderRadius: '8px',
    padding: '10px 16px',
    backgroundColor: '#fff',
    width: '300px',
    fontSize: '14px',
    '@media (max-width: 768px)': {
      width: '100%',
    },
  },
  formContainer: {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '12px',
    marginBottom: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    '@media (max-width: 768px)': {
      padding: '16px',
    },
  },
  formHeader: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '16px',
    color: '#1E293B',
  },
  input: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #E5E7EB',
    marginBottom: '16px',
    fontSize: '14px',
    backgroundColor: '#F9FAFB',
    boxSizing: 'border-box',
    '@media (max-width: 768px)': {
      padding: '10px',
      fontSize: '16px', // Larger for mobile typing
    },
  },
  formButtons: {
    display: 'flex',
    gap: '12px',
    '@media (max-width: 768px)': {
      flexDirection: 'column',
    },
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    color: '#fff',
    padding: '12px 24px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    flex: '1',
    transition: 'background-color 0.2s',
    '&:hover': {
      backgroundColor: '#2563EB',
    },
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
    color: '#475569',
    padding: '12px 24px',
    borderRadius: '8px',
    border: '1px solid #E2E8F0',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    flex: '1',
    transition: 'background-color 0.2s',
    '&:hover': {
      backgroundColor: '#E2E8F0',
    },
  },
  listContainer: {
    marginBottom: '24px',
  },
  listHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    flexWrap: 'wrap',
    gap: '8px',
  },
  sectionHeader: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1E293B',
    margin: 0,
  },
  clearSearchButton: {
    backgroundColor: 'transparent',
    color: '#3B82F6',
    border: 'none',
    padding: '6px 12px',
    fontSize: '14px',
    cursor: 'pointer',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  suppliersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
    '@media (max-width: 768px)': {
      gridTemplateColumns: '1fr',
    },
  },
  supplierCard: {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    border: '1px solid #E2E8F0',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    transition: 'transform 0.2s, box-shadow 0.2s',
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    },
    '@media (max-width: 768px)': {
      padding: '16px',
    },
  },
  supplierCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    flexWrap: 'wrap',
  },
  supplierName: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1E293B',
    margin: 0,
    flex: '1',
    minWidth: '150px',
  },
  supplierActions: {
    display: 'flex',
    gap: '8px',
    '@media (max-width: 480px)': {
      width: '100%',
      justifyContent: 'flex-start',
      marginTop: '8px',
    },
  },
  supplierDetail: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    '@media (min-width: 480px)': {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
  },
  detailLabel: {
    fontSize: '12px',
    color: '#64748B',
    fontWeight: '500',
    minWidth: '80px',
  },
  detailValue: {
    fontSize: '14px',
    color: '#475569',
    flex: '1',
  },
  supplierMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '12px',
    borderTop: '1px solid #F1F5F9',
    fontSize: '12px',
    color: '#94A3B8',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  editButton: {
    backgroundColor: '#3B82F6',
    color: '#fff',
    padding: '6px 12px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    minWidth: '60px',
    transition: 'background-color 0.2s',
    '&:hover': {
      backgroundColor: '#2563EB',
    },
  },
  deleteButton: {
    backgroundColor: '#FEF2F2',
    color: '#DC2626',
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #FECACA',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    minWidth: '60px',
    transition: 'background-color 0.2s',
    '&:hover': {
      backgroundColor: '#FEE2E2',
    },
  },
  emptyState: {
    backgroundColor: '#fff',
    padding: '40px 20px',
    borderRadius: '12px',
    textAlign: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  emptyStateIcon: {
    fontSize: '48px',
    marginBottom: '16px',
    opacity: '0.5',
  },
  emptyText: {
    fontSize: '16px',
    color: '#64748B',
    marginBottom: '8px',
    fontWeight: '500',
  },
  emptySubText: {
    fontSize: '14px',
    color: '#9CA3AF',
    margin: 0,
  },
};