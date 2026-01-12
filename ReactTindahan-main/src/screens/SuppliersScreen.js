import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { dataService } from '../services/DataService';

export default function SuppliersScreen({ userMode }) {
  const location = useLocation();
  const mode = userMode || location.state?.userMode || 'client';
  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const user = savedUser;

  const [suppliers, setSuppliers] = useState([]);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  
  // Recycle Bin states
  const [showRecycleBinModal, setShowRecycleBinModal] = useState(false);
  const [deletedSuppliers, setDeletedSuppliers] = useState([]);
  const [newDeletedItems, setNewDeletedItems] = useState(0);
  const [deletedItemsLoading, setDeletedItemsLoading] = useState(false);

  // ✅ Audit logging function - uses backup table
  const logAudit = async (action, details = {}) => {
    try {
      await dataService.add('backup', {
        user_id: user?.user_id,
        backup_name: `AUDIT_${action}`,
        backup_type: 'audit',
        created_at: new Date().toISOString(),
        schema_version: '6',
        details: JSON.stringify(details)
      });
    } catch (error) {
      console.error('Failed to log audit:', error);
    }
  };

  useEffect(() => {
    // ✅ Log to backup table
    logAudit('VIEW_SUPPLIERS_SCREEN', {
      user_id: user?.user_id,
      username: user?.username,
      page: 'suppliers'
    });
    
    fetchSuppliers();
    
    // Load deleted suppliers if user is owner
    if (user?.role === 'Owner') {
      fetchDeletedSuppliers();
    }
  }, []);

  // Fetch deleted suppliers for recycle bin - FIXED to use deleted_items table
  const fetchDeletedSuppliers = async () => {
    try {
      setDeletedItemsLoading(true);
      
      // ✅ FIXED: Get deleted items from deleted_items table instead of backup table
      const deletedItems = await dataService.getAll('deleted_items', {
        where: { entity_type: 'supplier' }
      });
      
      // Create a map of user IDs to usernames
      const userIds = [...new Set(deletedItems.map(item => item.deleted_by).filter(Boolean))];
      const userPromises = userIds.map(id => dataService.getById('users', id));
      const users = await Promise.all(userPromises);
      
      const userMap = {};
      users.forEach(user => {
        if (user) {
          userMap[user.user_id] = user.username;
        }
      });
      
      // Filter for pending deletion and add usernames
      const deletedSuppliersData = deletedItems
        .filter(item => 
          item.entity_type === 'supplier' && 
          !item.restored_at && 
          !item.confirmed_at
        )
        .map(item => ({
          ...item,
          username: item.deleted_by ? (userMap[item.deleted_by] || 'Unknown') : 'Unknown'
        }))
        .reverse();
      
      setDeletedSuppliers(deletedSuppliersData);
      
      // Count new items (deleted in last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const newDeletedCount = deletedSuppliersData
        .filter(item => new Date(item.deleted_at) > sevenDaysAgo)
        .length;
      
      setNewDeletedItems(newDeletedCount);
      
    } catch (error) {
      console.error('Error fetching deleted suppliers:', error);
    } finally {
      setDeletedItemsLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      
      // ✅ Log to backup table
      await logAudit('FETCH_SUPPLIERS', {
        user_id: user?.user_id
      });

      // Get suppliers using dataService
      const list = await dataService.getSuppliers();
      setSuppliers(list);
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
      setLoading(false);
      
      // ✅ Log to backup table
      await logAudit('FETCH_SUPPLIERS_ERROR', {
        error: err.message,
        user_id: user?.user_id
      });
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Name is required.');
      return;
    }
    
    try {
      setSaveLoading(true);
      
      if (editingId) {
        const oldSupplier = await dataService.getById('suppliers', editingId);
        
        // Update supplier
        await dataService.update('suppliers', editingId, { 
          name, 
          contact_info: contact, 
          address,
          updated_by: user?.username,
          updated_at: new Date().toISOString()
        });

        // ✅ Log to backup table
        await logAudit('UPDATE_SUPPLIER', {
          supplier_id: editingId,
          old_name: oldSupplier?.name,
          new_name: name,
          user_id: user?.user_id,
          username: user?.username
        });
      } else {
        // Add new supplier
        const supplierData = {
          name, 
          contact_info: contact, 
          address,
          created_by: user?.user_id || user?.username,
          created_at: new Date().toISOString()
        };

        const result = await dataService.add('suppliers', supplierData);
        
        const supplierId = result?.supplier_id || result?.id;

        // ✅ Log to backup table
        await logAudit('ADD_SUPPLIER', {
          supplier_id: supplierId,
          supplier_name: name,
          user_id: user?.user_id,
          username: user?.username
        });
      }
      
      // Reset form
      setName('');
      setContact('');
      setAddress('');
      setEditingId(null);
      
      // Refresh suppliers list
      await fetchSuppliers();
      
    } catch (err) {
      console.error('Error saving supplier:', err);
      
      // ✅ Log to backup table
      await logAudit('SAVE_SUPPLIER_ERROR', {
        error: err.message,
        supplier_name: name,
        editing: !!editingId,
        user_id: user?.user_id
      });
      
      alert('Error saving supplier. Please try again.');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleEdit = (supplier) => {
    // ✅ Log to backup table
    logAudit('VIEW_EDIT_SUPPLIER', {
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.name,
      user_id: user?.user_id
    });
    
    setEditingId(supplier.supplier_id);
    setName(supplier.name);
    setContact(supplier.contact_info || '');
    setAddress(supplier.address || '');
  };

  // Soft delete supplier (move to recycle bin)
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this supplier? This will be moved to recycle bin.')) return;
    
    try {
      // Get supplier details
      const supplier = await dataService.getById('suppliers', id);
      if (!supplier) return;
      
      // Check if supplier is referenced in other tables
      const resupplies = await dataService.getAll('resupplied_items', { 
        where: { supplier_id: id } 
      });
      
      const inventory = await dataService.getAll('inventory', { 
        where: { supplier_id: id } 
      });
      
      const stockCards = await dataService.getAll('stock_card', { 
        where: { supplier_id: id } 
      });
      
      if (resupplies.length > 0 || inventory.length > 0 || stockCards.length > 0) {
        if (!window.confirm(`This supplier is referenced in ${resupplies.length + inventory.length + stockCards.length} record(s). References will remain but show "Deleted Supplier". Continue?`)) {
          return;
        }
      }
      
      // ✅ FIXED: Store deleted supplier in deleted_items table instead of backup
      await dataService.add('deleted_items', {
        entity_type: 'supplier',
        entity_id: id,
        original_data: JSON.stringify(supplier),
        deleted_by: user?.user_id,
        deleted_at: new Date().toISOString(),
        restored_at: null,
        confirmed_at: null
      });
      
      // Now delete from original table
      await dataService.delete('suppliers', id);
      
      // ✅ Log to backup table for audit
      await logAudit('DELETE_SUPPLIER_TO_RECYCLE', {
        supplier_id: id,
        supplier_name: supplier.name,
        user_id: user?.user_id,
        username: user?.username
      });
      
      // Refresh data
      await fetchSuppliers();
      
      // Refresh deleted items count for owner
      if (user?.role === 'Owner') {
        await fetchDeletedSuppliers();
      }
      
      alert(`Supplier "${supplier.name}" moved to recycle bin. Only owner can restore or permanently delete.`);
    } catch (err) {
      console.error('Error deleting supplier:', err);
      
      // ✅ Log to backup table
      await logAudit('DELETE_SUPPLIER_ERROR', {
        error: err.message,
        supplier_id: id,
        user_id: user?.user_id
      });
      
      alert('Error deleting supplier. Please try again.');
    }
  };

  // Handle opening recycle bin modal
  const handleOpenRecycleBin = () => {
    fetchDeletedSuppliers();
    setShowRecycleBinModal(true);
  };

  // Handle restoring deleted supplier (owner only)
  const handleRestoreSupplier = async (deletedItem) => {
    const details = JSON.parse(deletedItem.original_data || '{}');
    
    if (!window.confirm(`Are you sure you want to restore supplier "${details.name}"?`)) return;
    
    try {
      // Restore supplier
      const supplierData = {
        ...details,
        created_at: new Date().toISOString(),
        created_by: `${user?.username} (restored)`
      };
      
      // Remove the deleted fields before restoring
      delete supplierData.deleted_at;
      delete supplierData.restored_at;
      delete supplierData.confirmed_at;
      
      const result = await dataService.add('suppliers', supplierData);
      
      // Update deleted_items record
      await dataService.update('deleted_items', deletedItem.deleted_id, {
        restored_at: new Date().toISOString(),
        restored_by: user?.username
      });
      
      // ✅ Log to backup table for audit
      await logAudit('RESTORE_SUPPLIER', {
        deleted_id: deletedItem.deleted_id,
        supplier_name: details.name,
        user_id: user?.user_id,
        username: user?.username
      });
      
      // Refresh data
      await fetchSuppliers();
      await fetchDeletedSuppliers();
      
      alert('Supplier restored successfully!');
      
    } catch (error) {
      console.error('Error restoring supplier:', error);
      alert('Error restoring supplier: ' + error.message);
    }
  };

  // Handle permanent deletion of supplier (owner only)
  const handlePermanentDeleteSupplier = async (deletedItem) => {
    const details = JSON.parse(deletedItem.original_data || '{}');
    
    if (!window.confirm(`Are you sure you want to permanently delete supplier "${details.name}"? This action cannot be undone.`)) return;
    
    try {
      // Mark as confirmed deletion in deleted_items table
      await dataService.update('deleted_items', deletedItem.deleted_id, {
        confirmed_at: new Date().toISOString()
      });
      
      // ✅ Log to backup table for audit
      await logAudit('PERMANENT_DELETE_SUPPLIER', {
        deleted_id: deletedItem.deleted_id,
        supplier_name: details.name,
        user_id: user?.user_id,
        username: user?.username
      });
      
      // Refresh deleted suppliers
      await fetchDeletedSuppliers();
      
      alert('Supplier permanently deleted.');
      
    } catch (error) {
      console.error('Error permanently deleting supplier:', error);
      alert('Error: ' + error.message);
    }
  };

  const handleCancelEdit = () => {
    // ✅ Log to backup table
    logAudit('CANCEL_EDIT_SUPPLIER', {
      supplier_id: editingId,
      user_id: user?.user_id
    });
    
    setName('');
    setContact('');
    setAddress('');
    setEditingId(null);
  };

  const handleSearch = (query) => {
    // ✅ Log to backup table
    if (query !== searchQuery) {
      logAudit('SEARCH_SUPPLIERS', {
        search_query: query,
        user_id: user?.user_id
      });
    }
    setSearchQuery(query);
  };

  const handleClearSearch = () => {
    // ✅ Log to backup table
    logAudit('CLEAR_SUPPLIER_SEARCH', {
      previous_query: searchQuery,
      user_id: user?.user_id
    });
    
    setSearchQuery('');
  };

  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (supplier.contact_info && supplier.contact_info.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (supplier.address && supplier.address.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Format date for recycle bin
  const formatRecycleDate = (dateString) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
      
      if (diffHours < 24) {
        return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
      } else {
        return date.toLocaleDateString();
      }
    } catch {
      return 'Unknown date';
    }
  };

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
            onChange={(e) => handleSearch(e.target.value)}
            disabled={loading}
          />
          {/* Owner-only recycle bin button */}
          {user?.role === 'Owner' && (
            <button 
              style={{
                ...styles.recycleBinButton,
                backgroundColor: newDeletedItems > 0 ? '#f59e0b' : '#6b7280',
                animation: newDeletedItems > 0 ? 'pulse 2s infinite' : 'none'
              }}
              onClick={handleOpenRecycleBin}
              title={`Recycle Bin (${newDeletedItems} new)`}
              disabled={loading}
            >
              🗑️ Recycle Bin
              {newDeletedItems > 0 && (
                <span style={styles.recycleBinBadge}>{newDeletedItems}</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Stats Section */}
      <div style={styles.statsContainer}>
        <div style={styles.statCard}>
          <div style={styles.statIcon}>🏢</div>
          <div>
            <p style={styles.statValue}>{suppliers.length}</p>
            <p style={styles.statLabel}>Total Suppliers</p>
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statIcon}>📞</div>
          <div>
            <p style={styles.statValue}>
              {suppliers.filter(s => s.contact_info && s.contact_info.trim()).length}
            </p>
            <p style={styles.statLabel}>With Contact Info</p>
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statIcon}>📍</div>
          <div>
            <p style={styles.statValue}>
              {suppliers.filter(s => s.address && s.address.trim()).length}
            </p>
            <p style={styles.statLabel}>With Address</p>
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statIcon}>🗑️</div>
          <div>
            <p style={styles.statValue}>{deletedSuppliers.length}</p>
            <p style={styles.statLabel}>Deleted Suppliers</p>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={styles.loadingMessage}>
          Loading suppliers...
        </div>
      )}

      {/* Form Section */}
      <div style={styles.formContainer}>
        <h3 style={styles.formHeader}>{editingId ? 'Edit Supplier' : 'Add New Supplier'}</h3>
        <input 
          placeholder="Supplier Name *" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          style={styles.input}
          disabled={saveLoading}
        />
        <input 
          placeholder="Contact Information (Phone/Email)" 
          value={contact} 
          onChange={(e) => setContact(e.target.value)} 
          style={styles.input}
          disabled={saveLoading}
        />
        <input 
          placeholder="Address" 
          value={address} 
          onChange={(e) => setAddress(e.target.value)} 
          style={styles.input}
          disabled={saveLoading}
        />
        <div style={styles.formButtons}>
          {editingId && (
            <button 
              onClick={handleCancelEdit} 
              style={styles.cancelButton}
              disabled={saveLoading}
            >
              Cancel Edit
            </button>
          )}
          <button 
            onClick={handleSave} 
            style={styles.saveButton}
            disabled={saveLoading || !name.trim()}
          >
            {saveLoading ? 'Saving...' : (editingId ? 'Update Supplier' : 'Add Supplier')}
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
              onClick={handleClearSearch}
              disabled={loading}
            >
              Clear Search
            </button>
          )}
        </div>
        {loading ? (
          <div style={styles.loadingState}>
            <div style={styles.loadingSpinner}></div>
            <p>Loading suppliers...</p>
          </div>
        ) : filteredSuppliers.length === 0 ? (
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
                  {item.created_at && (
                    <span style={styles.metaItem}>
                      Created: {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  )}
                  {item.created_by && (
                    <span style={styles.metaItem}>
                      By: {item.created_by}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recycle Bin Modal (Owner Only) */}
      {showRecycleBinModal && user?.role === 'Owner' && (
        <div style={styles.modalOverlay}>
          <div style={styles.largeModalContainer}>
            <div style={styles.modalHeaderRow}>
              <div>
                <h2 style={styles.modalHeader}>🗑️ Recycle Bin - Suppliers</h2>
                <p style={{ color: '#64748b', fontSize: '14px' }}>
                  Deleted suppliers waiting for owner confirmation
                </p>
              </div>
              <button 
                style={styles.closeButton} 
                onClick={() => setShowRecycleBinModal(false)}
              >
                ✕
              </button>
            </div>

            {/* Stats */}
            <div style={styles.recycleStats}>
              <div style={styles.recycleStat}>
                <span style={styles.recycleStatIcon}>🏢</span>
                <div>
                  <div style={styles.recycleStatValue}>{deletedSuppliers.length}</div>
                  <div style={styles.recycleStatLabel}>Deleted Suppliers</div>
                </div>
              </div>
              <div style={styles.recycleStat}>
                <span style={styles.recycleStatIcon}>🆕</span>
                <div>
                  <div style={styles.recycleStatValue}>{newDeletedItems}</div>
                  <div style={styles.recycleStatLabel}>New Items</div>
                </div>
              </div>
            </div>

            <div style={styles.modalContent}>
              <div style={styles.deletedSection}>
                <h3 style={styles.sectionSubheader}>
                  Deleted Suppliers ({deletedSuppliers.length})
                  {deletedSuppliers.some(s => !s.restored_at && !s.confirmed_at) && (
                    <span style={styles.pendingBadge}>Pending</span>
                  )}
                </h3>
                
                {deletedItemsLoading ? (
                  <div style={styles.loadingState}>
                    <div style={styles.loadingSpinner}></div>
                    <p>Loading deleted suppliers...</p>
                  </div>
                ) : deletedSuppliers.length === 0 ? (
                  <div style={styles.emptyState}>
                    <div style={styles.emptyStateIcon}>🏢</div>
                    <p style={styles.emptyStateText}>No deleted suppliers</p>
                  </div>
                ) : (
                  <div style={styles.tableContainer}>
                    <table style={styles.table}>
                      <thead>
                        <tr style={styles.tableHeader}>
                          <th style={styles.tableCell}>Supplier</th>
                          <th style={styles.tableCell}>Contact Info</th>
                          <th style={styles.tableCell}>Deleted By</th>
                          <th style={styles.tableCell}>Deleted</th>
                          <th style={styles.tableCell}>Status</th>
                          <th style={styles.tableCell}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deletedSuppliers.map((item) => {
                          let details = {};
                          try {
                            details = JSON.parse(item.original_data || '{}');
                          } catch {
                            details = { name: 'Unknown Supplier' };
                          }
                          
                          const isNew = new Date(item.deleted_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                          const isPending = !item.restored_at && !item.confirmed_at;
                          
                          return (
                            <tr key={item.deleted_id} style={{
                              ...styles.tableRow,
                              backgroundColor: isNew ? '#fffbeb' : 'transparent',
                              borderLeft: isNew ? '4px solid #f59e0b' : 'none'
                            }}>
                              <td style={styles.tableCell}>
                                <div>
                                  <strong>{details.name || 'Unknown Supplier'}</strong>
                                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                                    Address: {details.address || 'N/A'}
                                  </div>
                                </div>
                              </td>
                              <td style={styles.tableCell}>
                                {details.contact_info || 'N/A'}
                              </td>
                              <td style={styles.tableCell}>
                                {item.username || 'Unknown'}<br/>
                                <small style={{ color: '#94a3b8' }}>ID: {item.deleted_by || 'N/A'}</small>
                              </td>
                              <td style={styles.tableCell}>
                                {formatRecycleDate(item.deleted_at)}
                                {isNew && <span style={styles.newBadge}>NEW</span>}
                              </td>
                              <td style={styles.tableCell}>
                                {isPending ? (
                                  <span style={styles.pendingStatus}>⏳ Pending</span>
                                ) : item.restored_at ? (
                                  <span style={styles.restoredStatus}>🔄 Restored</span>
                                ) : (
                                  <span style={styles.confirmedStatus}>✅ Confirmed</span>
                                )}
                              </td>
                              <td style={styles.tableCell}>
                                <div style={styles.actionButtons}>
                                  {isPending && (
                                    <>
                                      <button 
                                        style={styles.restoreButton}
                                        onClick={() => handleRestoreSupplier(item)}
                                      >
                                        🔄 Restore
                                      </button>
                                      <button 
                                        style={styles.confirmDeleteButton}
                                        onClick={() => handlePermanentDeleteSupplier(item)}
                                      >
                                        ✅ Confirm Delete
                                      </button>
                                    </>
                                  )}
                                  {!isPending && (
                                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                                      {item.restored_at ? 'Restored' : 'Permanently deleted'}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div style={styles.modalButtons}>
              <button 
                style={styles.cancelButton} 
                onClick={() => setShowRecycleBinModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '16px',
    backgroundColor: '#F8FAFC',
    minHeight: '100vh',
    maxWidth: '100%',
    overflowX: 'hidden',
    boxSizing: 'border-box',
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
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    '@media (max-width: 768px)': {
      flexDirection: 'column',
      gap: '12px',
      alignItems: 'stretch'
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
    alignItems: 'center',
    flexWrap: 'wrap',
    width: '100%',
    maxWidth: '100%',
    '@media (max-width: 768px)': {
      flexDirection: 'column',
      alignItems: 'stretch'
    },
  },
  searchInput: {
    border: '1px solid #D1D5DB',
    borderRadius: '8px',
    padding: '10px 16px',
    backgroundColor: '#fff',
    width: '300px',
    fontSize: '14px',
    boxSizing: 'border-box',
    '@media (max-width: 768px)': {
      width: '100%',
      fontSize: '16px'
    },
  },
  recycleBinButton: {
    backgroundColor: '#6b7280',
    color: 'white',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'background-color 0.2s, transform 0.2s',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    '&:hover': {
      backgroundColor: '#4b5563',
      transform: 'translateY(-1px)'
    },
    '@media (max-width: 768px)': {
      width: '100%',
      justifyContent: 'center',
      fontSize: '13px',
      padding: '12px 16px'
    }
  },
  recycleBinBadge: {
    backgroundColor: '#ef4444',
    color: 'white',
    fontSize: '12px',
    padding: '2px 6px',
    borderRadius: '10px',
    marginLeft: '4px',
    fontWeight: 'bold'
  },
  statsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    '@media (max-width: 768px)': {
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '12px'
    },
    '@media (max-width: 480px)': {
      gridTemplateColumns: '1fr',
    },
  },
  statCard: {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    border: '1px solid #E2E8F0',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    boxSizing: 'border-box',
    overflow: 'hidden',
    '@media (max-width: 768px)': {
      padding: '16px',
      gap: '12px'
    },
  },
  statIcon: {
    fontSize: '32px',
    width: '48px',
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: '8px',
    flexShrink: 0,
    '@media (max-width: 768px)': {
      fontSize: '24px',
      width: '40px',
      height: '40px',
    },
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#111827',
    margin: 0,
    lineHeight: '1',
    '@media (max-width: 768px)': {
      fontSize: '20px',
    },
  },
  statLabel: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
    marginTop: '4px',
    '@media (max-width: 768px)': {
      fontSize: '12px',
    },
  },
  formContainer: {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '12px',
    marginBottom: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
    '@media (max-width: 768px)': {
      padding: '16px',
    },
  },
  formHeader: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '16px',
    color: '#1E293B',
    '@media (max-width: 768px)': {
      fontSize: '16px'
    }
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
      fontSize: '16px',
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
    '@media (max-width: 768px)': {
      width: '100%'
    }
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
    '@media (max-width: 768px)': {
      width: '100%'
    }
  },
  listContainer: {
    marginBottom: '24px',
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box'
  },
  listHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    flexWrap: 'wrap',
    gap: '8px',
    width: '100%',
    maxWidth: '100%'
  },
  sectionHeader: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1E293B',
    margin: 0,
    '@media (max-width: 768px)': {
      fontSize: '16px'
    }
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
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    '@media (max-width: 768px)': {
      gridTemplateColumns: '1fr',
      gap: '12px'
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
    boxSizing: 'border-box',
    overflow: 'hidden',
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
    width: '100%'
  },
  supplierName: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1E293B',
    margin: 0,
    flex: '1',
    minWidth: '150px',
    wordBreak: 'break-word'
  },
  supplierActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
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
    width: '100%',
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
    flexShrink: 0
  },
  detailValue: {
    fontSize: '14px',
    color: '#475569',
    flex: '1',
    wordBreak: 'break-word'
  },
  supplierMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '12px',
    borderTop: '1px solid #F1F5F9',
    fontSize: '12px',
    color: '#94A3B8',
    flexWrap: 'wrap',
    gap: '8px',
    width: '100%'
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0
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
    flexShrink: 0,
    '&:hover': {
      backgroundColor: '#2563EB',
    },
    '@media (max-width: 480px)': {
      flex: '1',
      minWidth: 'auto'
    }
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
    flexShrink: 0,
    '&:hover': {
      backgroundColor: '#FEE2E2',
    },
    '@media (max-width: 480px)': {
      flex: '1',
      minWidth: 'auto'
    }
  },
  emptyState: {
    backgroundColor: '#fff',
    padding: '40px 20px',
    borderRadius: '12px',
    textAlign: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box'
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
    boxSizing: 'border-box'
  },
  largeModalContainer: {
    backgroundColor: '#fff',
    padding: '24px',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
    boxSizing: 'border-box',
    '@media (max-width: 768px)': {
      padding: '16px',
      maxWidth: '95%',
    }
  },
  modalHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '12px',
    width: '100%'
  },
  modalHeader: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#1e293b',
    margin: 0,
    '@media (max-width: 768px)': {
      fontSize: '18px'
    }
  },
  closeButton: {
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '20px',
    color: '#64748b',
    cursor: 'pointer',
    padding: '4px 8px',
    '&:hover': {
      color: '#1e293b'
    }
  },
  recycleStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    width: '100%',
    boxSizing: 'border-box',
    '@media (max-width: 768px)': {
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '12px',
      padding: '12px'
    }
  },
  recycleStat: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    boxSizing: 'border-box'
  },
  recycleStatIcon: {
    fontSize: '24px',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: '8px',
    flexShrink: 0
  },
  recycleStatValue: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#1e293b',
    lineHeight: '1'
  },
  recycleStatLabel: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '4px'
  },
  deletedSection: {
    marginBottom: '32px',
    width: '100%'
  },
  sectionSubheader: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '2px solid #e2e8f0',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    '@media (max-width: 768px)': {
      fontSize: '16px'
    }
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    fontSize: '12px',
    padding: '4px 8px',
    borderRadius: '4px',
    fontWeight: '500',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px'
  },
  newBadge: {
    backgroundColor: '#f59e0b',
    color: 'white',
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    marginLeft: '8px',
    fontWeight: 'bold'
  },
  loadingState: {
    textAlign: 'center',
    padding: '40px 20px',
    width: '100%'
  },
  loadingSpinner: {
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #4f46e5',
    borderRadius: '50%',
    width: '40px',
    height: '40px',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 16px auto'
  },
  tableContainer: {
    overflowX: 'auto',
    marginBottom: '16px',
    width: '100%',
    maxWidth: '100%',
    WebkitOverflowScrolling: 'touch',
    msOverflowStyle: '-ms-autohiding-scrollbar'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
    minWidth: '800px',
    '@media (max-width: 768px)': {
      minWidth: '100%',
      fontSize: '13px'
    }
  },
  tableHeader: {
    backgroundColor: '#f8fafc',
    borderBottom: '2px solid #e2e8f0'
  },
  tableRow: {
    borderBottom: '1px solid #e2e8f0',
    '&:hover': {
      backgroundColor: '#f8fafc'
    }
  },
  tableCell: {
    padding: '12px 16px',
    textAlign: 'left',
    verticalAlign: 'top',
    '@media (max-width: 768px)': {
      padding: '10px 12px'
    }
  },
  pendingStatus: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    whiteSpace: 'nowrap'
  },
  restoredStatus: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    whiteSpace: 'nowrap'
  },
  confirmedStatus: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    whiteSpace: 'nowrap'
  },
  actionButtons: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap'
  },
  restoreButton: {
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'background-color 0.2s',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    '&:hover': {
      backgroundColor: '#059669'
    }
  },
  confirmDeleteButton: {
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'background-color 0.2s',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    '&:hover': {
      backgroundColor: '#dc2626'
    }
  },
  modalContent: {
    marginBottom: '20px',
    width: '100%'
  },
  modalButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    paddingTop: '20px',
    borderTop: '1px solid #e2e8f0',
    '@media (max-width: 768px)': {
      flexDirection: 'column'
    }
  }
};

// Add CSS animations
const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerHTML = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
  }
`;
document.head.appendChild(styleSheet);