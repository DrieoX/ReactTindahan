import React, { useState, useEffect, useRef } from 'react';
import { db } from '../db';

export default function SalesScreen({ userMode }) {
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState([]);
  const [products, setProducts] = useState([]);
  const [cashGiven, setCashGiven] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [clickedButtons, setClickedButtons] = useState({});
  const mode = userMode || 'client';
  const inputRef = useRef(null);
  const searchRef = useRef(null);
  const [isInputFocused, setIsInputFocused] = useState(false);

  useEffect(() => {
    loadProducts();

    const handleGlobalScan = (e) => {
      // Don't capture if user is typing in any input field
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
      }

      if (e.key === 'Enter' && barcode.trim()) {
        handleScan(barcode.trim());
      } else if (e.key.length === 1) {
        setBarcode(prev => prev + e.key);
      }
    };

    window.addEventListener('keydown', handleGlobalScan);
    return () => window.removeEventListener('keydown', handleGlobalScan);
  }, [barcode, products]);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Track when inputs are focused
  useEffect(() => {
    const handleFocus = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        setIsInputFocused(true);
      }
    };

    const handleBlur = () => {
      setIsInputFocused(false);
    };

    document.addEventListener('focusin', handleFocus);
    document.addEventListener('focusout', handleBlur);
    
    return () => {
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('focusout', handleBlur);
    };
  }, []);

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

  const handleSearch = (searchTerm) => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    const term = searchTerm.toLowerCase();
    const results = products.filter(product => 
      product.name.toLowerCase().includes(term) || 
      (product.sku && product.sku.toLowerCase().includes(term))
    );

    setSearchResults(results);
    setShowSearchResults(results.length > 0);
  };

  const handleScan = (code) => {
    // Don't process if user is typing in quantity fields
    if (isInputFocused) return;
    
    // First try to find by SKU
    let product = products.find((p) => p.sku === code);
    
    // If not found by SKU, try to find by name
    if (!product) {
      product = products.find((p) => 
        p.name.toLowerCase() === code.toLowerCase()
      );
    }

    if (product) {
      addToCart(product, 1);
    } else {
      // If no exact match, search and show results
      handleSearch(code);
    }
    setBarcode('');
  };

  const handleSearchSelect = (product) => {
    addToCart(product, 1);
    setShowSearchResults(false);
    setBarcode('');
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
  
  // Calculate total items (sum of all quantities)
  const calculateTotalItems = () => cart.reduce((sum, item) => sum + item.quantity, 0);
  
  // Calculate total amount for each item
  const calculateItemTotal = (item) => (item.price * item.quantity).toFixed(2);

  // Helper function to create reliable date format for stock card
  const getFormattedDateTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  const handlePayment = async () => {
    if (cart.length === 0) return alert('Cart is empty!');

    const total = calculateTotal();
    const given = parseFloat(cashGiven) || 0;

    if (given < total) {
      return alert(`Payment insufficient! Short by ₱${(total - given).toFixed(2)}`);
    }

    try {
      const saleDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const transactionDateTime = getFormattedDateTime(); // YYYY-MM-DD HH:MM:SS

      // Add sale record with time
      const saleId = await db.sales.add({ 
        sales_date: saleDate,
        sales_time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });

      for (const item of cart) {
        const amount = item.quantity * item.price;

        // Add sale item record
        await db.sale_items.add({
          sales_id: saleId,
          product_id: item.id,
          quantity: item.quantity,
          amount,
          total_amount: total
        });

        // Update inventory quantity
        await db.inventory.where({ product_id: item.id }).modify(inv => {
          inv.quantity -= item.quantity;
          if (inv.quantity < 0) inv.quantity = 0;
        });

        // Get current inventory for running balance
        const currentInv = await db.inventory.where({ product_id: item.id }).first();
        const runningBalance = currentInv ? currentInv.quantity : 0;

        // ADD STOCK CARD RECORD FOR THE SALE (STOCK-OUT)
        await db.stock_card.add({
          product_id: item.id,
          quantity: -item.quantity, // Negative for stock-out
          unit_price: item.price,
          transaction_type: 'SALE',
          transaction_date: transactionDateTime,
          sales_id: saleId,
          running_balance: runningBalance
        });
      }

      const change = (given - total).toFixed(2);
      setCart([]);
      setCashGiven('');
      setBarcode('');
      setSearchResults([]);
      setShowSearchResults(false);
      alert(`Payment completed! Change: ₱${change}`);
      loadProducts(); // Refresh product stock data
    } catch (err) {
      console.error('Error handling payment:', err);
      alert('Error processing payment. Please try again.');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.pageTitle}>Point of Sale</h1>
        <p style={styles.pageSubtitle}>Scan or search products to add to cart</p>
      </div>

      {/* Barcode/Search Input */}
      <div style={styles.formCard}>
        <div ref={searchRef} style={styles.searchContainer}>
          <input
            ref={inputRef}
            style={styles.input}
            placeholder="Scan barcode or search product name..."
            value={barcode}
            onChange={(e) => {
              setBarcode(e.target.value);
              handleSearch(e.target.value);
            }}
            onKeyDown={(e) => e.key === 'Enter' && barcode.trim() && handleScan(barcode.trim())}
            onFocus={() => {
              setIsInputFocused(true);
              if (searchResults.length > 0) setShowSearchResults(true);
            }}
            onBlur={() => setIsInputFocused(false)}
          />
          
          {showSearchResults && searchResults.length > 0 && (
            <div style={styles.searchResults}>
              {searchResults.map((product) => (
                <div
                  key={product.id}
                  style={styles.searchResultItem}
                  onClick={() => handleSearchSelect(product)}
                >
                  <div style={styles.searchProductName}>{product.name}</div>
                  <div style={styles.searchProductDetails}>
                    SKU: {product.sku || 'N/A'} | 
                    Stock: {product.stock} {product.baseUnit} | 
                    Price: ₱{product.price.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart Section */}
      <div style={styles.cartSection}>
        <div style={styles.cartHeader}>
          <div>
            <h3 style={styles.cartTitle}>Items Selected for Purchase</h3>
          </div>
          {cart.length > 0 && (
            <button 
              onClick={() => handleButtonClick('cancelAll', cancelAll)}
              style={{
                ...styles.cancelAllButton,
                backgroundColor: clickedButtons['cancelAll'] ? '#ffffff' : '#FEF2F2',
                color: clickedButtons['cancelAll'] ? '#DC2626' : '#DC2626',
                border: clickedButtons['cancelAll'] ? '2px solid #DC2626' : '1px solid #FECACA',
              }}
            >
              Cancel All
            </button>
          )}
        </div>

        {cart.length === 0 ? (
          <div style={styles.cartEmpty}>
            <span style={styles.emptyCartIcon}>🛒</span>
            <div style={styles.emptyCartText}>No items in cart</div>
            <p style={styles.emptyCartHint}>
              Scan barcodes or search products to add them
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Cart Table */}
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeader}>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Price (Each)</th>
                    <th style={styles.th}>Current Stock</th>
                    <th style={styles.th}>Quantity</th>
                    <th style={styles.th}>Price (Total)</th>
                    <th style={styles.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map(item => (
                    <tr key={item.id} style={styles.tableRow}>
                      <td style={styles.td}>
                        <div style={styles.productName}>{item.name}</div>
                        <div style={styles.productSku}>SKU: {item.sku || 'N/A'}</div>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.priceCell}>₱{item.price.toFixed(2)}</div>
                      </td>
                      <td style={styles.td}>
                        <div style={{
                          ...styles.stockCell,
                          color: item.stock < 10 ? '#DC2626' : '#059669'
                        }}>
                          {item.stock} {item.baseUnit}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.quantityCell}>
                          <div style={styles.quantityControls}>
                            <button 
                              onClick={() => handleButtonClick(`decrease-${item.id}`, () => updateQuantity(item.id, item.quantity - 1))}
                              style={{
                                ...styles.qtyButton,
                                backgroundColor: clickedButtons[`decrease-${item.id}`] ? '#ffffff' : '#F1F5F9',
                                color: clickedButtons[`decrease-${item.id}`] ? '#0ea5e9' : '#1E293B',
                                border: clickedButtons[`decrease-${item.id}`] ? '2px solid #0ea5e9' : '1px solid #CBD5E1',
                              }}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              value={item.quantity}
                              style={styles.qtyInput}
                              onChange={(e) => handleQuantityInput(item.id, e.target.value)}
                              min="1"
                            />
                            <button 
                              onClick={() => handleButtonClick(`increase-${item.id}`, () => updateQuantity(item.id, item.quantity + 1))}
                              style={{
                                ...styles.qtyButton,
                                backgroundColor: clickedButtons[`increase-${item.id}`] ? '#ffffff' : '#F1F5F9',
                                color: clickedButtons[`increase-${item.id}`] ? '#0ea5e9' : '#1E293B',
                                border: clickedButtons[`increase-${item.id}`] ? '2px solid #0ea5e9' : '1px solid #CBD5E1',
                              }}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.totalPriceCell}>
                          ₱{calculateItemTotal(item)}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <button
                          onClick={() => handleButtonClick(`remove-${item.id}`, () => removeFromCart(item.id))}
                          style={{
                            ...styles.removeButton,
                            backgroundColor: clickedButtons[`remove-${item.id}`] ? '#ffffff' : '#FEF2F2',
                            color: clickedButtons[`remove-${item.id}`] ? '#DC2626' : '#DC2626',
                            border: clickedButtons[`remove-${item.id}`] ? '2px solid #DC2626' : '1px solid #FECACA',
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={styles.tableFooter}>
                    <td colSpan="4" style={styles.footerLabelCell}>
                      <div style={styles.totalSummary}>
                        <div style={styles.totalSummaryItem}>
                          <span>Total Items:</span>
                          <strong style={styles.totalItemsValue}>{calculateTotalItems()}</strong>
                        </div>
                      </div>
                    </td>
                    <td colSpan="2" style={styles.footerTotalCell}>
                      <div style={styles.grandTotal}>
                        <span>GRAND TOTAL:</span>
                        <strong style={styles.grandTotalAmount}>₱{calculateTotal().toFixed(2)}</strong>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile Cart View */}
            <div style={styles.mobileCartView}>
              {cart.map(item => (
                <div key={item.id} style={styles.mobileCartItem}>
                  <div style={styles.mobileCartItemHeader}>
                    <div style={styles.mobileProductName}>{item.name}</div>
                    <div style={styles.mobileProductPrice}>₱{item.price.toFixed(2)} each</div>
                  </div>
                  
                  <div style={styles.mobileCartItemDetails}>
                    <div style={styles.mobileDetail}>
                      <span style={styles.mobileDetailLabel}>SKU:</span>
                      <span style={styles.mobileDetailValue}>{item.sku || 'N/A'}</span>
                    </div>
                    <div style={styles.mobileDetail}>
                      <span style={styles.mobileDetailLabel}>Stock:</span>
                      <span style={{
                        ...styles.mobileDetailValue,
                        color: item.stock < 10 ? '#DC2626' : '#059669'
                      }}>
                        {item.stock} {item.baseUnit}
                      </span>
                    </div>
                    <div style={styles.mobileDetail}>
                      <span style={styles.mobileDetailLabel}>Quantity:</span>
                      <div style={styles.mobileQuantityControls}>
                        <button 
                          onClick={() => handleButtonClick(`decrease-mobile-${item.id}`, () => updateQuantity(item.id, item.quantity - 1))}
                          style={{
                            ...styles.qtyButton,
                            backgroundColor: clickedButtons[`decrease-mobile-${item.id}`] ? '#ffffff' : '#F1F5F9',
                            color: clickedButtons[`decrease-mobile-${item.id}`] ? '#0ea5e9' : '#1E293B',
                            border: clickedButtons[`decrease-mobile-${item.id}`] ? '2px solid #0ea5e9' : '1px solid #CBD5E1',
                          }}
                        >
                          −
                        </button>
                        <span style={styles.mobileQuantityValue}>{item.quantity}</span>
                        <button 
                          onClick={() => handleButtonClick(`increase-mobile-${item.id}`, () => updateQuantity(item.id, item.quantity + 1))}
                          style={{
                            ...styles.qtyButton,
                            backgroundColor: clickedButtons[`increase-mobile-${item.id}`] ? '#ffffff' : '#F1F5F9',
                            color: clickedButtons[`increase-mobile-${item.id}`] ? '#0ea5e9' : '#1E293B',
                            border: clickedButtons[`increase-mobile-${item.id}`] ? '2px solid #0ea5e9' : '1px solid #CBD5E1',
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div style={styles.mobileDetail}>
                      <span style={styles.mobileDetailLabel}>Total:</span>
                      <span style={styles.mobileDetailValue}>₱{calculateItemTotal(item)}</span>
                    </div>
                  </div>

                  <div style={styles.mobileCartItemActions}>
                    <button
                      onClick={() => handleButtonClick(`remove-mobile-${item.id}`, () => removeFromCart(item.id))}
                      style={{
                        ...styles.removeButton,
                        backgroundColor: clickedButtons[`remove-mobile-${item.id}`] ? '#ffffff' : '#FEF2F2',
                        color: clickedButtons[`remove-mobile-${item.id}`] ? '#DC2626' : '#DC2626',
                        border: clickedButtons[`remove-mobile-${item.id}`] ? '2px solid #DC2626' : '1px solid #FECACA',
                      }}
                    >
                      Remove Item
                    </button>
                  </div>
                </div>
              ))}
              
              {/* Mobile Total Summary */}
              <div style={styles.mobileTotalSummary}>
                <div style={styles.mobileSummaryRow}>
                  <span>Total Items:</span>
                  <strong>{calculateTotalItems()}</strong>
                </div>
                <div style={styles.mobileSummaryRow}>
                  <span>Grand Total:</span>
                  <strong style={styles.mobileGrandTotal}>₱{calculateTotal().toFixed(2)}</strong>
                </div>
              </div>
            </div>

            <div style={styles.paymentSection}>
              
              <div style={styles.cashTenderSection}>
                {/* Cash Tender Header Moved Here */}
                <div style={styles.cashTenderHeader}>
                  <h4 style={styles.cashTenderTitle}>Cash Tender</h4>
                  <p style={styles.cashTenderSubtitle}>Enter the cash amount received from customer</p>
                </div>
                
                <div style={styles.cashInputRow}>
                  <div style={styles.cashInputContainer}>
                    <span style={styles.currencySymbol}>₱</span>
                    <input
                      type="number"
                      placeholder="Enter cash amount"
                      value={cashGiven}
                      onChange={(e) => setCashGiven(e.target.value)}
                      style={styles.cashInput}
                      step="0.01"
                      min="0"
                    />
                  </div>
                </div>
                
                {/* Minus Line */}
                <div style={styles.minusLine}></div>
                
                {/* Change Display */}
                {cashGiven && (
                  <div style={styles.changeRow}>
                    <span style={styles.changeLabel}>
                      {parseFloat(cashGiven) >= calculateTotal() ? 'Change:' : 'Short:'}
                    </span>
                    <span style={{
                      ...styles.changeAmount,
                      color: parseFloat(cashGiven) >= calculateTotal() ? '#10b981' : '#ef4444'
                    }}>
                      ₱{Math.abs(parseFloat(cashGiven) - calculateTotal()).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Complete Payment Button */}
              <button 
                onClick={() => handleButtonClick('completePayment', handlePayment)}
                style={{
                  ...styles.completePaymentButton,
                  backgroundColor: clickedButtons['completePayment'] ? '#ffffff' : '#10B981',
                  color: clickedButtons['completePayment'] ? '#10B981' : '#fff',
                  border: clickedButtons['completePayment'] ? '2px solid #10B981' : 'none',
                }}
                disabled={cart.length === 0}
              >
                Complete Payment
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '16px',
    backgroundColor: '#F8FAFC',
    minHeight: '100vh',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '24px',
  },
  pageTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: '8px',
  },
  pageSubtitle: {
    color: '#64748B',
    fontSize: '14px',
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    marginBottom: '20px',
  },
  searchContainer: {
    position: 'relative',
    width: '100%',
  },
  input: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #D1D5DB',
    fontSize: '14px',
    backgroundColor: '#F9FAFB',
    boxSizing: 'border-box',
  },
  searchResults: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: '8px',
    border: '1px solid #E5E7EB',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    maxHeight: '300px',
    overflowY: 'auto',
    zIndex: 100,
    marginTop: '4px',
  },
  searchResultItem: {
    padding: '12px',
    borderBottom: '1px solid #F3F4F6',
    cursor: 'pointer',
  },
  searchProductName: {
    fontWeight: '600',
    color: '#1F2937',
    fontSize: '14px',
    marginBottom: '4px',
  },
  searchProductDetails: {
    fontSize: '12px',
    color: '#6B7280',
  },
  cartSection: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  cartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '12px',
  },
  cartTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1E293B',
    margin: '0 0 8px 0',
  },
  cartSummary: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  cartSummaryItem: {
    fontSize: '14px',
    color: '#64748B',
  },
  cancelAllButton: {
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  cartEmpty: {
    textAlign: 'center',
    padding: '40px 20px',
    color: '#94A3B8',
  },
  emptyCartIcon: {
    fontSize: '48px',
    display: 'block',
    marginBottom: '12px',
  },
  emptyCartText: {
    fontSize: '16px',
    fontWeight: '500',
    marginBottom: '8px',
  },
  emptyCartHint: {
    fontSize: '14px',
    color: '#CBD5E1',
    margin: 0,
  },
  // Table Styles
  tableContainer: {
    overflowX: 'auto',
    marginBottom: '20px',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '800px',
  },
  tableHeader: {
    backgroundColor: '#F8FAFC',
  },
  th: {
    padding: '16px',
    textAlign: 'left',
    fontSize: '14px',
    fontWeight: '600',
    color: '#475569',
    borderBottom: '2px solid #E2E8F0',
    whiteSpace: 'nowrap',
  },
  tableRow: {
    borderBottom: '1px solid #E2E8F0',
  },
  td: {
    padding: '16px',
    textAlign: 'left',
    fontSize: '14px',
    verticalAlign: 'middle',
  },
  productName: {
    fontWeight: '500',
    color: '#1E293B',
    marginBottom: '4px',
  },
  productSku: {
    fontSize: '12px',
    color: '#64748B',
  },
  priceCell: {
    fontWeight: '500',
    color: '#4F46E5',
  },
  stockCell: {
    fontWeight: '500',
  },
  quantityCell: {
    minWidth: '140px',
  },
  quantityControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  qtyButton: {
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '600',
    minWidth: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  qtyInput: {
    width: '60px',
    textAlign: 'center',
    padding: '6px',
    borderRadius: '4px',
    border: '1px solid #CBD5E1',
    fontSize: '14px',
  },
  totalPriceCell: {
    fontWeight: '600',
    color: '#4F46E5',
    fontSize: '15px',
  },
  removeButton: {
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  tableFooter: {
    backgroundColor: '#F8FAFC',
    borderTop: '2px solid #E2E8F0',
  },
  footerLabelCell: {
    padding: '16px',
  },
  footerTotalCell: {
    padding: '16px',
    textAlign: 'right',
  },
  totalSummary: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  totalSummaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '15px',
    color: '#475569',
  },
  totalItemsValue: {
    color: '#1E293B',
    fontSize: '16px',
  },
  grandTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '16px',
    fontWeight: '600',
    color: '#1E293B',
  },
  grandTotalAmount: {
    color: '#4F46E5',
    fontSize: '20px',
  },
  // Mobile View
  mobileCartView: {
    display: 'none',
    marginBottom: '20px',
  },
  mobileCartItem: {
    borderBottom: '1px solid #E2E8F0',
    paddingBottom: '16px',
    marginBottom: '16px',
  },
  mobileCartItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  mobileProductName: {
    fontWeight: '600',
    color: '#1E293B',
    fontSize: '16px',
    flex: 1,
  },
  mobileProductPrice: {
    fontWeight: '500',
    color: '#4F46E5',
    fontSize: '14px',
  },
  mobileCartItemDetails: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    marginBottom: '16px',
  },
  mobileDetail: {
    display: 'flex',
    flexDirection: 'column',
  },
  mobileDetailLabel: {
    fontSize: '12px',
    color: '#64748B',
    marginBottom: '4px',
  },
  mobileDetailValue: {
    fontSize: '14px',
    color: '#1E293B',
    fontWeight: '500',
  },
  mobileQuantityControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  mobileQuantityValue: {
    minWidth: '30px',
    textAlign: 'center',
    fontWeight: '500',
  },
  mobileCartItemActions: {
    display: 'flex',
    justifyContent: 'center',
  },
  mobileTotalSummary: {
    backgroundColor: '#F8FAFC',
    borderRadius: '8px',
    padding: '16px',
    marginTop: '16px',
  },
  mobileSummaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '16px',
    color: '#475569',
    marginBottom: '8px',
  },
  mobileGrandTotal: {
    color: '#4F46E5',
    fontSize: '18px',
  },
  // Payment Section
  paymentSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: '8px',
    padding: '20px',
    marginTop: '20px',
  },
  paymentTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: '16px',
  },
  cashTenderSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid #E5E7EB',
    marginBottom: '16px',
  },
  cashTenderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  cashTenderLabel: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#374151',
  },
  cashTenderAmount: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#4F46E5',
  },
  cashInputRow: {
    marginBottom: '12px',
  },
  cashInputContainer: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    border: '1px solid #D1D5DB',
    borderRadius: '6px',
    padding: '12px 16px',
  },
  currencySymbol: {
    fontSize: '18px',
    fontWeight: '500',
    color: '#6B7280',
    marginRight: '12px',
  },
  cashInput: {
    border: 'none',
    background: 'transparent',
    fontSize: '18px',
    fontWeight: '600',
    color: '#111827',
    width: '100%',
    outline: 'none',
  },
  minusLine: {
    height: '1px',
    backgroundColor: '#D1D5DB',
    margin: '16px 0',
  },
  changeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '12px',
  },
  changeLabel: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#374151',
  },
  changeAmount: {
    fontSize: '20px',
    fontWeight: '700',
  },
  completePaymentButton: {
    padding: '16px',
    borderRadius: '8px',
    fontWeight: '600',
    fontSize: '16px',
    cursor: 'pointer',
    width: '100%',
    transition: 'all 0.2s',
  },
};

