import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { useLocation } from 'react-router-dom';

export default function ResupplyScreen({ userMode }) {
  const location = useLocation();
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
      await db.resupplied_items.add({
        product_id: parseInt(selectedProductId),
        supplier_id: parseInt(selectedSupplierId),
        user_id: 1,
        quantity: parseInt(quantity),
        unit_cost: parseFloat(unitCost),
        resupply_date: new Date().toISOString().split('T')[0],
        expiration_date: expirationDate,
      });

      const existingInv = await db.inventory.where({ product_id: parseInt(selectedProductId) }).first();

      if (!existingInv) {
        await db.inventory.add({
          product_id: parseInt(selectedProductId),
          supplier_id: parseInt(selectedSupplierId),
          quantity: parseInt(quantity),
          expiration_date: expirationDate,
          threshold: parseInt(threshold),
        });
      } else {
        await db.inventory.where({ product_id: parseInt(selectedProductId) }).modify(inv => {
          inv.quantity += parseInt(quantity);
          inv.expiration_date = expirationDate;
          inv.threshold = parseInt(threshold);
          inv.supplier_id = parseInt(selectedSupplierId);
        });
      }

      alert('Product resupplied successfully.');
      setQuantity('');
      setUnitCost('');
      setThreshold('');
      setExpirationDate('');
      setSelectedProductId(null);
      setSelectedSupplierId(null);
    } catch (err) {
      console.error('Error during resupply:', err);
      alert('Failed to resupply product.');
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.pageTitle}>Resupply Inventory</h2>
      <p style={styles.pageSubtitle}>Add new stock to your inventory</p>

      <div style={styles.formContainer}>
        <label style={styles.label}>Supplier</label>
        <select
          style={styles.pickerContainer}
          value={selectedSupplierId || ''}
          onChange={(e) => setSelectedSupplierId(e.target.value)}
        >
          <option value="">Select Supplier</option>
          {suppliers.map((sup) => (
            <option key={sup.supplier_id} value={sup.supplier_id}>{sup.name}</option>
          ))}
        </select>

        <label style={styles.label}>Product (with SKU)</label>
        <select
          style={styles.pickerContainer}
          value={selectedProductId || ''}
          onChange={(e) => setSelectedProductId(e.target.value)}
        >
          <option value="">Select Product</option>
          {products.map((prod) => (
            <option key={prod.product_id} value={prod.product_id}>
              {prod.name} {prod.sku ? `(SKU: ${prod.sku})` : ''}
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
  },

  pageTitle: {
    fontSize: 'clamp(18px, 2vw, 24px)',
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 'clamp(2px, 0.5vw, 4px)',
  },

  pageSubtitle: {
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 'clamp(12px, 2vw, 20px)',
  },

  formContainer: {
    backgroundColor: '#FFFFFF',
    padding: 'clamp(12px, 3vw, 20px)',
    borderRadius: '12px',
    border: '1px solid #E5E7EB',
    marginBottom: 'clamp(16px, 3vw, 30px)',
  },

  label: {
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 'clamp(6px, 1vw, 8px)',
    display: 'block',
  },

  pickerContainer: {
    width: '100%',
    padding: 'clamp(8px, 2vw, 10px)',
    marginBottom: 'clamp(12px, 2vw, 16px)',
    borderRadius: '8px',
    border: '1px solid #D1D5DB',
    backgroundColor: '#F9FAFB',
  },

  input: {
    width: '100%',
    padding: 'clamp(10px, 2.5vw, 14px)',
    marginBottom: 'clamp(12px, 2vw, 16px)',
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    borderRadius: '8px',
    border: '1px solid #D1D5DB',
    backgroundColor: '#F9FAFB',
  },

  submitButton: {
    backgroundColor: '#3B82F6',
    padding: 'clamp(12px, 3vw, 16px)',
    borderRadius: '8px',
    color: '#FFFFFF',
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    fontWeight: '600',
    cursor: 'pointer',
    border: 'none',
    width: '100%', // full-width button on mobile
    maxWidth: '300px', // prevent giant buttons on desktop
  },
};
