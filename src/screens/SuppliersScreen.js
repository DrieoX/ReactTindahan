import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { useLocation, useNavigate } from 'react-router-dom';

export default function ResupplyScreen({ userMode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const mode = userMode || location.state?.userMode || 'client';

  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [threshold, setThreshold] = useState('');
  const [expirationDate, setExpirationDate] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const prodRes = await db.products.toArray();
      const supRes = await db.suppliers.toArray();
      setProducts(prodRes);
      setSuppliers(supRes);
    } catch (err) {
      console.error('Error fetching products or suppliers:', err);
    }
  };

  const handleResupply = async () => {
    if (!selectedProductId || !selectedSupplierId || !quantity || !unitCost || !expirationDate || !threshold) {
      alert('Please fill out all fields.');
      return;
    }

    try {
      const productId = parseInt(selectedProductId);
      const supplierId = parseInt(selectedSupplierId);

      // Insert into Resupplied_items
      await db.resupplied_items.add({
        product_id: productId,
        supplier_id: supplierId,
        quantity: parseInt(quantity),
        unit_cost: parseFloat(unitCost),
        resupply_date: new Date().toISOString().split('T')[0],
        expiration_date: expirationDate,
      });

      // Ensure product has supplier_id linked
      const existingProduct = await db.products.get(productId);
      if (existingProduct && (!existingProduct.supplier_id || existingProduct.supplier_id !== supplierId)) {
        await db.products.update(productId, { supplier_id: supplierId });
      }

      // Ensure product exists in Inventory
      const existingInv = await db.inventory.where({ product_id: productId }).first();

      if (!existingInv) {
        await db.inventory.add({
          product_id: productId,
          supplier_id: supplierId,
          quantity: 0,
          expiration_date: expirationDate,
          threshold: parseInt(threshold),
        });
      }

      // Update Inventory quantity
      await db.inventory.where({ product_id: productId }).modify((inv) => {
        inv.quantity += parseInt(quantity);
        inv.expiration_date = expirationDate;
        inv.threshold = parseInt(threshold);
        inv.supplier_id = supplierId;
      });

      alert('Product resupplied successfully.');
      setQuantity('');
      setUnitCost('');
      setThreshold('');
      setExpirationDate('');
      setSelectedProductId(null);
      setSelectedSupplierId(null);

      fetchData();
    } catch (err) {
      console.error('Error during resupply:', err);
      alert('Failed to resupply product.');
    }
  };

  // Filter products by selected supplier
  const filteredProducts = selectedSupplierId
    ? products.filter((prod) => prod.supplier_id === parseInt(selectedSupplierId) || !prod.supplier_id)
    : [];

  return (
    <div style={styles.container}>
      <h2 style={styles.pageTitle}>Resupply Inventory</h2>
      <p style={styles.pageSubtitle}>Add new stock to your inventory</p>

      <div style={styles.formContainer}>
        <label style={styles.label}>Supplier</label>
        <select
          style={styles.pickerContainer}
          value={selectedSupplierId || ''}
          onChange={(e) => {
            setSelectedSupplierId(e.target.value);
            setSelectedProductId(null); // reset product selection when supplier changes
          }}
        >
          <option value="">Select Supplier</option>
          {suppliers.map((sup) => (
            <option key={sup.supplier_id} value={sup.supplier_id}>
              {sup.name}
            </option>
          ))}
        </select>

        <label style={styles.label}>Product</label>
        <select
          style={styles.pickerContainer}
          value={selectedProductId || ''}
          onChange={(e) => setSelectedProductId(e.target.value)}
          disabled={!selectedSupplierId}
        >
          <option value="">Select Product</option>
          {filteredProducts.map((prod) => (
            <option key={prod.product_id} value={prod.product_id}>
              {prod.name}
            </option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Quantity"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          style={styles.input}
        />
        <input
          type="number"
          placeholder="Unit Cost"
          value={unitCost}
          onChange={(e) => setUnitCost(e.target.value)}
          style={styles.input}
        />
        <input
          type="number"
          placeholder="Threshold Quantity"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          style={styles.input}
        />

        <label style={styles.label}>Expiration Date</label>
        <input
          type="date"
          value={expirationDate}
          onChange={(e) => setExpirationDate(e.target.value)}
          style={styles.input}
        />

        <button style={styles.submitButton} onClick={handleResupply}>
          Submit Resupply
        </button>
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
    backgroundColor: '#3B82F6',
    color: '#fff',
    padding: 'clamp(12px, 3vw, 16px)',
    borderRadius: '12px',
    width: '100%',
    border: 'none',
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    fontWeight: 600,
    cursor: 'pointer',
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
    backgroundColor: '#3B82F6',
    color: '#fff',
    padding: 'clamp(6px, 2vw, 8px) clamp(12px, 3vw, 16px)',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    flex: '1 1 auto',
    minWidth: '100px',
  },

  deleteButton: {
    backgroundColor: '#EF4444',
    color: '#fff',
    padding: 'clamp(6px, 2vw, 8px) clamp(12px, 3vw, 16px)',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    flex: '1 1 auto',
    minWidth: '100px',
  },
};