// Add media queries
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @media (min-width: 768px) {
    .container { padding: 24px; }
    .pageTitle { font-size: 28px; }
    .pageSubtitle { font-size: 16px; }
    .formCard { padding: 20px; }
    .cartSection { padding: 24px; }
    .cartTitle { font-size: 20px; }
    .cartSummary { flex-direction: row; gap: 16px; }
    .th, .td { padding: 20px; }
    .paymentSection { max-width: 500px; margin-left: auto; margin-right: auto; }
  }
  
  @media (min-width: 1024px) {
    .mobileCartView { display: none; }
    .tableContainer { display: block; }
  }
  
  @media (max-width: 1023px) {
    .tableContainer { display: none; }
    .mobileCartView { display: block; }
    .cartHeader { flex-direction: column; align-items: flex-start; }
    .cancelAllButton { align-self: flex-start; }
  }
  
  .searchResultItem:hover { background-color: #F9FAFB; }
  .tableRow:hover { background-color: #F8FAFC; }
  .cancelAllButton:hover { background-color: #FEE2E2; }
  .removeButton:hover { background-color: #FEE2E2; }
  .qtyButton:hover { background-color: #E2E8F0; }
  .completePaymentButton:hover:not(:disabled) { background-color: #059669; }
`;
document.head.appendChild(styleSheet);