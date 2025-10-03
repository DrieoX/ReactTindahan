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
  const [expirationDate, setExpirationDate] = useState('');

  const [resupplyItems, setResupplyItems] = useState([]); // multiple items
  const [scannedCode, setScannedCode] = useState('');
  const [noExpiry, setNoExpiry] = useState(false);

  useEffect(() => {
    fetchData();

    // Barcode scanner listener
    let buffer = '';
    let timer;
    const handleKeyDown = (e) => {
      if (timer) clearTimeout(timer);

      if (e.key === 'Enter') {
        if (buffer.length > 0) {
          setScannedCode(buffer);
          buffer = '';
        }
      } else {
        buffer += e.key;
        timer = setTimeout(() => (buffer = ''), 200); // reset if delay >200ms
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (scannedCode) {
      const matchedProduct = products.find((p) => p.sku === scannedCode);
      if (matchedProduct) {
        setSelectedProductId(matchedProduct.product_id);
      }
      setScannedCode('');
    }
  }, [scannedCode, products]);

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

  const addResupplyItem = () => {
    if (!selectedProductId || !selectedSupplierId || !quantity || !unitCost) {
      alert('Please fill out all fields before adding.');
      return;
    }
    if (!noExpiry && !expirationDate) {
      alert('Please provide an expiration date or mark No Expiry.');
      return;
    }

    const newItem = {
      product_id: parseInt(selectedProductId),
      supplier_id: parseInt(selectedSupplierId),
      quantity: parseInt(quantity),
      unit_cost: parseFloat(unitCost),
      expiration_date: noExpiry ? '' : expirationDate,
    };

    setResupplyItems([...resupplyItems, newItem]);

    // reset input fields
    setQuantity('');
    setUnitCost('');
    setExpirationDate('');
    setSelectedProductId(null);
    setNoExpiry(false);
  };

  const handleResupply = async () => {
    if (resupplyItems.length === 0) {
      alert('No items added for resupply.');
      return;
    }

    try {
      for (const item of resupplyItems) {
        const newResupply = {
          ...item,
          user_id: 1,
          resupply_date: new Date().toISOString().split('T')[0],
        };

        await db.resupplied_items.add(newResupply);

        const existingInv = await db.inventory.where({ product_id: item.product_id }).first();
        let newBalance = item.quantity;

        if (!existingInv) {
          await db.inventory.add({
            product_id: item.product_id,
            supplier_id: item.supplier_id,
            quantity: item.quantity,
            expiration_date: item.expiration_date,
          });
        } else {
          await db.inventory.where({ product_id: item.product_id }).modify(inv => {
            inv.quantity += item.quantity;
            inv.expiration_date = item.expiration_date;
            inv.supplier_id = item.supplier_id;
            newBalance = inv.quantity;
          });
        }

       const prod = await db.products.get(item.product_id);
await db.stock_card.add({
  product_id: item.product_id,
  supplier_id: item.supplier_id,
  user_id: 1, // or logged-in user_id
  quantity: item.quantity,
  unit_cost: item.unit_cost,
  unit_price: prod?.unit_price || 0,
  resupply_date: newResupply.resupply_date,
  expiration_date: item.expiration_date,
});

        // Push resupply to API
        await fetch('http://localhost:5000/api/resupply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newResupply),
        });
      }

      alert('Products resupplied successfully.');
      setResupplyItems([]);
    } catch (err) {
      console.error('Error during resupply:', err);
      alert('Failed to resupply product(s).');
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

        <label style={styles.label}>Product (with SKU / Barcode)</label>
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

        <label style={styles.label}>Expiration Date</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="date"
            value={expirationDate}
            onChange={(e) => setExpirationDate(e.target.value)}
            style={styles.input}
            disabled={noExpiry} // disable if "No Expiry" is checked
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <input
              type="checkbox"
              checked={noExpiry}
              onChange={(e) => {
                if (e.target.checked) {
                  setExpirationDate('');
                }
                setNoExpiry(e.target.checked);
              }}
            />
            No Expiry
          </label>
        </div>

        <button style={styles.submitButton} onClick={addResupplyItem}>
          Add Item
        </button>
      </div>

      {resupplyItems.length > 0 && (
        <div style={styles.listContainer}>
          <h3>Items to Resupply</h3>
          <ul>
            {resupplyItems.map((item, idx) => {
              const prod = products.find((p) => p.product_id === item.product_id);
              return (
                <li key={idx}>
                  {prod ? prod.name : 'Unknown Product'} - Qty: {item.quantity}, Unit Cost: {item.unit_cost}, Exp: {item.expiration_date}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button style={styles.submitButton} onClick={handleResupply}>
        Submit All Resupplies
      </button>
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
