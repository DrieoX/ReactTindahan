import React, { useState, useEffect, useRef } from 'react';
import { db } from '../db';

export default function POSScreen({ userMode }) {
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState([]);
  const [products, setProducts] = useState([]);
  const [cashGiven, setCashGiven] = useState('');
  const [clickedButtons, setClickedButtons] = useState({});
  const mode = userMode || 'client';
  const inputRef = useRef(null);

  useEffect(() => {
    loadProducts();

    // ✅ Automatically capture scanner input globally, unless typing manually
    const handleGlobalScan = (e) => {
      if (document.activeElement === inputRef.current) return; // ignore if typing manually

      if (e.key === 'Enter' && barcode.trim()) {
        const product = products.find(p => p.sku === barcode.trim());
        if (product) {
          addToCart(product, 1);
          setBarcode('');
        } else {
          alert('Product not found for scanned code!');
          setBarcode('');
        }
      } else if (e.key.length === 1) {
        // Collect characters typed by scanner
        setBarcode(prev => prev + e.key);
      }
    };

    window.addEventListener('keydown', handleGlobalScan);
    return () => window.removeEventListener('keydown', handleGlobalScan);
  }, [barcode, products]);

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

  const loadProducts = async () => {
    try {
      const prodRes = await db.products.toArray();
      const inventoryData = await db.inventory.toArray();

      const enrichedProducts = prodRes.map(p => {
        const inv = inventoryData.find(i => i.product_id === p.product_id);
        return {
          id: p.product_id,
          sku: p.sku,
          name: p.name,
          price: parseFloat(p.unit_price) || 0,
          stock: inv?.quantity || 0,
          baseUnit: p.base_unit || "unit"
        };
      });

      setProducts(enrichedProducts);
    } catch (err) {
      console.error('Error loading products:', err);
    }
  };

  const addToCart = (product, qty = 1) => {
    if (!product) return;
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      if (existing.quantity + qty > product.stock) return alert('Not enough stock!');
      setCart(cart.map(item =>
        item.id === product.id ? { ...item, quantity: item.quantity + qty } : item
      ));
    } else {
      if (product.stock < qty) return alert('Not enough stock!');
      setCart([...cart, { ...product, quantity: qty }]);
    }
  };

  const updateQuantity = (id, qty) => {
    const product = products.find(p => p.id === id);
    if (qty < 0) return;
    if (qty > product.stock) {
      alert('Not enough stock!');
    } else {
      setCart(cart.map(item => item.id === id ? { ...item, quantity: qty } : item));
    }
  };

  const handleQuantityInput = (id, value) => {
    const qty = parseInt(value) || 0;
    updateQuantity(id, qty);
  };

  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const cancelAll = () => {
    if (window.confirm('Are you sure you want to cancel all items?')) {
      setCart([]);
    }
  };

  const calculateTotal = () => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handlePayment = async () => {
    if (cart.length === 0) return alert('Cart is empty!');

    const total = calculateTotal();
    const given = parseFloat(cashGiven) || 0;

    if (given < total) {
      return alert(`Payment insufficient! Short by ₱${(total - given).toFixed(2)}`);
    }

    try {
      const saleId = await db.sales.add({ sales_date: new Date().toISOString().split('T')[0] });

      for (const item of cart) {
        const amount = item.quantity * item.price;

        await db.sale_items.add({
          sales_id: saleId,
          product_id: item.id,
          quantity: item.quantity,
          amount,
          total_amount: total
        });

        await db.inventory.where({ product_id: item.id }).modify(inv => {
          inv.quantity -= item.quantity;
          if (inv.quantity < 0) inv.quantity = 0;
        });
      }

      const change = (given - total).toFixed(2);
      setCart([]);
      setCashGiven('');
      alert(`Payment completed! Change: ₱${change}`);
      loadProducts();
    } catch (err) {
      console.error('Error handling payment:', err);
    }
  };

  return (
    <div style={styles.container}>
      {/* Barcode Input (Manual fallback only) */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Scan Product (SKU)</h3>
        <input
          ref={inputRef}
          style={styles.input}
          placeholder="If scanner unavailable, type SKU here"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && barcode.trim()) {
              const product = products.find(p => p.sku === barcode.trim());
              if (product) {
                addToCart(product, 1);
                setBarcode('');
              } else {
                alert('Product not found for scanned code!');
                setBarcode('');
              }
            }
          }}
        />
      </div>

      {/* POS Section */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Point of Sale</h3>
        {cart.length === 0 ? (
          <div style={styles.cartEmpty}>
            <span style={{ fontSize: 48, color: '#9CA3AF' }}>🛒</span>
            <div style={styles.cartText}>No items scanned</div>
          </div>
        ) : (
          <div style={styles.cartContainer}>
            {/* Cancel All Button */}
            <button
              onClick={() => handleButtonClick('cancelAll', cancelAll)}
              style={{
                ...styles.cancelButton,
                backgroundColor: clickedButtons['cancelAll'] ? '#ffffff' : '#ef4444',
                color: clickedButtons['cancelAll'] ? '#ef4444' : '#ffffff',
                border: clickedButtons['cancelAll'] ? '2px solid #ef4444' : 'none',
              }}
            >
              Cancel All
            </button>

            {/* Cart Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f3f4f6', textAlign: 'left' }}>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>SKU</th>
                  <th style={styles.th}>Price</th>
                  <th style={styles.th}>Stock</th>
                  <th style={styles.th}>Quantity</th>
                  <th style={styles.th}>Total</th>
                  <th style={styles.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {cart.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                    <td style={styles.td}>{item.name}</td>
                    <td style={styles.td}>{item.sku}</td>
                    <td style={styles.td}>₱{item.price.toFixed(2)}</td>
                    <td style={styles.td}>{item.stock} {item.baseUnit}</td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button 
                          onClick={() => handleButtonClick(`decrease-${item.id}`, () => updateQuantity(item.id, item.quantity - 1))}
                          style={{
                            ...styles.quantityButton,
                            backgroundColor: clickedButtons[`decrease-${item.id}`] ? '#ffffff' : '#0ea5e9',
                            color: clickedButtons[`decrease-${item.id}`] ? '#0ea5e9' : '#ffffff',
                            border: clickedButtons[`decrease-${item.id}`] ? '2px solid #0ea5e9' : 'none',
                          }}
                        >-</button>
                        <input
                          type="number"
                          value={item.quantity}
                          style={{ width: 50, textAlign: 'center' }}
                          onChange={(e) => handleQuantityInput(item.id, e.target.value)}
                        />
                        <button 
                          onClick={() => handleButtonClick(`increase-${item.id}`, () => updateQuantity(item.id, item.quantity + 1))}
                          style={{
                            ...styles.quantityButton,
                            backgroundColor: clickedButtons[`increase-${item.id}`] ? '#ffffff' : '#0ea5e9',
                            color: clickedButtons[`increase-${item.id}`] ? '#0ea5e9' : '#ffffff',
                            border: clickedButtons[`increase-${item.id}`] ? '2px solid #0ea5e9' : 'none',
                          }}
                        >+</button>
                      </div>
                    </td>
                    <td style={styles.td}>₱{(item.price * item.quantity).toFixed(2)}</td>
                    <td style={styles.td}>
                      <button
                        onClick={() => handleButtonClick(`remove-${item.id}`, () => removeFromCart(item.id))}
                        style={{
                          ...styles.removeButton,
                          backgroundColor: clickedButtons[`remove-${item.id}`] ? '#ffffff' : '#ef4444',
                          color: clickedButtons[`remove-${item.id}`] ? '#ef4444' : '#ffffff',
                          border: clickedButtons[`remove-${item.id}`] ? '2px solid #ef4444' : 'none',
                        }}
                      >
                        cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Payment Section */}
            <div style={{ marginTop: 16 }}>
              <div>Total: ₱{calculateTotal().toFixed(2)}</div>
              <div style={{ marginTop: 8 }}>
                <input
                  type="number"
                  placeholder="Cash given"
                  value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value)}
                  style={{ width: 150, padding: 4, marginRight: 8 }}
                />
                {cashGiven && (
                  <span>
                    {parseFloat(cashGiven) >= calculateTotal()
                      ? `Change: ₱${(parseFloat(cashGiven) - calculateTotal()).toFixed(2)}`
                      : `Short: ₱${(calculateTotal() - parseFloat(cashGiven)).toFixed(2)}`}
                  </span>
                )}
              </div>
              <button 
                onClick={() => handleButtonClick('completePayment', handlePayment)}
                style={{
                  ...styles.completePaymentButton,
                  backgroundColor: clickedButtons['completePayment'] ? '#ffffff' : '#0ea5e9',
                  color: clickedButtons['completePayment'] ? '#0ea5e9' : '#ffffff',
                  border: clickedButtons['completePayment'] ? '2px solid #0ea5e9' : 'none',
                }}
              >
                Complete Payment
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    flex: 1,
    padding: '24px',
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '12px',
  },
  input: {
    width: '100%',
    padding: '10px',
    borderRadius: 8,
    border: '1px solid #D1D5DB',
    marginBottom: '12px',
  },
  cartContainer: {
    backgroundColor: '#fff',
    padding: '16px',
    borderRadius: 8,
    marginTop: '20px',
  },
  th: {
    padding: '8px',
    fontWeight: 600,
    borderBottom: '2px solid #E5E7EB',
  },
  td: {
    padding: '8px',
  },
  cartEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px',
  },
  cartText: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#6B7280',
    marginTop: '16px',
  },
  // Button Styles
  cancelButton: {
    padding: '6px 12px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    marginBottom: 10,
    fontSize: '14px',
    fontWeight: 500,
    transition: 'all 0.2s ease',
  },
  quantityButton: {
    padding: '4px 8px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    transition: 'all 0.2s ease',
  },
  removeButton: {
    padding: '4px 8px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    transition: 'all 0.2s ease',
  },
  completePaymentButton: {
    padding: '12px',
    borderRadius: 8,
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    fontSize: '16px',
    width: '100%',
    marginTop: '12px',
    transition: 'all 0.2s ease',
  },
};