import React, { useState, useEffect, useRef } from 'react';
import { dataService } from '../services/DataService';

export default function SalesScreen({ userMode }) {
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState([]);
  const [products, setProducts] = useState([]);
  const [cashGiven, setCashGiven] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [clickedButtons, setClickedButtons] = useState({});
  const [loading, setLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const mode = userMode || 'client';
  const inputRef = useRef(null);
  const searchRef = useRef(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  
  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const user = savedUser;

  useEffect(() => {
    // ✅ Log audit using backup table
    dataService.add('backup', {
      user_id: user?.user_id,
      backup_name: `AUDIT_VIEW_SALES_SCREEN`,
      backup_type: 'audit',
      created_at: new Date().toISOString(),
      schema_version: '6',
      details: JSON.stringify({
        action: 'VIEW_SALES_SCREEN',
        user_id: user?.user_id,
        username: user?.username
      })
    }).catch(console.error);

    loadProducts();

    const handleGlobalScan = (e) => {
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
  }, []); // Removed barcode and products dependencies

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      setLoading(true);
      
      // ✅ Log audit using backup table
      await dataService.add('backup', {
        user_id: user?.user_id,
        backup_name: `AUDIT_LOAD_SALES_PRODUCTS`,
        backup_type: 'audit',
        created_at: new Date().toISOString(),
        schema_version: '6',
        details: JSON.stringify({
          action: 'LOAD_SALES_PRODUCTS',
          user_id: user?.user_id,
          username: user?.username
        })
      });

      // Get products and inventory using dataService
      const prodRes = await dataService.getProducts();
      const inventoryData = await dataService.getInventory();

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
      setLoading(false);
    } catch (err) {
      console.error('Error loading products:', err);
      setLoading(false);
      
      // ✅ Log audit using backup table
      dataService.add('backup', {
        user_id: user?.user_id,
        backup_name: `AUDIT_LOAD_SALES_PRODUCTS_ERROR`,
        backup_type: 'audit',
        created_at: new Date().toISOString(),
        schema_version: '6',
        details: JSON.stringify({
          action: 'LOAD_SALES_PRODUCTS_ERROR',
          error: err.message,
          user_id: user?.user_id,
          username: user?.username
        })
      }).catch(console.error);
    }
  };

  const handleSearch = (searchTerm) => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    // ✅ Log audit using backup table
    dataService.add('backup', {
      user_id: user?.user_id,
      backup_name: `AUDIT_SEARCH_PRODUCT_SALES`,
      backup_type: 'audit',
      created_at: new Date().toISOString(),
      schema_version: '6',
      details: JSON.stringify({
        action: 'SEARCH_PRODUCT_SALES',
        search_term: searchTerm,
        user_id: user?.user_id,
        username: user?.username
      })
    }).catch(console.error);

    const term = searchTerm.toLowerCase();
    const results = products.filter(product => 
      product.name.toLowerCase().includes(term) || 
      (product.sku && product.sku.toLowerCase().includes(term))
    );

    setSearchResults(results);
    setShowSearchResults(results.length > 0);
  };

  const handleScan = async (code) => {
    if (isInputFocused) return;
    
    let product = products.find((p) => p.sku === code);
    
    if (!product) {
      product = products.find((p) => 
        p.name.toLowerCase() === code.toLowerCase()
      );
    }

    if (product) {
      // ✅ Log audit using backup table
      await dataService.add('backup', {
        user_id: user?.user_id,
        backup_name: `AUDIT_SCAN_PRODUCT_SALES`,
        backup_type: 'audit',
        created_at: new Date().toISOString(),
        schema_version: '6',
        details: JSON.stringify({
          action: 'SCAN_PRODUCT_SALES',
          barcode: code,
          product_id: product.id,
          product_name: product.name,
          user_id: user?.user_id,
          username: user?.username
        })
      });
      
      addToCart(product, 1);
    } else {
      handleSearch(code);
    }
    setBarcode('');
  };

  const handleSearchSelect = async (product) => {
    // ✅ Log audit using backup table
    await dataService.add('backup', {
      user_id: user?.user_id,
      backup_name: `AUDIT_SEARCH_SELECT_PRODUCT_SALES`,
      backup_type: 'audit',
      created_at: new Date().toISOString(),
      schema_version: '6',
      details: JSON.stringify({
        action: 'SEARCH_SELECT_PRODUCT_SALES',
        product_id: product.id,
        product_name: product.name,
        user_id: user?.user_id,
        username: user?.username
      })
    });
    
    addToCart(product, 1);
    setShowSearchResults(false);
    setBarcode('');
  };

  const addToCart = async (product, qty = 1) => {
    if (!product) return;
    
    // ✅ Log audit using backup table
    await dataService.add('backup', {
      user_id: user?.user_id,
      backup_name: `AUDIT_ADD_TO_CART_SALES`,
      backup_type: 'audit',
      created_at: new Date().toISOString(),
      schema_version: '6',
      details: JSON.stringify({
        action: 'ADD_TO_CART_SALES',
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        price: product.price,
        stock_before: product.stock,
        user_id: user?.user_id,
        username: user?.username
      })
    });

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
  };

  const updateQuantity = async (id, qty) => {
    const product = products.find(p => p.id === id);
    if (qty < 0) return;
    if (qty > product.stock) {
      alert('Not enough stock!');
    } else {
      const oldItem = cart.find(item => item.id === id);
      if (oldItem && oldItem.quantity !== qty) {
        // ✅ Log audit using backup table
        await dataService.add('backup', {
          user_id: user?.user_id,
          backup_name: `AUDIT_UPDATE_CART_QUANTITY`,
          backup_type: 'audit',
          created_at: new Date().toISOString(),
          schema_version: '6',
          details: JSON.stringify({
            action: 'UPDATE_CART_QUANTITY',
            product_id: id,
            product_name: product.name,
            old_quantity: oldItem.quantity,
            new_quantity: qty,
            price: product.price,
            user_id: user?.user_id,
            username: user?.username
          })
        });
      }
      
      setCart(cart.map(item => item.id === id ? { ...item, quantity: qty } : item));
    }
  };

  const handleQuantityInput = (id, value) => {
    const qty = parseInt(value) || 0;
    updateQuantity(id, qty);
  };

  const removeFromCart = async (id) => {
    const item = cart.find(item => item.id === id);
    
    // ✅ Log audit using backup table
    await dataService.add('backup', {
      user_id: user?.user_id,
      backup_name: `AUDIT_REMOVE_FROM_CART_SALES`,
      backup_type: 'audit',
      created_at: new Date().toISOString(),
      schema_version: '6',
      details: JSON.stringify({
        action: 'REMOVE_FROM_CART_SALES',
        product_id: id,
        product_name: item?.name,
        quantity: item?.quantity,
        price: item?.price,
        user_id: user?.user_id,
        username: user?.username
      })
    });
    
    setCart(cart.filter(item => item.id !== id));
  };

  const cancelAll = async () => {
    if (window.confirm('Are you sure you want to cancel all items?')) {
      // ✅ Log audit using backup table
      await dataService.add('backup', {
        user_id: user?.user_id,
        backup_name: `AUDIT_CANCEL_ALL_ITEMS`,
        backup_type: 'audit',
        created_at: new Date().toISOString(),
        schema_version: '6',
        details: JSON.stringify({
          action: 'CANCEL_ALL_ITEMS',
          items_count: cart.length,
          total_amount: calculateTotal(),
          user_id: user?.user_id,
          username: user?.username
        })
      });
      
      setCart([]);
    }
  };

  const calculateTotal = () => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  const calculateTotalItems = () => cart.reduce((sum, item) => sum + item.quantity, 0);
  
  const calculateItemTotal = (item) => (item.price * item.quantity).toFixed(2);

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
    if (cart.length === 0) {
      alert('Cart is empty!');
      return;
    }

    const total = calculateTotal();
    const given = parseFloat(cashGiven) || 0;

    if (given < total) {
      alert(`Payment insufficient! Short by ₱${(total - given).toFixed(2)}`);
      return;
    }

    try {
      setPaymentLoading(true);
      const saleDate = new Date().toISOString().split('T')[0];
      const transactionDateTime = getFormattedDateTime();

      // ✅ Log audit using backup table
      await dataService.add('backup', {
        user_id: user?.user_id,
        backup_name: `AUDIT_PAYMENT_ATTEMPT`,
        backup_type: 'audit',
        created_at: new Date().toISOString(),
        schema_version: '6',
        details: JSON.stringify({
          action: 'PAYMENT_ATTEMPT',
          items_count: cart.length,
          total_items: calculateTotalItems(),
          total_amount: total,
          cash_given: given,
          change: (given - total).toFixed(2),
          user_id: user?.user_id,
          username: user?.username
        })
      });

      // Process sale using dataService - FIX: Include username in sale data
      const saleData = {
        user_id: user?.user_id,
        username: user?.username || 'Unknown', // Add username to sale data
        sales_date: saleDate,
        created_at: transactionDateTime,
        items: cart.map(item => ({
          product_id: item.id,
          quantity: item.quantity,
          amount: item.price,
          total_amount: item.price * item.quantity,
          stockout_reason: null
        }))
      };

      // Use dataService.processSale which handles both SQLite and API modes
      const saleResult = await dataService.processSale(saleData);
      
      if (!saleResult || !saleResult.saleId) {
        throw new Error('Failed to process sale');
      }

      const saleId = saleResult.saleId;
      const saleItemIds = saleResult.saleItemIds || [];

      // Log each sale item
      for (let i = 0; i < cart.length; i++) {
        const item = cart[i];
        const saleItemId = saleItemIds[i];
        
        // Get updated inventory to calculate running balance
        const currentInv = await dataService.getById('inventory', item.id);
        const runningBalance = currentInv?.quantity || 0;
        
        // ✅ Log audit using backup table for each item
        await dataService.add('backup', {
          user_id: user?.user_id,
          backup_name: `AUDIT_SALE_ITEM`,
          backup_type: 'audit',
          created_at: new Date().toISOString(),
          schema_version: '6',
          details: JSON.stringify({
            action: 'SALE_ITEM',
            product_id: item.id,
            product_name: item.name,
            quantity: item.quantity,
            unit_price: item.price,
            total_amount: item.price * item.quantity,
            stock_before: item.stock,
            stock_after: runningBalance,
            sale_id: saleId,
            sale_items_id: saleItemId,
            user_id: user?.user_id,
            username: user?.username
          })
        });
      }

      // ✅ Log audit using backup table for successful payment
      await dataService.add('backup', {
        user_id: user?.user_id,
        backup_name: `AUDIT_PAYMENT_SUCCESS`,
        backup_type: 'audit',
        created_at: new Date().toISOString(),
        schema_version: '6',
        details: JSON.stringify({
          action: 'PAYMENT_SUCCESS',
          sale_id: saleId,
          items_count: cart.length,
          total_items: calculateTotalItems(),
          total_amount: total,
          cash_given: given,
          change: (given - total).toFixed(2),
          user_id: user?.user_id,
          username: user?.username
        })
      });

      const change = (given - total).toFixed(2);
      setCart([]);
      setCashGiven('');
      setBarcode('');
      setSearchResults([]);
      setShowSearchResults(false);
      alert(`Payment completed! Change: ₱${change}`);
      await loadProducts(); // Refresh products
      
    } catch (err) {
      console.error('Error handling payment:', err);
      
      // ✅ Log audit using backup table for payment error
      await dataService.add('backup', {
        user_id: user?.user_id,
        backup_name: `AUDIT_PAYMENT_ERROR`,
        backup_type: 'audit',
        created_at: new Date().toISOString(),
        schema_version: '6',
        details: JSON.stringify({
          action: 'PAYMENT_ERROR',
          error: err.message,
          items_count: cart.length,
          total_amount: calculateTotal(),
          user_id: user?.user_id,
          username: user?.username
        })
      });
      
      alert('Error processing payment. Please try again.');
    } finally {
      setPaymentLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.pageTitle}>Point of Sale</h1>
        <p style={styles.pageSubtitle}>Scan or search products to add to cart</p>
      </div>

      {loading && (
        <div style={styles.loadingMessage}>
          Loading products...
        </div>
      )}

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
            disabled={loading || paymentLoading}
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
              disabled={paymentLoading}
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
                              disabled={paymentLoading}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              value={item.quantity}
                              style={styles.qtyInput}
                              onChange={(e) => handleQuantityInput(item.id, e.target.value)}
                              min="1"
                              disabled={paymentLoading}
                            />
                            <button 
                              onClick={() => handleButtonClick(`increase-${item.id}`, () => updateQuantity(item.id, item.quantity + 1))}
                              style={{
                                ...styles.qtyButton,
                                backgroundColor: clickedButtons[`increase-${item.id}`] ? '#ffffff' : '#F1F5F9',
                                color: clickedButtons[`increase-${item.id}`] ? '#0ea5e9' : '#1E293B',
                                border: clickedButtons[`increase-${item.id}`] ? '2px solid #0ea5e9' : '1px solid #CBD5E1',
                              }}
                              disabled={paymentLoading}
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
                          disabled={paymentLoading}
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
                          disabled={paymentLoading}
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
                          disabled={paymentLoading}
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
                      disabled={paymentLoading}
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
                      disabled={paymentLoading}
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
                disabled={cart.length === 0 || paymentLoading}
              >
                {paymentLoading ? 'Processing...' : 'Complete Payment'}
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
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  header: {
    marginBottom: '30px',
    textAlign: 'center',
  },
  pageTitle: {
    fontSize: '2.5rem',
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: '10px',
    letterSpacing: '-0.5px',
  },
  pageSubtitle: {
    fontSize: '1.1rem',
    color: '#64748b',
    fontWeight: '400',
  },
  loadingMessage: {
    textAlign: 'center',
    padding: '20px',
    color: '#64748b',
    fontSize: '1rem',
    backgroundColor: '#f8fafc',
    borderRadius: '10px',
    marginBottom: '20px',
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '25px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    marginBottom: '30px',
    border: '1px solid #e2e8f0',
  },
  searchContainer: {
    position: 'relative',
    width: '100%',
  },
  input: {
    width: '100%',
    padding: '15px 20px',
    fontSize: '1rem',
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    backgroundColor: '#f8fafc',
    transition: 'all 0.2s ease',
    boxSizing: 'border-box',
  },
  searchResults: {
    position: 'absolute',
    top: '100%',
    left: '0',
    right: '0',
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
    zIndex: '1000',
    maxHeight: '300px',
    overflowY: 'auto',
    marginTop: '5px',
  },
  searchResultItem: {
    padding: '15px 20px',
    cursor: 'pointer',
    borderBottom: '1px solid #f1f5f9',
    transition: 'background-color 0.2s ease',
  },
  searchProductName: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '5px',
  },
  searchProductDetails: {
    fontSize: '0.875rem',
    color: '#64748b',
  },
  cartSection: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '30px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    border: '1px solid #e2e8f0',
  },
  cartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '25px',
    flexWrap: 'wrap',
    gap: '15px',
  },
  cartTitle: {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#1e293b',
    margin: '0',
  },
  cancelAllButton: {
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    border: '1px solid #FECACA',
    backgroundColor: '#FEF2F2',
    color: '#DC2626',
  },
  cartEmpty: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#94a3b8',
  },
  emptyCartIcon: {
    fontSize: '4rem',
    marginBottom: '20px',
    opacity: '0.5',
  },
  emptyCartText: {
    fontSize: '1.5rem',
    fontWeight: '600',
    color: '#64748b',
    marginBottom: '10px',
  },
  emptyCartHint: {
    fontSize: '1rem',
    color: '#94a3b8',
    maxWidth: '400px',
    margin: '0 auto',
  },
  tableContainer: {
    overflowX: 'auto',
    marginBottom: '30px',
    display: 'block',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '800px',
  },
  tableHeader: {
    backgroundColor: '#f8fafc',
  },
  th: {
    padding: '18px 15px',
    textAlign: 'left',
    fontSize: '0.95rem',
    fontWeight: '700',
    color: '#475569',
    borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap',
  },
  tableRow: {
    borderBottom: '1px solid #f1f5f9',
    transition: 'background-color 0.2s ease',
  },
  td: {
    padding: '18px 15px',
    verticalAlign: 'middle',
  },
  productName: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '5px',
  },
  productSku: {
    fontSize: '0.875rem',
    color: '#64748b',
  },
  priceCell: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#1e293b',
  },
  stockCell: {
    fontSize: '0.95rem',
    fontWeight: '600',
  },
  quantityCell: {
    minWidth: '150px',
  },
  quantityControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  qtyButton: {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
    backgroundColor: '#F1F5F9',
    color: '#1E293B',
    fontSize: '1.2rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  },
  qtyInput: {
    width: '70px',
    padding: '10px',
    textAlign: 'center',
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: '600',
    backgroundColor: '#ffffff',
    color: '#1e293b',
    boxSizing: 'border-box',
  },
  totalPriceCell: {
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#1e293b',
  },
  removeButton: {
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    border: '1px solid #FECACA',
    backgroundColor: '#FEF2F2',
    color: '#DC2626',
  },
  tableFooter: {
    backgroundColor: '#f8fafc',
  },
  footerLabelCell: {
    padding: '25px 15px',
    borderTop: '2px solid #e2e8f0',
  },
  totalSummary: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  totalSummaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '1rem',
    color: '#475569',
  },
  totalItemsValue: {
    fontSize: '1.3rem',
    color: '#1e293b',
  },
  footerTotalCell: {
    padding: '25px 15px',
    borderTop: '2px solid #e2e8f0',
    textAlign: 'right',
  },
  grandTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '1.2rem',
    fontWeight: '700',
    color: '#1e293b',
  },
  grandTotalAmount: {
    fontSize: '1.8rem',
    color: '#10B981',
  },
  mobileCartView: {
    display: 'none',
  },
  mobileCartItem: {
    backgroundColor: '#f8fafc',
    borderRadius: '10px',
    padding: '20px',
    marginBottom: '15px',
    border: '1px solid #e2e8f0',
  },
  mobileCartItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '15px',
  },
  mobileProductName: {
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#1e293b',
    flex: '1',
  },
  mobileProductPrice: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#10B981',
  },
  mobileCartItemDetails: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '15px',
    marginBottom: '20px',
  },
  mobileDetail: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  mobileDetailLabel: {
    fontSize: '0.85rem',
    color: '#64748b',
    fontWeight: '500',
  },
  mobileDetailValue: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#1e293b',
  },
  mobileQuantityControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  mobileQuantityValue: {
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#1e293b',
    minWidth: '30px',
    textAlign: 'center',
  },
  mobileCartItemActions: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  mobileTotalSummary: {
    backgroundColor: '#f8fafc',
    borderRadius: '10px',
    padding: '20px',
    marginTop: '20px',
    border: '1px solid #e2e8f0',
  },
  mobileSummaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
    fontSize: '1.1rem',
    color: '#475569',
  },
  mobileGrandTotal: {
    fontSize: '1.5rem',
    color: '#10B981',
    fontWeight: '700',
  },
  paymentSection: {
    marginTop: '40px',
    paddingTop: '30px',
    borderTop: '2px solid #f1f5f9',
  },
  cashTenderSection: {
    backgroundColor: '#f8fafc',
    borderRadius: '10px',
    padding: '25px',
    marginBottom: '25px',
    border: '1px solid #e2e8f0',
  },
  cashTenderHeader: {
    marginBottom: '20px',
  },
  cashTenderTitle: {
    fontSize: '1.3rem',
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: '5px',
  },
  cashTenderSubtitle: {
    fontSize: '0.95rem',
    color: '#64748b',
  },
  cashInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    marginBottom: '20px',
  },
  cashInputContainer: {
    position: 'relative',
    flex: '1',
  },
  currencySymbol: {
    position: 'absolute',
    left: '20px',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#10B981',
  },
  cashInput: {
    width: '100%',
    padding: '18px 20px 18px 50px',
    fontSize: '1.5rem',
    fontWeight: '700',
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    backgroundColor: '#ffffff',
    color: '#1e293b',
    boxSizing: 'border-box',
    textAlign: 'right',
  },
  minusLine: {
    height: '2px',
    backgroundColor: '#e2e8f0',
    margin: '20px 0',
  },
  changeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px 0',
  },
  changeLabel: {
    fontSize: '1.1rem',
    fontWeight: '600',
    color: '#475569',
  },
  changeAmount: {
    fontSize: '1.8rem',
    fontWeight: '800',
  },
  completePaymentButton: {
    width: '100%',
    padding: '20px',
    fontSize: '1.3rem',
    fontWeight: '700',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    backgroundColor: '#10B981',
    color: '#fff',
    border: 'none',
  },
};

// Add responsive styles
const mediaQuery = '@media (max-width: 768px)';
const stylesWithMedia = {
  ...styles,
  tableContainer: {
    ...styles.tableContainer,
    display: 'none',
  },
  mobileCartView: {
    ...styles.mobileCartView,
    display: 'block',
  },
  cartHeader: {
    ...styles.cartHeader,
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  cancelAllButton: {
    ...styles.cancelAllButton,
    width: '100%',
  },
  mobileCartItemDetails: {
    ...styles.mobileCartItemDetails,
    gridTemplateColumns: '1fr',
  },
  paymentSection: {
    ...styles.paymentSection,
    marginTop: '30px',
  },
  cashTenderSection: {
    ...styles.cashTenderSection,
    padding: '20px',
  },
  cashInput: {
    ...styles.cashInput,
    fontSize: '1.3rem',
  },
  completePaymentButton: {
    ...styles.completePaymentButton,
    fontSize: '1.2rem',
    padding: '18px',
  },
};

// Apply media query
Object.keys(stylesWithMedia).forEach(key => {
  if (typeof stylesWithMedia[key] === 'object') {
    stylesWithMedia[key] = {
      ...styles[key],
      [mediaQuery]: stylesWithMedia[key],
    };
  }
});
