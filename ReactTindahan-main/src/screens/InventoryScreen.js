import React, { useEffect, useState } from 'react'; 
import { db } from '../db';

export default function InventoryScreen({ userMode }) {
  const mode = userMode || 'client';
  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const user = savedUser;

  const [inventory, setInventory] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newItem, setNewItem] = useState({ 
    name: '', 
    sku: '', 
    unit_price: '', 
    base_unit: 'pcs',
    category_id: null,
    threshold: 5,
  });
  const [editingItem, setEditingItem] = useState(null);
  const [currentStockItem, setCurrentStockItem] = useState(null);
  const [supplierDetails, setSupplierDetails] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    totalProducts: 0,
    lowStock: 0,
    expiringSoon: 0,
    inventoryValue: 0
  });
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  
  // Audit logs states for merged view
  const [productAuditLogs, setProductAuditLogs] = useState({});
  const [stockCardAuditLogs, setStockCardAuditLogs] = useState([]);
  const [showAuditForProduct, setShowAuditForProduct] = useState(null);
  
  // Recycle Bin states
  const [showRecycleBinModal, setShowRecycleBinModal] = useState(false);
  const [deletedProducts, setDeletedProducts] = useState([]);
  const [deletedCategories, setDeletedCategories] = useState([]);
  const [newDeletedItems, setNewDeletedItems] = useState(0);
  const [deletedItemsLoading, setDeletedItemsLoading] = useState(false);
  
  const [barcode, setBarcode] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);

  // ✅ FIXED Audit logging function - uses existing created_by/created_at
  const logAudit = async (action, details = {}) => {
    try {
      // Simply log to console - no separate audits table needed
      console.log(`[AUDIT] ${action}`, {
        user_id: user?.user_id,
        username: user?.username,
        details,
        timestamp: new Date().toISOString()
      });
      
      return null;
    } catch (error) {
      console.error('Failed to log audit:', error);
      return null;
    }
  };

  // Fetch audit logs for a specific product - UPDATED to use existing data
  const fetchProductAuditLogs = async (productId) => {
    try {
      // Get product creation info
      const product = await db.products.get(productId);
      if (!product) return;
      
      // Get all stock card records for this product
      const stockRecords = await db.stock_card
        .where('product_id')
        .equals(productId)
        .reverse()
        .limit(10)
        .toArray();
      
      // Format as audit logs using existing data
      const logs = stockRecords.map(record => ({
        action: record.transaction_type || 'STOCK_TRANSACTION',
        username: record.created_by || 'System',
        timestamp: record.transaction_date || record.created_at,
        details: JSON.stringify({
          quantity: record.quantity,
          unit_cost: record.unit_cost,
          supplier_id: record.supplier_id
        })
      }));
      
      // Add product creation as first audit log
      if (product.created_at) {
        logs.unshift({
          action: 'CREATE_PRODUCT',
          username: product.created_by || 'System',
          timestamp: product.created_at,
          details: JSON.stringify({
            product_name: product.name,
            sku: product.sku,
            unit_price: product.unit_price
          })
        });
      }
      
      setProductAuditLogs(prev => ({
        ...prev,
        [productId]: logs
      }));
    } catch (error) {
      console.error('Error fetching product audit logs:', error);
    }
  };

  // Fetch audit logs for stock card - UPDATED
  const fetchStockCardAuditLogs = async (productId) => {
    try {
      const logs = await db.stock_card
        .where('product_id')
        .equals(productId)
        .reverse()
        .limit(20)
        .toArray();
      
      // Format as audit logs
      const auditLogs = logs.map(record => ({
        action: record.transaction_type || 'STOCK_TRANSACTION',
        username: record.created_by || 'System',
        timestamp: record.transaction_date || record.created_at,
        details: JSON.stringify({
          quantity: record.quantity,
          supplier_id: record.supplier_id,
          unit_cost: record.unit_cost
        })
      }));
      
      setStockCardAuditLogs(auditLogs);
    } catch (error) {
      console.error('Error fetching stock card audit logs:', error);
    }
  };

  // Fetch deleted items for recycle bin
  const fetchDeletedItems = async () => {
    try {
      setDeletedItemsLoading(true);
      
      // For now, we'll use the backup table to store deleted items
      // In a real implementation, you'd have a dedicated deleted_items table
      const deletedProductsData = await db.backup
        .where('backup_type')
        .equals('deleted_product')
        .filter(item => !item.restored_at && !item.confirmed_at)
        .reverse()
        .toArray();
      
      const deletedCategoriesData = await db.backup
        .where('backup_type')
        .equals('deleted_category')
        .filter(item => !item.restored_at && !item.confirmed_at)
        .reverse()
        .toArray();
      
      setDeletedProducts(deletedProductsData);
      setDeletedCategories(deletedCategoriesData);
      
      // Count new items (deleted in last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const newDeletedCount = [...deletedProductsData, ...deletedCategoriesData]
        .filter(item => new Date(item.created_at) > sevenDaysAgo)
        .length;
      
      setNewDeletedItems(newDeletedCount);
      
    } catch (error) {
      console.error('Error fetching deleted items:', error);
    } finally {
      setDeletedItemsLoading(false);
    }
  };

  useEffect(() => {
    // ✅ FIXED: No longer tries to write to non-existent audits table
    console.log(`[AUDIT] VIEW_INVENTORY_SCREEN`, {
      user_id: user?.user_id,
      username: user?.username
    });

    prepopulateCategories();
    fetchInventory();
    fetchSuppliers();
    fetchCategories();
    
    // Load deleted items if user is owner
    if (user?.role === 'Owner') {
      fetchDeletedItems();
    }

    const handleGlobalScan = (e) => {
      if (e.key === 'Enter' && barcode.trim()) {
        // ✅ FIXED: Just log to console
        console.log(`[AUDIT] SEARCH_BARCODE`, {
          barcode: barcode.trim(),
          user_id: user?.user_id
        });
        
        setSearchQuery(barcode.trim());
        setBarcode('');
      } else if (e.key.length === 1) {
        setBarcode(prev => prev + e.key);
      }
    };

    window.addEventListener('keydown', handleGlobalScan);
    return () => window.removeEventListener('keydown', handleGlobalScan);
  }, [barcode]);

  // Preload audit logs for all products after inventory is fetched
  useEffect(() => {
    if (inventory.length > 0) {
      inventory.forEach(item => {
        fetchProductAuditLogs(item.product_id);
      });
    }
  }, [inventory]);

  const prepopulateCategories = async () => {
    try {
      const count = await db.categories.count();
      if (count === 0) {
        const defaultCategories = [
          'Beverages',
          'Bakery',
          'Dairy & Eggs',
          'Meat & Poultry',
          'Seafood',
          'Fruits',
          'Vegetables',
          'Pantry & Dry Goods',
          'Snacks & Confectionery',
          'Frozen Foods',
          'Canned & Packaged Foods',
          'Condiments & Spices',
          'Baking Supplies',
          'Household & Cleaning',
          'Personal Care'
        ];
        
        // ✅ FIXED: Include created_by and created_at
        await Promise.all(defaultCategories.map(name => db.categories.add({ 
          name,
          created_by: user?.username || 'System',
          created_at: new Date().toISOString()
        })));
        
        // ✅ FIXED: Just log to console
        console.log(`[AUDIT] CREATE_DEFAULT_CATEGORIES`, {
          count: defaultCategories.length,
          user_id: user?.user_id
        });
        
        fetchCategories();
      }
    } catch (err) {
      console.error('Error prepopulating categories:', err);
      // ✅ FIXED: Just log to console
      console.error(`[AUDIT] PREPOPULATE_CATEGORIES_ERROR`, {
        error: err.message,
        user_id: user?.user_id
      });
    }
  };

  const fetchCategories = async () => {
    try {
      const list = await db.categories.toArray();
      setCategories(list);
    } catch (err) {
      console.error('Error fetching categories:', err);
      // ✅ FIXED: Just log to console
      console.error(`[AUDIT] FETCH_CATEGORIES_ERROR`, {
        error: err.message,
        user_id: user?.user_id
      });
    }
  };

  const fetchInventory = async () => {
    try {
      // ✅ FIXED: Just log to console
      console.log(`[AUDIT] FETCH_INVENTORY`, {
        user_id: user?.user_id,
        timestamp: new Date().toISOString()
      });

      const products = await db.products.toArray();
      const inventoryRecords = await db.inventory.toArray();
      const supplierList = await db.suppliers.toArray();

      const items = products.map((p) => {
        const invRecord = inventoryRecords.find(inv => inv.product_id === p.product_id);
        const invQuantity = invRecord ? invRecord.quantity : 0;

        return {
          ...p,
          quantity: invQuantity,
          threshold: invRecord?.threshold || p.threshold || 5,
          suppliers: invRecord
            ? [ {
                supplier_id: invRecord.supplier_id,
                name: (supplierList.find(s => s.supplier_id === invRecord.supplier_id)?.name) || 'N/A',
                quantity: invRecord.quantity,
                expiration_date: invRecord.expiration_date || 'N/A',
                unit_cost: 0, 
              } ]
            : [],
        };
      });

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
      // ✅ FIXED: Just log to console
      console.error(`[AUDIT] FETCH_INVENTORY_ERROR`, {
        error: err.message,
        user_id: user?.user_id
      });
    }
  };

  const fetchSuppliers = async () => {
    try {
      const list = await db.suppliers.toArray();
      setSuppliers(list);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
      // ✅ FIXED: Just log to console
      console.error(`[AUDIT] FETCH_SUPPLIERS_ERROR`, {
        error: err.message,
        user_id: user?.user_id
      });
    }
  };

  // --- Product handlers ---
  const handleAddItem = async () => {
    if (!newItem.name || !newItem.unit_price || !newItem.base_unit)
      return alert('Please fill out all required fields.');

    try {
      const existing = await db.products.where('sku').equals(newItem.sku).first();
      if (existing) {
        alert('A product with this SKU already exists.');
        // ✅ FIXED: Just log to console
        console.log(`[AUDIT] ADD_PRODUCT_DUPLICATE_SKU`, {
          sku: newItem.sku,
          user_id: user?.user_id
        });
        return;
      }

      const productId = await db.products.add({
        sku: newItem.sku || null,
        name: newItem.name,
        unit_price: parseFloat(newItem.unit_price),
        base_unit: newItem.base_unit,
        category_id: newItem.category_id || null,
        // ✅ ADDED: Include created_by and created_at for audit trail
        created_by: user?.username,
        created_at: new Date().toISOString()
      });

      await db.inventory.add({
        product_id: productId,
        supplier_id: null,
        quantity: 0,
        threshold: parseInt(newItem.threshold) || 5,
        updated_by: user?.username,
        updated_at: new Date().toISOString()
      });

      // ✅ FIXED: Just log to console
      console.log(`[AUDIT] ADD_PRODUCT`, {
        product_id: productId,
        product_name: newItem.name,
        sku: newItem.sku,
        user_id: user?.user_id,
        username: user?.username
      });

      setShowAddModal(false);
      setNewItem({ 
        name: '', 
        sku: '', 
        unit_price: '', 
        base_unit: 'pcs',
        category_id: null,
        threshold: 5,
      });
      fetchInventory();
    } catch (err) {
      console.error('Error adding product:', err);
      // ✅ FIXED: Just log to console
      console.error(`[AUDIT] ADD_PRODUCT_ERROR`, {
        error: err.message,
        product_data: newItem,
        user_id: user?.user_id
      });
    }
  };

  const handleEditItem = (item) => {
    // ✅ FIXED: Just log to console
    console.log(`[AUDIT] VIEW_EDIT_PRODUCT`, {
      product_id: item.product_id,
      product_name: item.name,
      user_id: user?.user_id
    });
    
    setEditingItem(item);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    try {
      const oldProduct = await db.products.get(editingItem.product_id);
      
      await db.products.update(editingItem.product_id, {
        sku: editingItem.sku,
        name: editingItem.name,
        unit_price: parseFloat(editingItem.unit_price),
        base_unit: editingItem.base_unit,
        category_id: editingItem.category_id || null,
      });

      await db.inventory.where({ product_id: editingItem.product_id }).modify(inv => {
        inv.threshold = parseInt(editingItem.threshold) || 5;
        inv.updated_by = user?.username;
        inv.updated_at = new Date().toISOString();
      });

      // ✅ FIXED: Just log to console
      console.log(`[AUDIT] UPDATE_PRODUCT`, {
        product_id: editingItem.product_id,
        product_name: editingItem.name,
        user_id: user?.user_id,
        username: user?.username
      });

      setShowEditModal(false);
      setEditingItem(null);
      fetchInventory();
    } catch (err) {
      console.error('Error saving product edit:', err);
      // ✅ FIXED: Just log to console
      console.error(`[AUDIT] UPDATE_PRODUCT_ERROR`, {
        error: err.message,
        product_id: editingItem.product_id,
        user_id: user?.user_id
      });
    }
  };

  // Soft delete product (move to recycle bin)
  const handleDeleteItem = async () => {
    if (!editingItem) return;
    if (!window.confirm(`Are you sure you want to delete "${editingItem.name}"? This item will be moved to recycle bin.`)) return;

    try {
      const productId = editingItem.product_id;
      const productName = editingItem.name;
      
      // Store the deleted product in backup table for recycle bin
      await db.backup.add({
        user_id: user?.user_id,
        username: user?.username,
        backup_name: `DELETED_PRODUCT_${productName}`,
        backup_type: 'deleted_product',
        created_at: new Date().toISOString(),
        schema_version: '5',
        details: JSON.stringify(editingItem),
        restored_at: null,
        confirmed_at: null,
        original_id: productId
      });
      
      // Now delete from original tables
      await db.products.delete(productId);
      await db.inventory.where('product_id').equals(productId).delete();
      await db.resupplied_items.where('product_id').equals(productId).delete();
      await db.stock_card.where('product_id').equals(productId).delete();
      await db.sale_items.where('product_id').equals(productId).delete();

      // ✅ FIXED: Just log to console
      console.log(`[AUDIT] DELETE_PRODUCT_TO_RECYCLE`, {
        product_id: productId,
        product_name: productName,
        sku: editingItem.sku,
        user_id: user?.user_id,
        username: user?.username,
        timestamp: new Date().toISOString()
      });

      setShowEditModal(false);
      setEditingItem(null);
      fetchInventory();
      
      // Refresh deleted items count for owner
      if (user?.role === 'Owner') {
        fetchDeletedItems();
      }
      
      alert(`Product "${productName}" moved to recycle bin. Only owner can restore or permanently delete.`);
    } catch (err) {
      console.error('Error deleting product:', err);
      // ✅ FIXED: Just log to console
      console.error(`[AUDIT] DELETE_PRODUCT_ERROR`, {
        error: err.message,
        product_id: editingItem.product_id,
        user_id: user?.user_id
      });
    }
  };

  const handleSupplierDetails = async (item) => {
    try {
      // ✅ FIXED: Just log to console
      console.log(`[AUDIT] VIEW_STOCK_CARD`, {
        product_id: item.product_id,
        product_name: item.name,
        user_id: user?.user_id,
        username: user?.username
      });
      
      // Set the current item for stock card display
      setCurrentStockItem(item);
      
      // Fetch all stock card records for this product
      const stockRecords = await db.stock_card
        .where('product_id')
        .equals(item.product_id)
        .sortBy('transaction_date');

      // Also fetch audit logs for stock card
      await fetchStockCardAuditLogs(item.product_id);

      // If no records found, show empty state
      if (stockRecords.length === 0) {
        setSupplierDetails([]);
        setShowSupplierModal(true);
        return;
      }

      // Fetch all supplier info
      const supplierInfo = await Promise.all(stockRecords.map(async (record) => {
        const supplier = record.supplier_id 
          ? await db.suppliers.get(record.supplier_id) 
          : null;
        
        // Determine if it's stock-in or stock-out
        const isStockIn = record.quantity > 0;
        const isStockOut = record.quantity < 0;
        
        return {
          name: supplier?.name || 'N/A',
          transaction_date: record.transaction_date || record.resupply_date || 'N/A',
          quantity: record.quantity || 0, // Keep original signed quantity
          stock_in: isStockIn ? record.quantity : 0,
          stock_out: isStockOut ? Math.abs(record.quantity) : 0,
          unit: record.unit_type || item.base_unit || 'pcs',
          unit_cost: record.unit_cost || 0,
          unit_price: record.unit_price || item.unit_price || 0,
          expiration_date: record.expiration_date || 'N/A',
          transaction_type: record.transaction_type || (isStockIn ? 'RESUPPLY' : 'SALE'),
          running_balance: record.running_balance || 0,
          supplier_id: record.supplier_id,
          // ✅ ADDED: Include created_by for audit trail
          created_by: record.created_by || 'System'
        };
      }));

      setSupplierDetails(supplierInfo);
      setShowSupplierModal(true);
    } catch (err) {
      console.error('Error fetching supplier details:', err);
      // ✅ FIXED: Just log to console
      console.error(`[AUDIT] VIEW_STOCK_CARD_ERROR`, {
        error: err.message,
        product_id: item.product_id,
        user_id: user?.user_id
      });
      alert('Error loading stock card data');
    }
  };

  // Show audit logs for a specific product
  const handleShowProductAudit = async (productId) => {
    setShowAuditForProduct(productId);
    await fetchProductAuditLogs(productId);
  };

  // --- Category handlers ---
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      alert("Enter a category name.");
      return;
    }
    
    try {
      const categoryId = await db.categories.add({ 
        name: newCategoryName.trim(),
        // ✅ ADDED: Include created_by and created_at for audit trail
        created_by: user?.username,
        created_at: new Date().toISOString()
      });
      
      // ✅ FIXED: Just log to console
      console.log(`[AUDIT] ADD_CATEGORY`, {
        category_id: categoryId,
        category_name: newCategoryName.trim(),
        user_id: user?.user_id,
        username: user?.username
      });
      
      setNewCategoryName('');
      setShowCategoryModal(false);
      fetchCategories();
    } catch (err) {
      console.error("Error adding category:", err);
      // ✅ FIXED: Just log to console
      console.error(`[AUDIT] ADD_CATEGORY_ERROR`, {
        error: err.message,
        category_name: newCategoryName.trim(),
        user_id: user?.user_id
      });
    }
  };

  const handleEditCategory = (category) => {
    // ✅ FIXED: Just log to console
    console.log(`[AUDIT] VIEW_EDIT_CATEGORY`, {
      category_id: category.category_id,
      category_name: category.name,
      user_id: user?.user_id
    });
    
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async () => {
    if (!newCategoryName.trim()) {
      alert("Enter a category name.");
      return;
    }
    
    try {
      const oldCategory = await db.categories.get(editingCategory.category_id);
      
      await db.categories.update(editingCategory.category_id, { 
        name: newCategoryName.trim() 
      });
      
      // ✅ FIXED: Just log to console
      console.log(`[AUDIT] UPDATE_CATEGORY`, {
        category_id: editingCategory.category_id,
        category_name: newCategoryName.trim(),
        user_id: user?.user_id,
        username: user?.username
      });
      
      setEditingCategory(null);
      setNewCategoryName('');
      setShowCategoryModal(false);
      fetchCategories();
    } catch (err) {
      console.error("Error editing category:", err);
      // ✅ FIXED: Just log to console
      console.error(`[AUDIT] UPDATE_CATEGORY_ERROR`, {
        error: err.message,
        category_id: editingCategory.category_id,
        user_id: user?.user_id
      });
    }
  };

  // Soft delete category (move to recycle bin)
  const handleDeleteCategory = async (category) => {
    if (!window.confirm(`Are you sure you want to delete category "${category.name}"? This will be moved to recycle bin.`)) return;
    
    try {
      // Check if any products use this category
      const productsWithCategory = await db.products
        .where('category_id')
        .equals(category.category_id)
        .toArray();
      
      if (productsWithCategory.length > 0) {
        if (!window.confirm(`This category is used by ${productsWithCategory.length} product(s). Products will lose their category. Continue?`)) {
          return;
        }
      }
      
      // Store deleted category in backup table
      await db.backup.add({
        user_id: user?.user_id,
        username: user?.username,
        backup_name: `DELETED_CATEGORY_${category.name}`,
        backup_type: 'deleted_category',
        created_at: new Date().toISOString(),
        schema_version: '5',
        details: JSON.stringify(category),
        restored_at: null,
        confirmed_at: null,
        original_id: category.category_id
      });
      
      // Delete category and update products
      await db.categories.delete(category.category_id);
      await db.products
        .where('category_id')
        .equals(category.category_id)
        .modify({ category_id: null });
      
      // ✅ FIXED: Just log to console
      console.log(`[AUDIT] DELETE_CATEGORY_TO_RECYCLE`, {
        category_id: category.category_id,
        category_name: category.name,
        user_id: user?.user_id,
        username: user?.username
      });
      
      fetchCategories();
      
      // Refresh deleted items count for owner
      if (user?.role === 'Owner') {
        fetchDeletedItems();
      }
      
      alert(`Category "${category.name}" moved to recycle bin.`);
    } catch (err) {
      console.error("Error deleting category:", err);
      // ✅ FIXED: Just log to console
      console.error(`[AUDIT] DELETE_CATEGORY_ERROR`, {
        error: err.message,
        category_id: category.category_id,
        user_id: user?.user_id
      });
    }
  };

  const handleOpenAddModal = () => {
    // ✅ FIXED: Just log to console
    console.log(`[AUDIT] OPEN_ADD_PRODUCT_MODAL`, {
      user_id: user?.user_id
    });
    setShowAddModal(true);
  };

  const handleOpenCategoryModal = () => {
    // ✅ FIXED: Just log to console
    console.log(`[AUDIT] OPEN_CATEGORY_MODAL`, {
      user_id: user?.user_id,
      action: editingCategory ? 'edit' : 'add'
    });
    setEditingCategory(null);
    setNewCategoryName('');
    setShowCategoryModal(true);
  };

  const handleSearch = (query) => {
    // ✅ FIXED: Just log to console
    if (query !== searchQuery) {
      console.log(`[AUDIT] SEARCH_INVENTORY`, {
        search_query: query,
        user_id: user?.user_id
      });
    }
    setSearchQuery(query);
  };

  const handleToggleLowStock = () => {
    // ✅ FIXED: Just log to console
    console.log(`[AUDIT] TOGGLE_LOW_STOCK_FILTER`, {
      show_low_stock: !showLowStockOnly,
      user_id: user?.user_id
    });
    setShowLowStockOnly(!showLowStockOnly);
  };

  // Handle opening recycle bin modal
  const handleOpenRecycleBin = () => {
    fetchDeletedItems();
    setShowRecycleBinModal(true);
  };

  // Handle restoring deleted item (owner only)
  const handleRestoreItem = async (deletedItem) => {
    if (!window.confirm(`Are you sure you want to restore "${deletedItem.backup_name.replace('DELETED_', '').replace('PRODUCT_', '').replace('CATEGORY_', '')}"?`)) return;
    
    try {
      const details = JSON.parse(deletedItem.details);
      
      if (deletedItem.backup_type === 'deleted_product') {
        // Restore product
        const productId = await db.products.add({
          ...details,
          created_at: new Date().toISOString(),
          created_by: `${deletedItem.username} (restored)`
        });
        
        // Restore inventory entry
        await db.inventory.add({
          product_id: productId,
          supplier_id: null,
          quantity: 0,
          threshold: details.threshold || 5,
          updated_by: user?.username,
          updated_at: new Date().toISOString()
        });
        
        // Update backup record
        await db.backup.update(deletedItem.backup_id, {
          restored_at: new Date().toISOString(),
          restored_by: user?.username
        });
        
        fetchInventory();
        
      } else if (deletedItem.backup_type === 'deleted_category') {
        // Restore category
        const categoryId = await db.categories.add({
          ...details,
          created_at: new Date().toISOString(),
          created_by: `${deletedItem.username} (restored)`
        });
        
        // Update backup record
        await db.backup.update(deletedItem.backup_id, {
          restored_at: new Date().toISOString(),
          restored_by: user?.username
        });
        
        fetchCategories();
      }
      
      // Refresh deleted items
      fetchDeletedItems();
      alert('Item restored successfully!');
      
    } catch (error) {
      console.error('Error restoring item:', error);
      alert('Error restoring item: ' + error.message);
    }
  };

  // Handle permanent deletion (owner only)
  const handlePermanentDelete = async (deletedItem) => {
    const itemName = deletedItem.backup_name.replace('DELETED_', '').replace('PRODUCT_', '').replace('CATEGORY_', '');
    
    if (!window.confirm(`Are you sure you want to permanently delete "${itemName}"? This action cannot be undone.`)) return;
    
    try {
      // Mark as confirmed deletion
      await db.backup.update(deletedItem.backup_id, {
        confirmed_at: new Date().toISOString(),
        confirmed_by: user?.username
      });
      
      // Refresh deleted items
      fetchDeletedItems();
      alert('Item permanently deleted.');
      
    } catch (error) {
      console.error('Error permanently deleting item:', error);
      alert('Error: ' + error.message);
    }
  };

  // Fixed search logic to include product names
  const filteredInventory = inventory.filter((item) => {
    if (showLowStockOnly && item.quantity > (item.threshold || 5)) return false;
    
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    
    // Search in product name
    if (item.name?.toLowerCase().includes(q)) return true;
    
    // Search in SKU/barcode
    if (item.sku?.toLowerCase().includes(q)) return true;
    
    // Search in category name
    const categoryName = categories.find(c => c.category_id === item.category_id)?.name?.toLowerCase();
    if (categoryName?.includes(q)) return true;
    
    // Search in supplier names
    if (item.suppliers?.some(s => s.name?.toLowerCase().includes(q))) return true;
    
    return false;
  });

  // Get action icon
  const getActionIcon = (action) => {
    if (action.includes('ADD')) return '➕';
    if (action.includes('UPDATE') || action.includes('EDIT')) return '✏️';
    if (action.includes('DELETE')) return '🗑️';
    if (action.includes('VIEW')) return '👁️';
    if (action.includes('FETCH')) return '📋';
    if (action.includes('SEARCH')) return '🔍';
    if (action.includes('SCAN')) return '📷';
    if (action.includes('STOCK')) return '📊';
    if (action.includes('ERROR')) return '❌';
    return '📝';
  };

  // Format date for display
  const formatAuditDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Parse details JSON
  const parseAuditDetails = (details) => {
    try {
      return JSON.parse(details);
    } catch (e) {
      return {};
    }
  };

  // Get latest audit log for a product
  const getLatestAuditLog = (productId) => {
    const logs = productAuditLogs[productId] || [];
    if (logs.length === 0) return null;
    
    const latestLog = logs[0];
    return {
      action: latestLog.action,
      timestamp: formatAuditDate(latestLog.timestamp),
      user: latestLog.username,
      icon: getActionIcon(latestLog.action)
    };
  };

  // Format date for recycle bin
  const formatRecycleDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Inventory Management</h1>
          <p style={styles.pageSubtitle}>Manage your products, track stock levels, and monitor expiry dates</p>
        </div>
        <div style={styles.headerActions}>
          <div style={styles.searchContainer}>
            <input
              style={styles.searchInput}
              placeholder="Search products, barcode, categories..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {searchQuery && (
              <button 
                style={styles.clearSearchButton}
                onClick={() => handleSearch('')}
              >
                ✕
              </button>
            )}
          </div>
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
            >
              🗑️ Recycle Bin
              {newDeletedItems > 0 && (
                <span style={styles.recycleBinBadge}>{newDeletedItems}</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={styles.statsContainer}>
        <div style={styles.statCard}>
          <h3 style={styles.statTitle}>Total Products</h3>
          <p style={styles.statValue}>{stats.totalProducts}</p>
        </div>
        <div
          style={{...styles.statCard, ...(showLowStockOnly ? styles.lowStockCardActive : styles.lowStockCard)}}
          onClick={handleToggleLowStock}
        >
          <h3 style={styles.statTitle}>Low Stock Items</h3>
          <p style={styles.lowStockValue}>{stats.lowStock}</p>
          <p style={styles.lowStockLabel}>
            {showLowStockOnly ? 'Showing Low Stock' : 'Click to View'}
          </p>
        </div>
        <div style={{...styles.statCard, ...styles.expiringCard}}>
          <h3 style={styles.statTitle}>Expiring Soon</h3>
          <p style={styles.expiringValue}>{stats.expiringSoon}</p>
        </div>
        <div style={{...styles.statCard, ...styles.valueCard}}>
          <h3 style={styles.statTitle}>Inventory Value</h3>
          <p style={styles.valueAmount}>₱{stats.inventoryValue.toFixed(2)}</p>
        </div>
      </div>

      {/* Products */}
      <div style={styles.productsSection}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Products</h2>
            <p style={styles.sectionSubtitle}>
              {filteredInventory.length} of {inventory.length} products
              {searchQuery && ` • Searching: "${searchQuery}"`}
              {showLowStockOnly && ' • Showing low stock only'}
            </p>
          </div>
          <div style={styles.sectionActions}>
            <button style={styles.primaryButton} onClick={handleOpenAddModal}>
              Add New Item
            </button>
            <button style={styles.secondaryButton} onClick={handleOpenCategoryModal}>
              Add Category
            </button>
          </div>
        </div>

        <div style={styles.tableContainer}>
          {filteredInventory.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyStateIcon}>📦</div>
              <h3 style={styles.emptyStateTitle}>No products found</h3>
              <p style={styles.emptyStateText}>
                {searchQuery 
                  ? `No products matching "${searchQuery}"`
                  : showLowStockOnly 
                    ? 'No low stock products'
                    : 'Add your first product to get started'}
              </p>
              {searchQuery && (
                <button 
                  style={styles.clearFilterButton}
                  onClick={() => {
                    handleSearch('');
                    setShowLowStockOnly(false);
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop View */}
              <div style={styles.desktopView}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeader}>
                      <th style={styles.tableCell}>CREATED AT</th>
                      <th style={styles.tableCell}>CREATED BY</th>
                      <th style={styles.tableCell}>PRODUCT</th>
                      <th style={styles.tableCell}>CATEGORY</th>
                      <th style={styles.tableCell}>SKU</th>
                      <th style={styles.tableCell}>UNIT</th>
                      <th style={styles.tableCell}>PRICE</th>
                      <th style={styles.tableCell}>STOCK</th>
                      <th style={styles.tableCell}>THRESHOLD</th>
                      <th style={styles.tableCell}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventory.map((item) => {
                      return (
                        <tr key={item.product_id} style={{
                          ...styles.tableRow,
                          backgroundColor: item.quantity <= (item.threshold || 5) ? '#fef2f2' : 'transparent'
                        }}>
                          <td style={styles.tableCell}>
                            {item.created_at ? formatAuditDate(item.created_at) : 'N/A'}
                          </td>
                          <td style={styles.tableCell}>
                            {item.created_by || 'System'}
                          </td>
                          <td style={styles.tableCell}>
                            <div style={styles.productNameCell}>
                              <span style={styles.productName}>{item.name}</span>
                              {item.quantity <= (item.threshold || 5) && (
                                <span style={styles.lowStockBadge}>Low Stock</span>
                              )}
                            </div>
                          </td>
                          <td style={styles.tableCell}>
                            {categories.find(c => c.category_id === item.category_id)?.name || 'N/A'}
                          </td>
                          <td style={styles.tableCell}>{item.sku || 'N/A'}</td>
                          <td style={styles.tableCell}>{item.base_unit || 'pcs'}</td>
                          <td style={styles.tableCell}>₱{item.unit_price || '0.00'}</td>
                          <td style={{
                            ...styles.tableCell,
                            color: item.quantity <= (item.threshold || 5) ? '#dc2626' : '#16a34a',
                            fontWeight: '600'
                          }}>
                            {item.quantity || 0}
                          </td>
                          <td style={styles.tableCell}>{item.threshold || 5}</td>
                          <td style={styles.tableCell}>
                            <div style={styles.actionButtons}>
                              <button style={styles.editButton} onClick={() => handleEditItem(item)}>Edit</button>
                              <button style={styles.viewButton} onClick={() => handleSupplierDetails(item)}>Stock Card</button>
                              <button 
                                style={styles.auditButton} 
                                onClick={() => handleShowProductAudit(item.product_id)}
                                title="View Audit Logs"
                              >
                                📝
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {(showAddModal || showEditModal) && (
        <ProductModal
          visible={showAddModal || showEditModal}
          onClose={() => {
            // ✅ FIXED: Just log to console
            console.log(`[AUDIT] CLOSE_PRODUCT_MODAL`, {
              modal_type: showAddModal ? 'add' : 'edit',
              user_id: user?.user_id
            });
            
            setShowAddModal(false);
            setShowEditModal(false);
            setEditingItem(null);
          }}
          onSubmit={showAddModal ? handleAddItem : handleSaveEdit}
          onDelete={showEditModal ? handleDeleteItem : null}
          item={showAddModal ? newItem : editingItem}
          setItem={showAddModal ? setNewItem : setEditingItem}
          categories={categories}
          title={showAddModal ? 'Add New Product' : 'Edit Product'}
          isEdit={showEditModal}
        />
      )}

      {showSupplierModal && (
        <SupplierModal 
          suppliers={supplierDetails} 
          inventory={currentStockItem} 
          auditLogs={stockCardAuditLogs}
          onClose={() => {
            // ✅ FIXED: Just log to console
            console.log(`[AUDIT] CLOSE_STOCK_CARD_MODAL`, {
              product_id: currentStockItem?.product_id,
              user_id: user?.user_id
            });
            
            setShowSupplierModal(false);
            setCurrentStockItem(null);
            setSupplierDetails([]);
            setStockCardAuditLogs([]);
          }} 
        />
      )}

      {showCategoryModal && (
        <CategoryModal 
          visible={showCategoryModal} 
          onClose={() => {
            // ✅ FIXED: Just log to console
            console.log(`[AUDIT] CLOSE_CATEGORY_MODAL`, {
              modal_type: editingCategory ? 'edit' : 'add',
              user_id: user?.user_id
            });
            
            setShowCategoryModal(false);
            setEditingCategory(null);
            setNewCategoryName('');
          }} 
          newCategoryName={newCategoryName}
          setNewCategoryName={setNewCategoryName}
          onSubmit={editingCategory ? handleSaveCategory : handleAddCategory}
          editingCategory={editingCategory}
          onDelete={editingCategory ? handleDeleteCategory : null}
          categories={categories}
          handleEditCategory={handleEditCategory}
        />
      )}

      {/* Product Audit Logs Modal */}
      {showAuditForProduct && (
        <div style={styles.modalOverlay}>
          <div style={styles.largeModalContainer}>
            <div style={styles.modalHeaderRow}>
              <h2 style={styles.modalHeader}>
                Audit Logs - {inventory.find(p => p.product_id === showAuditForProduct)?.name}
              </h2>
              <button style={styles.closeButton} onClick={() => setShowAuditForProduct(null)}>✕</button>
            </div>
            
            <div style={styles.auditLogsContainer}>
              {productAuditLogs[showAuditForProduct]?.length === 0 ? (
                <div style={styles.emptyAuditState}>
                  <div style={styles.emptyAuditIcon}>📋</div>
                  <p style={styles.emptyAuditText}>No audit logs found for this product</p>
                  <p style={styles.emptyAuditSubtext}>Perform some actions to see audit logs here</p>
                </div>
              ) : (
                <div style={styles.auditLogsList}>
                  {productAuditLogs[showAuditForProduct]?.map((log, index) => {
                    const details = parseAuditDetails(log.details);
                    return (
                      <div key={log.id || index} style={styles.auditLogItem}>
                        <div style={styles.auditLogHeader}>
                          <span style={styles.auditActionIcon}>{getActionIcon(log.action)}</span>
                          <span style={styles.auditAction}>{log.action}</span>
                          <span style={styles.auditTimestamp}>{formatAuditDate(log.timestamp)}</span>
                        </div>
                        <div style={styles.auditLogDetails}>
                          <div style={styles.auditDetailRow}>
                            <span style={styles.auditDetailLabel}>User:</span>
                            <span style={styles.auditDetailValue}>{log.username}</span>
                          </div>
                          {Object.keys(details).length > 0 && (
                            <div style={styles.auditDetailRow}>
                              <span style={styles.auditDetailLabel}>Details:</span>
                              <div style={styles.auditDetailsContent}>
                                {Object.entries(details).map(([key, value]) => (
                                  <div key={key} style={styles.auditDetailItem}>
                                    <span style={styles.auditDetailKey}>{key}:</span>
                                    <span style={styles.auditDetailVal}>
                                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div style={styles.modalButtons}>
              <button style={styles.cancelButton} onClick={() => setShowAuditForProduct(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recycle Bin Modal (Owner Only) */}
      {showRecycleBinModal && user?.role === 'Owner' && (
        <div style={styles.modalOverlay}>
          <div style={styles.largeModalContainer}>
            <div style={styles.modalHeaderRow}>
              <div>
                <h2 style={styles.modalHeader}>🗑️ Recycle Bin</h2>
                <p style={{ color: '#64748b', fontSize: '14px' }}>
                  Deleted items waiting for owner confirmation
                </p>
              </div>
              <button style={styles.closeButton} onClick={() => setShowRecycleBinModal(false)}>✕</button>
            </div>

            {/* Stats */}
            <div style={styles.recycleStats}>
              <div style={styles.recycleStat}>
                <span style={styles.recycleStatIcon}>📦</span>
                <div>
                  <div style={styles.recycleStatValue}>{deletedProducts.length}</div>
                  <div style={styles.recycleStatLabel}>Deleted Products</div>
                </div>
              </div>
              <div style={styles.recycleStat}>
                <span style={styles.recycleStatIcon}>🏷️</span>
                <div>
                  <div style={styles.recycleStatValue}>{deletedCategories.length}</div>
                  <div style={styles.recycleStatLabel}>Deleted Categories</div>
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
              {/* Deleted Products Section */}
              <div style={styles.deletedSection}>
                <h3 style={styles.sectionSubheader}>
                  Deleted Products ({deletedProducts.length})
                  {deletedProducts.some(p => !p.restored_at && !p.confirmed_at) && (
                    <span style={styles.pendingBadge}>Pending</span>
                  )}
                </h3>
                
                {deletedItemsLoading ? (
                  <div style={styles.loadingState}>
                    <div style={styles.loadingSpinner}></div>
                    <p>Loading deleted items...</p>
                  </div>
                ) : deletedProducts.length === 0 ? (
                  <div style={styles.emptyState}>
                    <div style={styles.emptyStateIcon}>📦</div>
                    <p style={styles.emptyStateText}>No deleted products</p>
                  </div>
                ) : (
                  <div style={styles.tableContainer}>
                    <table style={styles.table}>
                      <thead>
                        <tr style={styles.tableHeader}>
                          <th style={styles.tableCell}>Product</th>
                          <th style={styles.tableCell}>Deleted By</th>
                          <th style={styles.tableCell}>Deleted</th>
                          <th style={styles.tableCell}>Status</th>
                          <th style={styles.tableCell}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deletedProducts.map((item) => {
                          const details = JSON.parse(item.details || '{}');
                          const isNew = new Date(item.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                          const isPending = !item.restored_at && !item.confirmed_at;
                          
                          return (
                            <tr key={item.backup_id} style={{
                              ...styles.tableRow,
                              backgroundColor: isNew ? '#fffbeb' : 'transparent',
                              borderLeft: isNew ? '4px solid #f59e0b' : 'none'
                            }}>
                              <td style={styles.tableCell}>
                                <div>
                                  <strong>{details.name || 'Unknown Product'}</strong>
                                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                                    SKU: {details.sku || 'N/A'} | 
                                    Price: ₱{details.unit_price || '0.00'}
                                  </div>
                                </div>
                              </td>
                              <td style={styles.tableCell}>
                                {item.username}<br/>
                                <small style={{ color: '#94a3b8' }}>ID: {item.user_id}</small>
                              </td>
                              <td style={styles.tableCell}>
                                {formatRecycleDate(item.created_at)}
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
                                        onClick={() => handleRestoreItem(item)}
                                      >
                                        🔄 Restore
                                      </button>
                                      <button 
                                        style={styles.confirmDeleteButton}
                                        onClick={() => handlePermanentDelete(item)}
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

              {/* Deleted Categories Section */}
              <div style={styles.deletedSection}>
                <h3 style={styles.sectionSubheader}>
                  Deleted Categories ({deletedCategories.length})
                  {deletedCategories.some(c => !c.restored_at && !c.confirmed_at) && (
                    <span style={styles.pendingBadge}>Pending</span>
                  )}
                </h3>
                
                {deletedItemsLoading ? (
                  <div style={styles.loadingState}>
                    <div style={styles.loadingSpinner}></div>
                    <p>Loading deleted categories...</p>
                  </div>
                ) : deletedCategories.length === 0 ? (
                  <div style={styles.emptyState}>
                    <div style={styles.emptyStateIcon}>🏷️</div>
                    <p style={styles.emptyStateText}>No deleted categories</p>
                  </div>
                ) : (
                  <div style={styles.tableContainer}>
                    <table style={styles.table}>
                      <thead>
                        <tr style={styles.tableHeader}>
                          <th style={styles.tableCell}>Category</th>
                          <th style={styles.tableCell}>Deleted By</th>
                          <th style={styles.tableCell}>Deleted</th>
                          <th style={styles.tableCell}>Status</th>
                          <th style={styles.tableCell}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deletedCategories.map((item) => {
                          const details = JSON.parse(item.details || '{}');
                          const isNew = new Date(item.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                          const isPending = !item.restored_at && !item.confirmed_at;
                          
                          return (
                            <tr key={item.backup_id} style={{
                              ...styles.tableRow,
                              backgroundColor: isNew ? '#fffbeb' : 'transparent',
                              borderLeft: isNew ? '4px solid #f59e0b' : 'none'
                            }}>
                              <td style={styles.tableCell}>
                                <strong>{details.name || 'Unknown Category'}</strong>
                              </td>
                              <td style={styles.tableCell}>
                                {item.username}<br/>
                                <small style={{ color: '#94a3b8' }}>ID: {item.user_id}</small>
                              </td>
                              <td style={styles.tableCell}>
                                {formatRecycleDate(item.created_at)}
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
                                        onClick={() => handleRestoreItem(item)}
                                      >
                                        🔄 Restore
                                      </button>
                                      <button 
                                        style={styles.confirmDeleteButton}
                                        onClick={() => handlePermanentDelete(item)}
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
              <button style={styles.cancelButton} onClick={() => setShowRecycleBinModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductModal({ visible, onClose, onSubmit, onDelete, item, setItem, title, isEdit, categories }) {
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
            <label style={styles.inputLabel}>Category</label>
            <select 
              style={styles.input}
              value={item?.category_id || ''}
              onChange={(e) => setItem({ ...item, category_id: parseInt(e.target.value) })}
            >
              <option value="">Select Category</option>
              {categories.map(c => (
                <option key={c.category_id} value={c.category_id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Base Unit *</label>
            <select 
              style={styles.input}
              value={item?.base_unit || 'pcs'}
              onChange={(e) => setItem({ ...item, base_unit: e.target.value })}
            >
              <option value="pcs">Pieces</option>
              <option value="dozen">Dozen</option>
              <option value="grams">Grams</option>
              <option value="kilos">Kilos</option>
              <option value="ml">Milliliters</option>
              <option value="liters">Liters</option>
              <option value="boxes">Boxes</option>
              <option value="packs">Packs</option>
            </select>
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Unit Price *</label>
            <input
              placeholder="0.00"
              value={item?.unit_price?.toString() || ''}
              type="number"
              step="0.01"
              min="0"
              onChange={(e) => setItem({ ...item, unit_price: e.target.value })}
              style={styles.input}
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Low Stock Threshold *</label>
            <input
              placeholder="5"
              value={item?.threshold?.toString() || ''}
              type="number"
              min="1"
              onChange={(e) => setItem({ ...item, threshold: e.target.value })}
              style={styles.input}
            />
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

function SupplierModal({ suppliers, inventory, auditLogs, onClose }) {
  const currentStock = inventory?.quantity ?? 0;
  const productName = inventory?.name || 'Product';
  const productSku = inventory?.sku || 'N/A';

  // Calculate totals from raw data
  const totalStockIn = suppliers.reduce((sum, item) => sum + (item.stock_in > 0 ? item.stock_in : 0), 0);
  const totalStockOut = suppliers.reduce((sum, item) => sum + (item.stock_out > 0 ? item.stock_out : 0), 0);
  const totalCost = suppliers.reduce((sum, item) => sum + (item.unit_cost || 0) * (item.stock_in > 0 ? item.stock_in : 0), 0);
  const totalValue = suppliers.reduce((sum, item) => sum + (item.unit_price || 0) * (item.stock_in > 0 ? item.stock_in : 0), 0);

  // Get action icon for audit logs
  const getActionIcon = (action) => {
    if (action.includes('ADD')) return '➕';
    if (action.includes('UPDATE') || action.includes('EDIT')) return '✏️';
    if (action.includes('DELETE')) return '🗑️';
    if (action.includes('VIEW')) return '👁️';
    if (action.includes('STOCK')) return '📊';
    if (action.includes('ERROR')) return '❌';
    return '📝';
  };

  // Format date for audit logs
  const formatAuditDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.largeModalContainer}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h2 style={styles.modalHeader}>Stock Card - {productName}</h2>
            <p style={{ color: '#64748b', fontSize: '14px' }}>SKU: {productSku}</p>
          </div>
          <div style={{ 
            backgroundColor: '#f8fafc', 
            padding: '12px 16px', 
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontWeight: 'bold', color: '#1e293b', fontSize: '16px' }}>
              Current Stock: {currentStock}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              (Total In: {totalStockIn} - Total Out: {totalStockOut})
            </div>
          </div>
        </div>

        {/* Tabs for Stock Card and Audit Logs */}
        <div style={styles.tabsContainer}>
          <div style={styles.tabs}>
            <div style={styles.tab}>
              Stock Transactions ({suppliers.length})
            </div>
            <div style={styles.tab}>
              Audit Logs ({auditLogs.length})
            </div>
          </div>
        </div>

        {/* Stock Card Content */}
        <div style={styles.modalContent}>
          {suppliers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
              <p style={{ fontSize: '16px', color: '#64748b' }}>No stock transactions found for this product.</p>
              <p style={{ fontSize: '14px', color: '#94a3b8' }}>Stock card records will appear after resupply or sales.</p>
            </div>
          ) : (
            <>
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeader}>
                      <th style={styles.tableCell}>CREATED BY</th>
                      <th style={styles.tableCell}>DATE/TIME</th>
                      <th style={styles.tableCell}>SUPPLIER</th>
                      <th style={styles.tableCell}>STOCK IN</th>
                      <th style={styles.tableCell}>STOCK OUT</th>
                      <th style={styles.tableCell}>UNIT COST</th>
                      <th style={styles.tableCell}>UNIT PRICE</th>
                      <th style={styles.tableCell}>EXPIRY DATE</th>
                      <th style={styles.tableCell}>RUNNING BALANCE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((s, idx) => (
                      <tr key={idx} style={{
                        ...styles.tableRow,
                        backgroundColor: s.transaction_type === 'RESUPPLY' ? '#f0fdf4' : 
                                        s.transaction_type === 'SALE' ? '#fef2f2' : 'transparent'
                      }}>
                        <td style={styles.tableCell}>{s.created_by || 'System'}</td>
                        <td style={styles.tableCell}>{s.transaction_date}</td>
                        <td style={styles.tableCell}>{s.name || '-'}</td>
                        <td style={styles.tableCell}>
                          {s.stock_in > 0 ? (
                            <span style={{ color: '#10b981', fontWeight: '600' }}>+{s.stock_in}</span>
                          ) : '-'}
                        </td>
                        <td style={styles.tableCell}>
                          {s.stock_out > 0 ? (
                            <span style={{ color: '#ef4444', fontWeight: '600' }}>-{s.stock_out}</span>
                          ) : '-'}
                        </td>
                        <td style={styles.tableCell}>
                          {s.unit_cost > 0 ? `₱${s.unit_cost.toFixed(2)}` : '-'}
                        </td>
                        <td style={styles.tableCell}>
                          {s.unit_price > 0 ? `₱${s.unit_price.toFixed(2)}` : '-'}
                        </td>
                        <td style={styles.tableCell}>
                          {s.expiration_date && s.expiration_date !== 'N/A' ? s.expiration_date : '-'}
                        </td>
                        <td style={styles.tableCell}>
                          <span style={{
                            fontWeight: '600',
                            color: s.running_balance > 0 ? '#1e293b' : '#ef4444'
                          }}>
                            {s.running_balance}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ 
                      backgroundColor: '#f8fafc', 
                      borderTop: '2px solid #e2e8f0' 
                    }}>
                      <td colSpan="3" style={{ 
                        ...styles.tableCell, 
                        fontWeight: '600',
                        textAlign: 'right'
                      }}>
                        Totals:
                      </td>
                      <td style={{ 
                        ...styles.tableCell, 
                        color: '#10b981',
                        fontWeight: '600'
                      }}>
                        +{totalStockIn}
                      </td>
                      <td style={{ 
                        ...styles.tableCell, 
                        color: '#ef4444',
                        fontWeight: '600'
                      }}>
                        -{totalStockOut}
                      </td>
                      <td style={{ 
                        ...styles.tableCell, 
                        fontWeight: '600'
                      }}>
                        ₱{totalCost.toFixed(2)}
                      </td>
                      <td style={{ 
                        ...styles.tableCell, 
                        fontWeight: '600'
                      }}>
                        ₱{totalValue.toFixed(2)}
                      </td>
                      <td colSpan="2" style={{ 
                        ...styles.tableCell, 
                        fontWeight: '600',
                        color: '#1e293b'
                      }}>
                        Net Stock: {currentStock}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              
              {/* Summary Stats */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                marginTop: '20px',
                padding: '16px',
                backgroundColor: '#f8fafc',
                borderRadius: '8px'
              }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Total Stock-in</div>
                  <div style={{ fontSize: '18px', fontWeight: '600', color: '#10b981' }}>+{totalStockIn}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Total Stock-out</div>
                  <div style={{ fontSize: '18px', fontWeight: '600', color: '#ef4444' }}>-{totalStockOut}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Total Cost</div>
                  <div style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>₱{totalCost.toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Total Value</div>
                  <div style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>₱{totalValue.toFixed(2)}</div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Audit Logs Section */}
        <div style={{
          marginTop: '20px',
          borderTop: '2px solid #e2e8f0',
          paddingTop: '20px'
        }}>
          <h3 style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#1e293b',
            marginBottom: '12px'
          }}>
            Recent Activity Logs
          </h3>
          {auditLogs.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '20px',
              backgroundColor: '#f8fafc',
              borderRadius: '8px'
            }}>
              <p style={{ color: '#64748b' }}>No audit logs available</p>
            </div>
          ) : (
            <div style={{
              maxHeight: '200px',
              overflowY: 'auto',
              border: '1px solid #e2e8f0',
              borderRadius: '8px'
            }}>
              {auditLogs.map((log, index) => (
                <div key={index} style={{
                  padding: '12px',
                  borderBottom: '1px solid #e2e8f0',
                  backgroundColor: index % 2 === 0 ? '#f8fafc' : '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <span style={{ fontSize: '18px' }}>
                    {getActionIcon(log.action)}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#1e293b'
                    }}>
                      {log.action}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#64748b',
                      display: 'flex',
                      gap: '12px',
                      marginTop: '4px'
                    }}>
                      <span>by {log.username}</span>
                      <span>{formatAuditDate(log.timestamp)}</span>
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

function CategoryModal({ visible, onClose, newCategoryName, setNewCategoryName, onSubmit, editingCategory, onDelete, categories, handleEditCategory }) {
  if (!visible) return null;
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContainer}>
        <h2 style={styles.modalHeader}>{editingCategory ? 'Edit Category' : 'Add New Category'}</h2>
        <div style={styles.modalContent}>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Category Name</label>
            <input 
              style={styles.input} 
              placeholder="Enter category name" 
              value={newCategoryName} 
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
          </div>

          <div style={{marginTop: '20px'}}>
            <h3>Existing Categories</h3>
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeader}>
                    <th style={styles.tableCell}>Category Name</th>
                    <th style={styles.tableCell}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.category_id} style={styles.tableRow}>
                      <td style={styles.tableCell}>{c.name}</td>
                      <td style={styles.tableCell}>
                        <button style={styles.editButton} onClick={() => handleEditCategory(c)}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
        <div style={styles.modalButtons}>
          {editingCategory && (
            <button style={styles.deleteButton} onClick={() => onDelete(editingCategory)}>Delete</button>
          )}
          <button style={styles.cancelButton} onClick={onClose}>Cancel</button>
          <button style={styles.submitButton} onClick={onSubmit}>{editingCategory ? 'Save Changes' : 'Add Category'}</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { 
    padding: '16px', 
    backgroundColor: '#f8fafc', 
    minHeight: '100vh'
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
    marginBottom: '8px'
  },
  pageSubtitle: {
    fontSize: '16px',
    color: '#64748b'
  },
  headerActions: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center'
  },
  searchContainer: {
    position: 'relative'
  },
  searchInput: {
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    padding: '10px 16px',
    paddingRight: '40px',
    backgroundColor: '#fff',
    width: '250px'
  },
  clearSearchButton: {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px'
  },
  // Recycle Bin Button Styles
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
    '&:hover': {
      backgroundColor: '#4b5563',
      transform: 'translateY(-1px)'
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
    marginBottom: '24px'
  },
  statCard: {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
  },
  lowStockCard: {
    backgroundColor: '#fffbeb',
    borderColor: '#f59e0b',
    cursor: 'pointer'
  },
  lowStockCardActive: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
    cursor: 'pointer'
  },
  expiringCard: {
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444'
  },
  valueCard: {
    backgroundColor: '#f0f9ff',
    borderColor: '#0ea5e9'
  },
  statTitle: {
    fontSize: '14px',
    color: '#64748b',
    marginBottom: '8px',
    fontWeight: '500'
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: '4px'
  },
  lowStockValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#b45309',
    marginBottom: '4px'
  },
  lowStockLabel: {
    fontSize: '0.9rem',
    color: '#92400e'
  },
  expiringValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#dc2626',
    marginBottom: '4px'
  },
  valueAmount: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#0369a1',
    marginBottom: '4px'
  },
  productsSection: {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '12px'
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '4px'
  },
  sectionSubtitle: {
    fontSize: '14px',
    color: '#64748b'
  },
  sectionActions: {
    display: 'flex',
    gap: '8px'
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  },
  secondaryButton: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    border: '1px solid #e2e8f0',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  },
  tableContainer: {
    overflowX: 'auto'
  },
  desktopView: {
    display: 'block'
  },
  mobileView: {
    display: 'none'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
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
    fontSize: '14px'
  },
  productNameCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  productName: {
    fontWeight: '500',
    color: '#1e293b'
  },
  lowStockBadge: {
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '10px',
    display: 'inline-block'
  },
  // Audit cell styles
  auditCell: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px'
  },
  auditIcon: {
    fontSize: '16px',
    flexShrink: 0
  },
  auditInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  auditAction: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#1e293b'
  },
  auditTime: {
    fontSize: '11px',
    color: '#64748b'
  },
  auditUser: {
    fontSize: '11px',
    color: '#6b7280',
    fontStyle: 'italic'
  },
  noActivity: {
    fontSize: '12px',
    color: '#94a3b8',
    fontStyle: 'italic'
  },
  actionButtons: {
    display: 'flex',
    gap: '4px'
  },
  editButton: {
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  viewButton: {
    backgroundColor: '#10b981',
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  auditButton: {
    backgroundColor: '#6b7280',
    color: '#fff',
    border: 'none',
    padding: '6px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    width: '32px'
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 20px'
  },
  emptyStateIcon: {
    fontSize: '48px',
    marginBottom: '16px'
  },
  emptyStateTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '8px'
  },
  emptyStateText: {
    fontSize: '14px',
    color: '#64748b',
    marginBottom: '16px'
  },
  clearFilterButton: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    border: '1px solid #e2e8f0',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px'
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
    padding: '16px'
  },
  modalContainer: {
    backgroundColor: '#fff',
    padding: '24px',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)'
  },
  largeModalContainer: {
    backgroundColor: '#fff',
    padding: '24px',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)'
  },
  modalHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  modalHeader: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#1e293b'
  },
  closeButton: {
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '20px',
    color: '#64748b',
    cursor: 'pointer',
    padding: '4px 8px'
  },
  // Tabs
  tabsContainer: {
    marginBottom: '16px',
    borderBottom: '2px solid #e2e8f0'
  },
  tabs: {
    display: 'flex',
    gap: '0'
  },
  tab: {
    padding: '10px 20px',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderBottom: 'none',
    borderTopLeftRadius: '6px',
    borderTopRightRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#64748b',
    cursor: 'pointer',
    marginRight: '4px'
  },
  modalContent: {
    marginBottom: '20px'
  },
  inputGroup: {
    marginBottom: '16px'
  },
  inputLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '6px'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  modalButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px'
  },
  submitButton: {
    backgroundColor: '#4f46e5',
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  },
  deleteButton: {
    backgroundColor: '#ef4444',
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  },
  cancelButton: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    border: '1px solid #e2e8f0',
    padding: '10px 20px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  },
  // Audit Logs Styles
  auditLogsContainer: {
    maxHeight: '60vh',
    overflowY: 'auto',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#f8fafc',
    marginBottom: '20px'
  },
  auditLogsList: {
    padding: '8px'
  },
  auditLogItem: {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    marginBottom: '8px',
    padding: '16px'
  },
  auditLogHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom: '1px solid #f1f5f9'
  },
  auditActionIcon: {
    fontSize: '20px'
  },
  auditAction: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1e293b',
    flex: 1
  },
  auditTimestamp: {
    fontSize: '12px',
    color: '#64748b'
  },
  auditLogDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  auditDetailRow: {
    display: 'flex',
    gap: '8px'
  },
  auditDetailLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#64748b',
    minWidth: '80px'
  },
  auditDetailValue: {
    fontSize: '12px',
    color: '#1e293b',
    flex: 1
  },
  auditDetailsContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    backgroundColor: '#f8fafc',
    padding: '8px',
    borderRadius: '4px',
    width: '100%'
  },
  auditDetailItem: {
    display: 'flex',
    gap: '4px'
  },
  auditDetailKey: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#4b5563',
    minWidth: '120px'
  },
  auditDetailVal: {
    fontSize: '11px',
    color: '#6b7280',
    flex: 1,
    wordBreak: 'break-all'
  },
  emptyAuditState: {
    textAlign: 'center',
    padding: '40px 20px'
  },
  emptyAuditIcon: {
    fontSize: '48px',
    marginBottom: '16px'
  },
  emptyAuditText: {
    fontSize: '16px',
    color: '#64748b',
    marginBottom: '8px'
  },
  emptyAuditSubtext: {
    fontSize: '14px',
    color: '#94a3b8'
  },
  // Recycle Bin Modal Styles
  recycleStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0'
  },
  recycleStat: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #e2e8f0'
  },
  recycleStatIcon: {
    fontSize: '24px',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: '8px'
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
    marginBottom: '32px'
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
    gap: '12px'
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
    padding: '40px 20px'
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
  pendingStatus: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px'
  },
  restoredStatus: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px'
  },
  confirmedStatus: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px'
  },
  restoreButton: {
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    marginRight: '8px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'background-color 0.2s',
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
    '&:hover': {
      backgroundColor: '#dc2626'
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
  
  @media (max-width: 768px) {
    .desktop-view {
      display: none !important;
    }
    .mobile-view {
      display: block !important;
    }
  }
`;
document.head.appendChild(styleSheet);