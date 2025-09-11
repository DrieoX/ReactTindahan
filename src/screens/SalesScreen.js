import React, { useState, useEffect } from 'react';
import { db } from '../db';

export default function POSScreen({ userMode }) {
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState([]);
  const [products, setProducts] = useState([]);
  const mode = userMode || 'client';

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const prodRes = await db.products.toArray();
      const inventoryData = await db.inventory.toArray();

      const enrichedProducts = prodRes.map(p => {
        const inv = inventoryData.find(i => i.product_id === p.product_id);
        return {
          id: p.product_id,
          name: p.name,
          price: parseFloat(p.unit_price) || 0,
          stock: inv?.quantity || 0,
        };
      });

      setProducts(enrichedProducts);
    } catch (err) {
      console.error('Error loading products:', err);
    }
  };

  const addToCart = (product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      if (existing.quantity + 1 > product.stock) return alert('Not enough stock!');
      setCart(cart.map(item =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      if (product.stock < 1) return alert('Not enough stock!');
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const updateQuantity = (id, qty) => {
    const product = products.find(p => p.id === id);
    if (qty < 0) return; // prevent negative quantities
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

  const calculateTotal = () => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handlePayment = async () => {
    if (cart.length === 0) return alert('Cart is empty!');

    // Warn if any item has quantity 0
    const zeroQtyItems = cart.filter(item => item.quantity === 0);
    if (zeroQtyItems.length > 0) {
      return alert('Some items have zero quantity. Adjust before completing payment.');
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
        });

        // Update inventory live stock
        await db.inventory.where({ product_id: item.id }).modify(inv => {
          inv.quantity -= item.quantity;
          if (inv.quantity < 0) inv.quantity = 0;
        });
      }

      setCart([]);
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
                  <input
                    type="number"
                    value={item.quantity}
                    style={{ width: 50, textAlign: 'center' }}
                    onChange={(e) => handleQuantityInput(item.id, e.target.value)}
                  />
                  <button onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</button>
                  <button
                    style={{ marginLeft: 8, backgroundColor: '#EF4444', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}
                    onClick={() => removeFromCart(item.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 16 }}>
              <div>Total: P{calculateTotal().toFixed(2)}</div>
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
  productsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
  },
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  addButton: {
    backgroundColor: '#10B981',
    padding: '6px 10px',
    borderRadius: 6,
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
  },
  cartContainer: {
    backgroundColor: '#fff',
    padding: '16px',
    borderRadius: 8,
    marginTop: '20px',
  },
  cartItem: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '12px',
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
  completePaymentButton: {
    backgroundColor: '#10B981',
    padding: '12px',
    borderRadius: 8,
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    fontSize: '16px',
    width: '100%',
    marginTop: '12px',
  },
};
