import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../db';
import * as API from '../services/APIService';

export default function POSScreen({ userMode }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState([]);
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [cashGiven, setCashGiven] = useState('');
  const [loading, setLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const mode = userMode || 'client';
  const inputRef = useRef(null);
  const productsRef = useRef([]);

  // Load products
  useEffect(() => {
    let mounted = true;
    
    const loadProducts = async () => {
      setLoading(true);
      try {
        let prodData = [];
        let invData = [];

        if (mode === 'server') {
          prodData = await db.products.toArray();
          invData = await db.inventory.toArray();
        } else {
          try {
            const [apiProducts, apiInventory] = await Promise.all([
              API.fetchProducts(),
              API.fetchInventory()
            ]);
            
            prodData = apiProducts || [];
            invData = apiInventory || [];
          } catch (err) {
            console.error('Error loading products from API:', err);
            prodData = await db.products.toArray();
            invData = await db.inventory.toArray();
          }
        }

        const enrichedProducts = prodData.map(p => {
          const inv = invData.find(i => 
            i.product_id === p.product_id || 
            i.id === p.product_id || 
            i.id === p.id
          );
          return {
            id: p.product_id || p.id,
            sku: p.sku,
            name: p.name,
            price: parseFloat(p.unit_price) || 0,
            stock: inv?.quantity || 0,
            baseUnit: p.base_unit || "unit"
          };
        });

        if (mounted) {
          setProducts(enrichedProducts);
          productsRef.current = enrichedProducts;
          setFilteredProducts(enrichedProducts);
          setInitialLoadComplete(true);
        }
      } catch (err) {
        console.error('Error loading products:', err);
        if (mounted) {
          setProducts([]);
          setFilteredProducts([]);
          productsRef.current = [];
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadProducts();

    return () => {
      mounted = false;
    };
  }, [mode]);

  // Filter products based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredProducts(products);
      setShowSuggestions(false);
      return;
    }

    const searchLower = searchTerm.toLowerCase();
    const filtered = products.filter(product => 
      product.name.toLowerCase().includes(searchLower) ||
      product.sku.toLowerCase().includes(searchLower)
    );
    
    setFilteredProducts(filtered);
    setShowSuggestions(true);
  }, [searchTerm, products]);

  // Scanner handler
  useEffect(() => {
    const handleGlobalScan = (e) => {
      if (document.activeElement === inputRef.current) return;

      if (e.key === 'Enter' && barcode.trim()) {
        handleProductSearch(barcode.trim(), true);
        setBarcode('');
      } else if (e.key.length === 1) {
        setBarcode(prev => prev + e.key);
      }
    };

    window.addEventListener('keydown', handleGlobalScan);
    return () => window.removeEventListener('keydown', handleGlobalScan);
  }, [barcode]);

  const handleProductSearch = (input, isBarcode = false) => {
    const searchLower = input.toLowerCase();
    const matchingProducts = products.filter(product => 
      (isBarcode && product.sku.toLowerCase() === searchLower) ||
      (!isBarcode && (
        product.name.toLowerCase().includes(searchLower) ||
        product.sku.toLowerCase().includes(searchLower)
      ))
    );

    if (matchingProducts.length === 1) {
      // Single match - add to cart
      addToCart(matchingProducts[0], 1);
      setSearchTerm('');
      setShowSuggestions(false);
    } else if (matchingProducts.length > 1) {
      // Multiple matches - show suggestions
      setFilteredProducts(matchingProducts);
      setShowSuggestions(true);
    } else {
      alert('Product not found!');
      setSearchTerm('');
      setShowSuggestions(false);
    }
  };

  const addToCart = useCallback((product, qty = 1) => {
    if (!product) return;
    const existing = cart.find(item => item.id === product.id);
    
    if (existing) {
      if (existing.quantity + qty > product.stock) {
        alert('Not enough stock!');
        return;
      }
      setCart(cart.map(item =>
        item.id === product.id ? { ...item, quantity: item.quantity + qty } : item
      ));
    } else {
      if (product.stock < qty) {
        alert('Not enough stock!');
        return;
      }
      setCart([...cart, { ...product, quantity: qty }]);
    }
    setSearchTerm('');
    setShowSuggestions(false);
  }, [cart]);

  const updateQuantity = useCallback((id, qty) => {
    if (qty < 0) return;
    const product = products.find(p => p.id === id);
    if (!product) return;
    
    if (qty > product.stock) {
      alert('Not enough stock!');
    } else {
      setCart(prevCart => prevCart.map(item => item.id === id ? { ...item, quantity: qty } : item));
    }
  }, [products]);

  const handleQuantityInput = useCallback((id, value) => {
    const qty = parseInt(value) || 0;
    updateQuantity(id, qty);
  }, [updateQuantity]);

  const removeFromCart = useCallback((id) => {
    setCart(prevCart => prevCart.filter(item => item.id !== id));
  }, []);

  const cancelAll = useCallback(() => {
    if (cart.length === 0) return;
    if (window.confirm('Are you sure you want to cancel all items?')) {
      setCart([]);
    }
  }, [cart]);

  const calculateTotal = useCallback(() => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [cart]);

  const handlePayment = async () => {
    if (cart.length === 0) return alert('Cart is empty!');

    const total = calculateTotal();
    const given = parseFloat(cashGiven) || 0;

    if (given < total) {
      return alert(`Payment insufficient! Short by ₱${(total - given).toFixed(2)}`);
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      
      if (mode === 'server') {
        const saleId = await db.sales.add({ 
          sales_date: today,
          user_id: 1 
        });

        for (const item of cart) {
          const amount = item.quantity * item.price;

          await db.sale_items.add({
            sales_id: saleId,
            product_id: item.id,
            quantity: item.quantity,
            amount,
            total_amount: amount
          });

          await db.inventory.where({ product_id: item.id }).modify(inv => {
            inv.quantity -= item.quantity;
            if (inv.quantity < 0) inv.quantity = 0;
          });
        }
      } else {
        const saleData = {
          sales_date: today,
          user_id: 1
        };

        try {
          const saleResponse = await API.addSale(saleData);
          const saleId = saleResponse.sales_id || saleResponse.id;

          for (const item of cart) {
            const saleItemData = {
              sales_id: saleId,
              product_id: item.id,
              quantity: item.quantity,
              amount: item.quantity * item.price
            };
            await API.addSaleItems(saleItemData);

            const inventoryResponse = await API.fetchInventory();
            const currentItem = inventoryResponse.find(i => 
              i.product_id === item.id || i.id === item.id
            );
            
            if (currentItem) {
              const updatedQuantity = (currentItem.quantity || 0) - item.quantity;
              await API.updateInventoryItem(item.id, {
                quantity: Math.max(updatedQuantity, 0),
                expiration_date: currentItem.expiration_date,
                threshold: currentItem.threshold,
                supplier_id: currentItem.supplier_id
              });
            }
          }
        } catch (apiErr) {
          console.error('API error during payment:', apiErr);
          const saleId = await db.sales.add({ 
            sales_date: today,
            user_id: 1 
          });

          for (const item of cart) {
            const amount = item.quantity * item.price;

            await db.sale_items.add({
              sales_id: saleId,
              product_id: item.id,
              quantity: item.quantity,
              amount,
              total_amount: amount
            });
          }
        }
      }

      const change = (given - total).toFixed(2);
      
      const receiptMessage = `
✅ PAYMENT COMPLETED!

Total: ₱${total.toFixed(2)}
Cash Given: ₱${given.toFixed(2)}
Change: ₱${change}

Items Purchased:
${cart.map(item => `  • ${item.name} x${item.quantity} = ₱${(item.price * item.quantity).toFixed(2)}`).join('\n')}

Thank you for your purchase!
      `.trim();

      alert(receiptMessage);
      
      setCart([]);
      setCashGiven('');
      setLoading(true);
      const prodData = mode === 'server' ? await db.products.toArray() : await API.fetchProducts();
      const invData = mode === 'server' ? await db.inventory.toArray() : await API.fetchInventory();
      
      const enrichedProducts = prodData.map(p => {
        const inv = invData.find(i => 
          i.product_id === p.product_id || 
          i.id === p.product_id || 
          i.id === p.id
        );
        return {
          id: p.product_id || p.id,
          sku: p.sku,
          name: p.name,
          price: parseFloat(p.unit_price) || 0,
          stock: inv?.quantity || 0,
          baseUnit: p.base_unit || "unit"
        };
      });
      
      setProducts(enrichedProducts);
      productsRef.current = enrichedProducts;
      setLoading(false);
    } catch (err) {
      console.error('Error handling payment:', err);
      alert('Payment failed: ' + err.message);
    }
  };

  const handleSearchSubmit = () => {
    if (!searchTerm.trim()) return;
    handleProductSearch(searchTerm, false);
  };

  const handleSuggestionClick = (product) => {
    addToCart(product, 1);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.pageTitle}>Point of Sale</h1>
        <p style={styles.pageSubtitle}>
          Scan or search products and process sales transactions
          <span style={styles.modeIndicator}> | Mode: {mode === 'server' ? 'Local Database' : 'API Server'}</span>
        </p>
      </div>

      {/* Search/Scan Section */}
      <div style={styles.searchSection}>
        <div style={styles.searchCard}>
          <h3 style={styles.sectionTitle}>Add Product</h3>
          <div style={styles.searchRow}>
            <div style={styles.searchInputGroup}>
              <input
                ref={inputRef}
                style={styles.searchInput}
                placeholder="Type product name or SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
              />
              <button 
                onClick={handleSearchSubmit}
                style={styles.searchButton}
                disabled={!searchTerm.trim()}
              >
                Search
              </button>
            </div>
            <div style={styles.scannerInfo}>
              <div style={styles.scannerLabel}>Barcode Scanner Ready</div>
              <div style={styles.scannerHint}>Scan SKU directly (auto-detected)</div>
            </div>
          </div>
          
          {/* Product Suggestions */}
          {showSuggestions && filteredProducts.length > 0 && (
            <div style={styles.suggestionsContainer}>
              <div style={styles.suggestionsHeader}>
                <span>Found {filteredProducts.length} matching product(s)</span>
                <button 
                  onClick={() => setShowSuggestions(false)}
                  style={styles.closeSuggestions}
                >
                  ✕
                </button>
              </div>
              <div style={styles.suggestionsGrid}>
                {filteredProducts.map(product => (
                  <div
                    key={product.id}
                    style={styles.productSuggestion}
                    onClick={() => handleSuggestionClick(product)}
                  >
                    <div style={styles.suggestionInfo}>
                      <div style={styles.suggestionName}>{product.name}</div>
                      <div style={styles.suggestionDetails}>
                        <span>SKU: {product.sku}</span>
                        <span>Stock: {product.stock} {product.baseUnit}</span>
                        <span>Price: ₱{product.price.toFixed(2)}</span>
                      </div>
                    </div>
                    <div style={styles.suggestionAction}>
                      <button style={styles.addButton}>
                        Add to Cart
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cart Summary Bar */}
      {cart.length > 0 && (
        <div style={styles.summaryBar}>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Items in Cart:</span>
            <span style={styles.summaryValue}>{cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Total Amount:</span>
            <span style={styles.summaryValue}>₱{calculateTotal().toFixed(2)}</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Unique Products:</span>
            <span style={styles.summaryValue}>{cart.length}</span>
          </div>
        </div>
      )}

      {/* Cart Section */}
      <div style={styles.cartSection}>
        <div style={styles.cartCard}>
          <div style={styles.cartHeader}>
            <h3 style={styles.cartTitle}>
              Current Sale {cart.length > 0 && `(${cart.length} items)`}
            </h3>
            {cart.length > 0 && (
              <button
                onClick={cancelAll}
                style={styles.cancelAllButton}
              >
                Clear All Items
              </button>
            )}
          </div>
          
          {loading && !initialLoadComplete ? (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <div style={styles.loadingText}>Loading products...</div>
            </div>
          ) : cart.length === 0 ? (
            <div style={styles.emptyCart}>
              <div style={styles.emptyCartIcon}>🛒</div>
              <div style={styles.emptyCartTitle}>Cart is Empty</div>
              <div style={styles.emptyCartText}>
                Search for products above or scan barcodes to begin
              </div>
              <div style={styles.productStats}>
                <span style={styles.productStat}>
                  <strong>{products.length}</strong> products available
                </span>
                <span style={styles.productStat}>
                  <strong>{products.filter(p => p.stock > 0).length}</strong> in stock
                </span>
              </div>
            </div>
          ) : (
            <>
              <div style={styles.cartTableContainer}>
                <table style={styles.cartTable}>
                  <thead>
                    <tr style={styles.tableHeader}>
                      <th style={styles.tableHeaderCell}>Product</th>
                      <th style={styles.tableHeaderCell}>SKU</th>
                      <th style={styles.tableHeaderCell}>Price</th>
                      <th style={styles.tableHeaderCell}>Stock</th>
                      <th style={styles.tableHeaderCell}>Quantity</th>
                      <th style={styles.tableHeaderCell}>Total</th>
                      <th style={styles.tableHeaderCell}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map(item => (
                      <tr key={item.id} style={styles.tableRow}>
                        <td style={styles.tableCell}>
                          <div style={styles.productInfo}>
                            <div style={styles.productName}>{item.name}</div>
                            <div style={styles.productUnit}>{item.baseUnit}</div>
                          </div>
                        </td>
                        <td style={styles.tableCell}>
                          <span style={styles.skuLabel}>{item.sku}</span>
                        </td>
                        <td style={styles.tableCell}>
                          <span style={styles.price}>₱{item.price.toFixed(2)}</span>
                        </td>
                        <td style={styles.tableCell}>
                          <span style={{
                            ...styles.stock,
                            ...(item.stock <= 10 ? styles.lowStock : styles.normalStock)
                          }}>
                            {item.stock} {item.baseUnit}
                          </span>
                        </td>
                        <td style={styles.tableCell}>
                          <div style={styles.quantityControls}>
                            <button 
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              style={styles.quantityButton}
                              disabled={item.quantity <= 1}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              value={item.quantity}
                              style={styles.quantityInput}
                              onChange={(e) => handleQuantityInput(item.id, e.target.value)}
                              min="1"
                              max={item.stock}
                            />
                            <button 
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              style={styles.quantityButton}
                              disabled={item.quantity >= item.stock}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td style={styles.tableCell}>
                          <span style={styles.itemTotal}>
                            ₱{(item.price * item.quantity).toFixed(2)}
                          </span>
                        </td>
                        <td style={styles.tableCell}>
                          <button
                            style={styles.removeButton}
                            onClick={() => removeFromCart(item.id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Payment Section */}
              <div style={styles.paymentSection}>
                <div style={styles.paymentSummary}>
                  <div style={styles.totalRow}>
                    <span style={styles.totalLabel}>Subtotal:</span>
                    <span style={styles.totalValue}>₱{calculateTotal().toFixed(2)}</span>
                  </div>
                  <div style={styles.cashInputGroup}>
                    <label style={styles.cashLabel}>Cash Payment:</label>
                    <div style={styles.cashInputWrapper}>
                      <span style={styles.currencySymbol}>₱</span>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={cashGiven}
                        onChange={(e) => setCashGiven(e.target.value)}
                        style={styles.cashInput}
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                  
                  {cashGiven && (
                    <div style={styles.changeDisplay}>
                      {parseFloat(cashGiven) >= calculateTotal() ? (
                        <div style={styles.changePositive}>
                          <span>Change Due:</span>
                          <span style={styles.changeAmount}>
                            ₱{(parseFloat(cashGiven) - calculateTotal()).toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <div style={styles.changeNegative}>
                          <span>Additional Needed:</span>
                          <span style={styles.changeAmount}>
                            ₱{(calculateTotal() - parseFloat(cashGiven)).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <button 
                    style={{
                      ...styles.paymentButton,
                      ...((!cashGiven || parseFloat(cashGiven) < calculateTotal()) && styles.paymentButtonDisabled)
                    }} 
                    onClick={handlePayment}
                    disabled={!cashGiven || parseFloat(cashGiven) < calculateTotal()}
                  >
                    Complete Payment
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    flex: 1,
    padding: '28px',
    backgroundColor: '#f8fafc',
    minHeight: '100vh',
  },
  header: {
    marginBottom: '32px',
  },
  pageTitle: {
    fontSize: '32px',
    fontWeight: 700,
    color: '#1e293b',
    margin: 0,
    marginBottom: '8px',
  },
  pageSubtitle: {
    fontSize: '16px',
    color: '#64748b',
    margin: 0,
  },
  modeIndicator: {
    fontWeight: 600,
    color: '#3b82f6',
    marginLeft: '8px',
  },
  searchSection: {
    marginBottom: '24px',
  },
  searchCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    position: 'relative',
  },
  searchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  },
  searchInputGroup: {
    flex: 1,
    display: 'flex',
    gap: '12px',
  },
  searchInput: {
    flex: 1,
    padding: '14px 16px',
    borderRadius: '12px',
    border: '2px solid #e2e8f0',
    fontSize: '16px',
    transition: 'all 0.2s',
    outline: 'none',
  },
  searchInputFocus: {
    borderColor: '#3b82f6',
    boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)',
  },
  searchButton: {
    padding: '14px 28px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  searchButtonDisabled: {
    backgroundColor: '#cbd5e1',
    cursor: 'not-allowed',
  },
  scannerInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 20px',
    backgroundColor: '#f0f9ff',
    borderRadius: '12px',
    border: '2px dashed #7dd3fc',
  },
  scannerLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#0369a1',
  },
  scannerHint: {
    fontSize: '13px',
    color: '#0ea5e9',
    marginTop: '4px',
  },
  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderRadius: '0 0 16px 16px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
    marginTop: '4px',
    zIndex: 1000,
    borderTop: '1px solid #f1f5f9',
    maxHeight: '400px',
    overflowY: 'auto',
  },
  suggestionsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
    fontSize: '14px',
    color: '#64748b',
  },
  closeSuggestions: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '6px',
    transition: 'all 0.2s',
  },
  suggestionsGrid: {
    padding: '12px',
  },
  productSuggestion: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px',
    borderBottom: '1px solid #f1f5f9',
    cursor: 'pointer',
    transition: 'all 0.2s',
    borderRadius: '8px',
  },
  productSuggestionHover: {
    backgroundColor: '#f8fafc',
  },
  suggestionInfo: {
    flex: 1,
  },
  suggestionName: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1e293b',
    marginBottom: '6px',
  },
  suggestionDetails: {
    display: 'flex',
    gap: '20px',
    fontSize: '14px',
    color: '#64748b',
  },
  suggestionAction: {
    marginLeft: '16px',
  },
  addButton: {
    padding: '10px 20px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  summaryBar: {
    display: 'flex',
    gap: '32px',
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px 24px',
    marginBottom: '24px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
  },
  summaryItem: {
    display: 'flex',
    flexDirection: 'column',
  },
  summaryLabel: {
    fontSize: '14px',
    color: '#64748b',
    marginBottom: '4px',
  },
  summaryValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#1e293b',
  },
  cartSection: {
    marginBottom: '24px',
  },
  cartCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  },
  cartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  cartTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#1e293b',
    margin: 0,
  },
  cancelAllButton: {
    padding: '10px 20px',
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    border: '2px solid #fecaca',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 0',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e2e8f0',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: '16px',
    fontSize: '16px',
    color: '#64748b',
  },
  emptyCart: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '60px 0',
    textAlign: 'center',
  },
  emptyCartIcon: {
    fontSize: '64px',
    marginBottom: '20px',
    color: '#cbd5e1',
  },
  emptyCartTitle: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#1e293b',
    marginBottom: '12px',
  },
  emptyCartText: {
    fontSize: '16px',
    color: '#64748b',
    marginBottom: '24px',
    maxWidth: '400px',
  },
  productStats: {
    display: 'flex',
    gap: '32px',
  },
  productStat: {
    fontSize: '14px',
    color: '#475569',
  },
  cartTableContainer: {
    overflowX: 'auto',
    marginBottom: '32px',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
  },
  cartTable: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '800px',
  },
  tableHeader: {
    backgroundColor: '#f8fafc',
  },
  tableHeaderCell: {
    padding: '16px 20px',
    textAlign: 'left',
    fontSize: '14px',
    fontWeight: 600,
    color: '#475569',
    borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap',
  },
  tableRow: {
    borderBottom: '1px solid #f1f5f9',
    transition: 'all 0.2s',
  },
  tableRowHover: {
    backgroundColor: '#f8fafc',
  },
  tableCell: {
    padding: '20px',
    fontSize: '14px',
    color: '#334155',
  },
  productInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  productName: {
    fontWeight: 600,
    color: '#1e293b',
    marginBottom: '4px',
  },
  productUnit: {
    fontSize: '13px',
    color: '#94a3b8',
    backgroundColor: '#f1f5f9',
    padding: '2px 8px',
    borderRadius: '4px',
    alignSelf: 'flex-start',
  },
  skuLabel: {
    fontFamily: 'monospace',
    backgroundColor: '#f0f9ff',
    padding: '6px 12px',
    borderRadius: '6px',
    color: '#0369a1',
    fontSize: '13px',
    fontWeight: 600,
  },
  price: {
    fontWeight: 600,
    color: '#1e293b',
  },
  stock: {
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: 600,
  },
  lowStock: {
    backgroundColor: '#fef2f2',
    color: '#dc2626',
  },
  normalStock: {
    backgroundColor: '#f0fdf4',
    color: '#16a34a',
  },
  quantityControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  quantityButton: {
    width: '36px',
    height: '36px',
    backgroundColor: '#f1f5f9',
    border: 'none',
    borderRadius: '8px',
    fontSize: '18px',
    fontWeight: 600,
    color: '#475569',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  quantityButtonDisabled: {
    backgroundColor: '#f8fafc',
    color: '#cbd5e1',
    cursor: 'not-allowed',
  },
  quantityInput: {
    width: '60px',
    padding: '8px',
    textAlign: 'center',
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    outline: 'none',
  },
  itemTotal: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#1e293b',
  },
  removeButton: {
    padding: '8px 16px',
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  paymentSection: {
    borderTop: '2px solid #f1f5f9',
    paddingTop: '32px',
  },
  paymentSummary: {
    maxWidth: '400px',
    marginLeft: 'auto',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '2px solid #f1f5f9',
  },
  totalLabel: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#475569',
  },
  totalValue: {
    fontSize: '32px',
    fontWeight: 700,
    color: '#1e293b',
  },
  cashInputGroup: {
    marginBottom: '24px',
  },
  cashLabel: {
    display: 'block',
    fontSize: '16px',
    fontWeight: 600,
    color: '#475569',
    marginBottom: '12px',
  },
  cashInputWrapper: {
    display: 'flex',
    alignItems: 'center',
    border: '2px solid #e2e8f0',
    borderRadius: '12px',
    overflow: 'hidden',
    transition: 'all 0.2s',
  },
  cashInputWrapperFocus: {
    borderColor: '#3b82f6',
    boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)',
  },
  currencySymbol: {
    padding: '16px 12px 16px 20px',
    backgroundColor: '#f8fafc',
    fontSize: '18px',
    fontWeight: 600,
    color: '#475569',
    borderRight: '2px solid #e2e8f0',
  },
  cashInput: {
    flex: 1,
    padding: '16px 20px',
    border: 'none',
    fontSize: '18px',
    fontWeight: 600,
    outline: 'none',
    color: '#1e293b',
  },
  changeDisplay: {
    marginBottom: '24px',
    padding: '20px',
    borderRadius: '12px',
  },
  changePositive: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '18px',
    color: '#059669',
  },
  changeNegative: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '18px',
    color: '#dc2626',
  },
  changeAmount: {
    fontSize: '24px',
    fontWeight: 700,
  },
  paymentButton: {
    width: '100%',
    padding: '20px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '18px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  paymentButtonDisabled: {
    backgroundColor: '#cbd5e1',
    cursor: 'not-allowed',
  },
};

// Add this CSS animation for the spinner
const globalStyles = `
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
`;