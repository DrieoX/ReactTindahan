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
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      setIsLoading(true);
      const list = await db.suppliers.toArray();
      setSuppliers(list);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
      alert('Error fetching suppliers. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Function to get or create the "None" supplier
  const ensureNoneSupplier = async () => {
    try {
      const existingNoneSupplier = await db.suppliers.where('name').equals('None').first();
      
      if (!existingNoneSupplier) {
        await db.suppliers.add({ 
          name: 'None', 
          contact_info: 'No contact information', 
          address: 'No address' 
        });
        fetchSuppliers();
      }
    } catch (err) {
      console.error('Error ensuring None supplier:', err);
    }
  };

  // Call this function when component mounts
  useEffect(() => {
    ensureNoneSupplier();
  }, []);

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
    if (!name.trim()) {
      alert('Supplier name is required.');
      return;
    }

    // Check if supplier name already exists (excluding the current editing one)
    const existingSupplier = suppliers.find(s => 
      s.name.toLowerCase() === name.toLowerCase().trim() && 
      s.supplier_id !== editingId
    );

    if (existingSupplier) {
      alert('A supplier with this name already exists.');
      return;
    }

    try {
      setIsLoading(true);
      if (editingId) {
        await db.suppliers.update(editingId, { 
          name: name.trim(), 
          contact_info: contact.trim(), 
          address: address.trim() 
        });
      } else {
        await db.suppliers.add({ 
          name: name.trim(), 
          contact_info: contact.trim(), 
          address: address.trim() 
        });
      }
      resetForm();
      fetchSuppliers();
    } catch (err) {
      console.error('Error saving supplier:', err);
      alert('Error saving supplier. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (supplier) => {
    if (supplier.name === 'None') {
      alert('The "None" supplier cannot be edited.');
      return;
    }
    setEditingId(supplier.supplier_id);
    setName(supplier.name);
    setContact(supplier.contact_info || '');
    setAddress(supplier.address || '');
  };

  const handleDelete = async (id, supplierName) => {
    if (supplierName === 'None') {
      alert('The "None" supplier cannot be deleted.');
      return;
    }

    // Check if any products are using this supplier
    try {
      const productsUsingSupplier = await db.products.where('supplier_id').equals(id).count();
      
      if (productsUsingSupplier > 0) {
        alert(`Cannot delete this supplier. There are ${productsUsingSupplier} product(s) associated with it. Please reassign those products to another supplier first.`);
        return;
      }

      if (!window.confirm(`Are you sure you want to delete "${supplierName}"? This action cannot be undone.`)) return;
      
      setIsLoading(true);
      await db.suppliers.delete(id);
      fetchSuppliers();
    } catch (err) {
      console.error('Error deleting supplier:', err);
      alert('Error deleting supplier. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setContact('');
    setAddress('');
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    resetForm();
  };

  // Filter suppliers based on search term
  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (supplier.contact_info && supplier.contact_info.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (supplier.address && supplier.address.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div style={styles.container}>
      <h1 style={styles.pageTitle}>Suppliers Management</h1>
      <p style={styles.pageSubtitle}>Manage product suppliers and contact information</p>

      {/* Form Section */}
      <div style={styles.formContainer}>
        <h3 style={styles.formHeader}>
          {editingId ? 'Edit Supplier' : 'Add New Supplier'}
          {editingId && (
            <button 
              onClick={handleCancelEdit}
              style={styles.cancelButton}
            >
              Cancel Edit
            </button>
          )}
        </h3>
        
        <div style={styles.inputGroup}>
          <label style={styles.label}>Supplier Name *</label>
          <input 
            placeholder="Enter supplier name" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            style={styles.input}
            disabled={isLoading}
          />
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Contact Information</label>
          <input 
            placeholder="Phone, email, or other contact details" 
            value={contact} 
            onChange={(e) => setContact(e.target.value)} 
            style={styles.input}
            disabled={isLoading}
          />
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Address</label>
          <input 
            placeholder="Supplier's physical address" 
            value={address} 
            onChange={(e) => setAddress(e.target.value)} 
            style={styles.input}
            disabled={isLoading}
          />
        </div>

        <button 
          onClick={() => handleButtonClick('saveSupplier', handleSave)} 
          disabled={isLoading || !name.trim()}
          style={{
            ...styles.saveButton,
            backgroundColor: clickedButtons['saveSupplier'] ? '#ffffff' : 
                           (isLoading || !name.trim()) ? '#93c5fd' : '#0ea5e9',
            color: clickedButtons['saveSupplier'] ? '#0ea5e9' : '#ffffff',
            border: clickedButtons['saveSupplier'] ? '2px solid #0ea5e9' : 'none',
            cursor: (isLoading || !name.trim()) ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? 'Saving...' : editingId ? 'Update Supplier' : 'Add Supplier'}
        </button>
      </div>

      {/* Search and Filters */}
      <div style={styles.searchContainer}>
        <input
          type="text"
          placeholder="Search suppliers by name, contact, or address..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={styles.searchInput}
          disabled={isLoading}
        />
        <button 
          onClick={fetchSuppliers}
          style={styles.refreshButton}
          disabled={isLoading}
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Suppliers List */}
      <div style={styles.listContainer}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>
            Available Suppliers ({filteredSuppliers.length})
            {searchTerm && (
              <span style={styles.searchResultsText}>
                - showing results for "{searchTerm}"
              </span>
            )}
          </h3>
        </div>
        
        <p style={styles.helperText}>
          💡 <strong>None Supplier:</strong> Use this for products without a specific supplier. 
          This option is automatically created and cannot be edited or deleted.
        </p>

        {isLoading ? (
          <div style={styles.loadingState}>
            <p style={styles.loadingText}>Loading suppliers...</p>
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>
              {searchTerm ? 'No suppliers found matching your search' : 'No suppliers found'}
            </p>
            <p style={styles.emptySubText}>
              {searchTerm ? 'Try adjusting your search terms' : 'Add suppliers to get started'}
            </p>
          </div>
        ) : (
          <div style={styles.suppliersGrid}>
            {filteredSuppliers.map((item) => (
              <div key={item.supplier_id} style={{
                ...styles.supplierCard,
                borderLeft: item.name === 'None' ? '4px solid #94a3b8' : '4px solid #0ea5e9'
              }}>
                <div style={styles.supplierHeader}>
                  <p style={styles.supplierName}>{item.name}</p>
                  {item.name === 'None' && (
                    <span style={styles.defaultBadge}>Default</span>
                  )}
                </div>
                
                {item.contact_info && item.contact_info !== 'No contact information' && (
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Contact:</span>
                    <span style={styles.detailValue}>{item.contact_info}</span>
                  </div>
                )}
                
                {item.address && item.address !== 'No address' && (
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Address:</span>
                    <span style={styles.detailValue}>{item.address}</span>
                  </div>
                )}

                <div style={styles.actionButtons}>
                  {item.name !== 'None' ? (
                    <>
                      <button 
                        onClick={() => handleButtonClick(`edit-${item.supplier_id}`, () => handleEdit(item))} 
                        disabled={isLoading}
                        style={{
                          ...styles.editButton,
                          backgroundColor: clickedButtons[`edit-${item.supplier_id}`] ? '#ffffff' : '#0ea5e9',
                          color: clickedButtons[`edit-${item.supplier_id}`] ? '#0ea5e9' : '#ffffff',
                          border: clickedButtons[`edit-${item.supplier_id}`] ? '2px solid #0ea5e9' : 'none',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          opacity: isLoading ? 0.6 : 1,
                        }}
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => handleButtonClick(`delete-${item.supplier_id}`, () => handleDelete(item.supplier_id, item.name))} 
                        disabled={isLoading}
                        style={{
                          ...styles.deleteButton,
                          backgroundColor: clickedButtons[`delete-${item.supplier_id}`] ? '#ffffff' : '#ef4444',
                          color: clickedButtons[`delete-${item.supplier_id}`] ? '#ef4444' : '#ffffff',
                          border: clickedButtons[`delete-${item.supplier_id}`] ? '2px solid #ef4444' : 'none',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          opacity: isLoading ? 0.6 : 1,
                        }}
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <span style={styles.noneSupplierLabel}>
                      🔒 Default Supplier - Cannot be modified
                    </span>
                  )}
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
    border: '1px solid #e2e8f0',
  },

  formHeader: {
    fontSize: 'clamp(16px, 1.8vw, 18px)',
    fontWeight: 600,
    marginBottom: 'clamp(12px, 2vw, 16px)',
    color: '#1E293B',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  cancelButton: {
    backgroundColor: 'transparent',
    color: '#64748B',
    border: '1px solid #64748B',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
  },

  inputGroup: {
    marginBottom: 'clamp(12px, 2vw, 16px)',
  },

  label: {
    display: 'block',
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '8px',
  },

  input: {
    width: '100%',
    padding: 'clamp(10px, 2.5vw, 14px)',
    borderRadius: '12px',
    border: '1px solid #E5E7EB',
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    backgroundColor: '#F9FAFB',
    transition: 'border-color 0.2s ease',
  },

  saveButton: {
    padding: 'clamp(12px, 3vw, 16px)',
    borderRadius: '12px',
    width: '100%',
    border: 'none',
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    fontWeight: 600,
    transition: 'all 0.2s ease',
  },

  searchContainer: {
    display: 'flex',
    gap: '12px',
    marginBottom: 'clamp(16px, 2vw, 24px)',
    flexWrap: 'wrap',
  },

  searchInput: {
    flex: 1,
    padding: 'clamp(10px, 2.5vw, 14px)',
    borderRadius: '12px',
    border: '1px solid #E5E7EB',
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    minWidth: '250px',
  },

  refreshButton: {
    padding: 'clamp(10px, 2.5vw, 14px) 20px',
    borderRadius: '12px',
    border: '1px solid #0ea5e9',
    backgroundColor: 'transparent',
    color: '#0ea5e9',
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },

  listContainer: {
    marginBottom: 'clamp(16px, 2vw, 24px)',
  },

  sectionHeader: {
    marginBottom: 'clamp(12px, 2vw, 16px)',
  },

  sectionTitle: {
    fontSize: 'clamp(16px, 1.8vw, 18px)',
    fontWeight: 600,
    color: '#1E293B',
    margin: 0,
  },

  searchResultsText: {
    fontSize: '14px',
    fontWeight: 'normal',
    color: '#64748B',
    marginLeft: '8px',
  },

  helperText: {
    fontSize: 'clamp(12px, 1.2vw, 14px)',
    color: '#475569',
    marginBottom: 'clamp(12px, 2vw, 16px)',
    padding: '12px 16px',
    backgroundColor: '#f1f5f9',
    borderRadius: '8px',
    borderLeft: '4px solid #0ea5e9',
  },

  loadingState: {
    backgroundColor: '#fff',
    padding: '40px 20px',
    borderRadius: '12px',
    textAlign: 'center',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  },

  loadingText: {
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    color: '#64748B',
  },

  emptyState: {
    backgroundColor: '#fff',
    padding: 'clamp(40px, 8vw, 60px) 20px',
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

  suppliersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
  },

  supplierCard: {
    backgroundColor: '#fff',
    padding: 'clamp(14px, 3vw, 20px)',
    borderRadius: '12px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
    border: '1px solid #e2e8f0',
  },

  supplierHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },

  supplierName: {
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    fontWeight: 'bold',
    color: '#1E293B',
    margin: 0,
    flex: 1,
  },

  defaultBadge: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#475569',
    backgroundColor: '#f1f5f9',
    padding: '4px 8px',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
  },

  detailRow: {
    display: 'flex',
    marginBottom: '8px',
    gap: '8px',
  },

  detailLabel: {
    fontSize: 'clamp(12px, 1.2vw, 14px)',
    fontWeight: 500,
    color: '#64748B',
    minWidth: '70px',
  },

  detailValue: {
    fontSize: 'clamp(12px, 1.2vw, 14px)',
    color: '#374151',
    flex: 1,
  },

  actionButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'clamp(8px, 2vw, 12px)',
    marginTop: 'clamp(12px, 2vw, 16px)',
    alignItems: 'center',
  },

  editButton: {
    padding: 'clamp(6px, 2vw, 8px) clamp(12px, 3vw, 16px)',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    flex: '1 1 auto',
    minWidth: '80px',
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
    minWidth: '80px',
    fontSize: 'clamp(12px, 1.2vw, 14px)',
    fontWeight: 500,
    transition: 'all 0.2s ease',
  },

  noneSupplierLabel: {
    fontSize: 'clamp(12px, 1.2vw, 14px)',
    color: '#64748B',
    fontStyle: 'italic',
    padding: '8px 12px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    textAlign: 'center',
    width: '100%',
  },
};