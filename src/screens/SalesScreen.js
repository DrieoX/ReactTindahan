import React, { useState, useEffect } from 'react';
import { db } from '../db';

export default function POSScreen({ userMode }) {
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState([]);
  const [products, setProducts] = useState([]);
  const [amountReceived, setAmountReceived] = useState('');
  const mode = userMode || 'client';

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const prodRes = await db.products.toArray();
      setProducts(prodRes.map(p => ({
        id: p.product_id,
        name: p.name,
        price: parseFloat(p.unit_price) || 0,
        stock: p.quantity || 0,
      })));
    } catch (err) {
      console.error('Error loading products:', err);
    }
  };

  const addToCart = (product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const updateQuantity = (id, qty) => {
    if (qty < 1) {
      setCart(cart.filter(item => item.id !== id));
    } else {
      setCart(cart.map(item => item.id === id ? { ...item, quantity: qty } : item));
    }
  };

  const calculateSubtotal = () => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const calculateVAT = () => calculateSubtotal() * 0.12;
  const calculateTotal = () => calculateSubtotal() + calculateVAT();
  const calculateChange = () => (parseFloat(amountReceived) || 0) - calculateTotal();

  const handlePayment = async () => {
    if (cart.length === 0) return;
    try {
      const saleId = await db.sales.add({ sales_date: new Date().toISOString().split('T')[0] });

      for (const item of cart) {
        const amount = item.quantity * item.price;

        await db.sale_items.add({
          sales_id: saleId,
          product_id: item.id,
          quantity: item.quantity,
          amount,
        });

        await db.products.where({ product_id: item.id }).modify(p => {
          p.quantity = (p.quantity || 0) - item.quantity;
        });
      }

      setCart([]);
      setAmountReceived('');
      alert('Payment completed successfully!');
      loadProducts();
    } catch (err) {
      console.error('Error handling payment:', err);
    }
  };

  return (
    <div style={styles.container}>
      {/* Barcode Input */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Scan or Enter Product Code</h3>
        <input
          style={styles.input}
          placeholder="Scan or type barcode"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
        />
      </div>

      {/* Quick Add Products */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Quick Add Products</h3>
        <div style={styles.productsGrid}>
          {products.map(p => (
            <div key={p.id} style={styles.productCard}>
              <div>{p.name}</div>
              <div style={{ color: '#64748B', marginBottom: 8 }}>Stock: {p.stock}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>P{p.price.toFixed(2)}</strong>
                <button style={styles.addButton} onClick={() => addToCart(p)}>+ Add</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Shopping Cart */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Shopping Cart</h3>
        {cart.length === 0 ? (
          <div style={styles.cartEmpty}>
            <span style={{ fontSize: 48, color: '#9CA3AF' }}>🛒</span>
            <div style={styles.cartText}>Cart is empty</div>
          </div>
        ) : (
          <div style={styles.cartContainer}>
            {cart.map(item => (
              <div key={item.id} style={styles.cartItem}>
                <div>
                  <div style={{ fontWeight: 500 }}>{item.name}</div>
                  <div style={{ color: '#64748B' }}>P{item.price.toFixed(2)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => updateQuantity(item.id, item.quantity - 1)}>-</button>
                  <span>{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</button>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 16 }}>
              <div>Subtotal: P{calculateSubtotal().toFixed(2)}</div>
              <div>VAT 12%: P{calculateVAT().toFixed(2)}</div>
              <div>Total: P{calculateTotal().toFixed(2)}</div>

              <input
                style={styles.paymentInput}
                placeholder="Amount Received"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
              />
              <div>Change: P{calculateChange().toFixed(2)}</div>
              <button style={styles.completePaymentButton} onClick={handlePayment}>
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
  mainContainer: {
    display: 'flex',
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    minHeight: '100vh',
  },

  // Sidebar
  sidebar: {
    flexShrink: 0,
    width: 'clamp(160px, 20vw, 220px)', // scales with screen size
    backgroundColor: '#fff',
    borderRight: '1px solid #E5E7EB',
  },
  sidebarHeader: {
    height: 'clamp(60px, 10vh, 80px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottom: '1px solid #E5E7EB',
  },
  sidebarHeaderText: {
    fontSize: 'clamp(16px, 1.5vw, 18px)',
    fontWeight: 700,
    color: '#111827',
  },
  sidebarItem: {
    display: 'flex',
    alignItems: 'center',
    padding: 'clamp(12px, 2vw, 16px)',
    gap: 'clamp(6px, 1vw, 8px)',
    cursor: 'pointer',
  },
  sidebarText: {
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    color: '#374151',
  },
  activeNavText: {
    color: '#3B82F6',
    fontWeight: 600,
  },

  // Main content
  container: {
    flex: 1,
    padding: 'clamp(12px, 2vw, 24px)',
  },
  section: {
    marginBottom: 'clamp(16px, 3vw, 24px)',
  },
  sectionTitle: {
    fontSize: 'clamp(16px, 1.8vw, 18px)',
    fontWeight: 600,
    marginBottom: 'clamp(8px, 1.5vw, 12px)',
  },
  input: {
    width: '100%',
    padding: 'clamp(10px, 2.5vw, 12px)',
    borderRadius: 8,
    border: '1px solid #D1D5DB',
    marginBottom: 'clamp(10px, 2vw, 12px)',
  },

  // Products grid
  productsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 'clamp(12px, 2vw, 16px)',
  },
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 'clamp(10px, 2.5vw, 12px)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  addButton: {
    backgroundColor: '#10B981',
    padding: '6px 10px',
    borderRadius: 6,
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    fontSize: 'clamp(12px, 1.4vw, 14px)',
  },

  // Cart
  cartContainer: {
    backgroundColor: '#fff',
    padding: 'clamp(12px, 2vw, 16px)',
    borderRadius: 8,
    marginTop: 'clamp(16px, 2vw, 20px)',
  },
  cartItem: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 'clamp(10px, 2vw, 12px)',
  },
  cartEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'clamp(20px, 6vw, 40px)',
  },
  cartText: {
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    fontWeight: 600,
    color: '#6B7280',
    marginTop: 'clamp(12px, 2vw, 16px)',
  },

  // Payment
  paymentInput: {
    width: '100%',
    padding: 'clamp(10px, 2.5vw, 12px)',
    borderRadius: 8,
    border: '1px solid #D1D5DB',
    margin: 'clamp(6px, 1vw, 8px) 0',
  },
  completePaymentButton: {
    backgroundColor: '#10B981',
    padding: 'clamp(10px, 2.5vw, 12px)',
    borderRadius: 8,
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    width: '100%',
  },
};
