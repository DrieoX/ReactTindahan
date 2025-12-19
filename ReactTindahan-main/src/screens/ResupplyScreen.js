import React, { useState, useEffect, useRef } from "react";
import { db } from "../db";

export default function ResupplyScreen() {
  const [barcode, setBarcode] = useState("");
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const inputRef = useRef(null);
  const searchRef = useRef(null);
  const quantityInputRefs = useRef({});
  const [isInputFocused, setIsInputFocused] = useState(false);
  
  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const user = savedUser;

  // ✅ FIXED Audit logging function - uses console logging instead of non-existent audits table
  const logAudit = async (action, details = {}) => {
    try {
      // Just log to console - no separate audits table
      console.log(`[AUDIT] ${action}`, {
        user_id: user?.user_id,
        username: user?.username,
        details,
        timestamp: new Date().toISOString()
      });
      return Date.now(); // Return timestamp for compatibility
    } catch (error) {
      console.error('Failed to log audit:', error);
      return null;
    }
  };

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

  // ✅ Load data once
  useEffect(() => {
    // ✅ FIXED: Just log to console
    console.log(`[AUDIT] VIEW_RESUPPLY_SCREEN`, {
      user_id: user?.user_id,
      username: user?.username
    });

    loadProductsAndSuppliers();

    const handleGlobalScan = (e) => {
      // Don't capture if user is typing in any input field
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
      }

      if (e.key === "Enter" && barcode.trim()) {
        handleScan(barcode.trim());
      } else if (e.key.length === 1) {
        setBarcode((prev) => prev + e.key);
      }
    };

    window.addEventListener("keydown", handleGlobalScan);
    return () => window.removeEventListener("keydown", handleGlobalScan);
  }, [barcode, selectedSupplierId]);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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

  const loadProductsAndSuppliers = async () => {
    try {
      // ✅ FIXED: Just log to console
      console.log(`[AUDIT] LOAD_RESUPPLY_DATA`, {
        user_id: user?.user_id
      });

      const prodRes = await db.products.toArray();
      const supRes = await db.suppliers.toArray();
      const inventoryData = await db.inventory.toArray();

      const enrichedProducts = prodRes.map((p) => {
        const inv = inventoryData.find((i) => i.product_id === p.product_id);
        return {
          id: p.product_id,
          sku: p.sku,
          name: p.name,
          price: parseFloat(p.unit_price) || 0,
          stock: inv?.quantity || 0,
          baseUnit: p.base_unit || "pcs",
          threshold: p.threshold || 5,
        };
      });

      setProducts(enrichedProducts);
      setSuppliers(supRes);

      const lowStock = enrichedProducts.filter((p) => p.stock <= p.threshold);
      setLowStockProducts(lowStock);
    } catch (err) {
      console.error("Error loading data:", err);
      // ✅ FIXED: Just log to console
      console.error(`[AUDIT] LOAD_RESUPPLY_DATA_ERROR`, {
        error: err.message,
        user_id: user?.user_id
      });
    }
  };

  const handleSearch = (searchTerm) => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    // ✅ FIXED: Just log to console
    console.log(`[AUDIT] SEARCH_PRODUCT_RESUPPLY`, {
      search_term: searchTerm,
      user_id: user?.user_id
    });

    const term = searchTerm.toLowerCase();
    const results = products.filter(product => 
      product.name.toLowerCase().includes(term) || 
      (product.sku && product.sku.toLowerCase().includes(term))
    );

    setSearchResults(results);
    setShowSearchResults(results.length > 0);
  };

  const handleScan = async (code) => {
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
      if (!selectedSupplierId) {
        alert("⚠️ Please select a supplier before scanning.");
        
        // ✅ FIXED: Just log to console
        console.log(`[AUDIT] SCAN_NO_SUPPLIER`, {
          barcode: code,
          product_id: product.id,
          product_name: product.name,
          user_id: user?.user_id
        });
        
        setBarcode("");
        return;
      }
      
      // ✅ FIXED: Just log to console
      console.log(`[AUDIT] SCAN_PRODUCT_RESUPPLY`, {
        barcode: code,
        product_id: product.id,
        product_name: product.name,
        supplier_id: selectedSupplierId,
        user_id: user?.user_id
      });
      
      addToCart(product, 1);
    } else {
      // If no exact match, search and show results
      handleSearch(code);
    }
    setBarcode("");
  };

  const handleSearchSelect = async (product) => {
    if (!selectedSupplierId) {
      alert("⚠️ Please select a supplier first.");
      
      // ✅ FIXED: Just log to console
      console.log(`[AUDIT] SEARCH_SELECT_NO_SUPPLIER`, {
        product_id: product.id,
        product_name: product.name,
        user_id: user?.user_id
      });
      
      return;
    }
    
    // ✅ FIXED: Just log to console
    console.log(`[AUDIT] SEARCH_SELECT_PRODUCT`, {
      product_id: product.id,
      product_name: product.name,
      supplier_id: selectedSupplierId,
      user_id: user?.user_id
    });
    
    addToCart(product, 1);
    setShowSearchResults(false);
    setBarcode("");
  };

  const addToCart = async (product, qty = 1) => {
    if (!selectedSupplierId) {
      alert("Select a supplier first!");
      
      // ✅ FIXED: Just log to console
      console.log(`[AUDIT] ADD_TO_CART_NO_SUPPLIER`, {
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        user_id: user?.user_id
      });
      
      return;
    }

    // ✅ FIXED: Just log to console
    console.log(`[AUDIT] ADD_TO_CART`, {
      product_id: product.id,
      product_name: product.name,
      supplier_id: selectedSupplierId,
      quantity: qty,
      user_id: user?.user_id
    });

    const existing = cart.find(
      (item) =>
        item.id === product.id && item.supplier_id === parseInt(selectedSupplierId)
    );

    if (existing) {
      setCart(
        cart.map((item) =>
          item.id === product.id && item.supplier_id === parseInt(selectedSupplierId)
            ? { ...item, quantity: item.quantity + qty }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          ...product,
          quantity: qty,
          supplier_id: parseInt(selectedSupplierId),
          unitCost: 0,
          unitType: product.baseUnit,
          expirationDate: "",
          noExpiry: false,
        },
      ]);
    }
  };

  const updateCartField = (id, supplier_id, field, value) => {
    setCart(
      cart.map((item) =>
        item.id === id && item.supplier_id === supplier_id
          ? { ...item, [field]: value }
          : item
      )
    );
  };

  const removeFromCart = async (id, supplier_id) => {
    const item = cart.find(item => item.id === id && item.supplier_id === supplier_id);
    
    // ✅ FIXED: Just log to console
    console.log(`[AUDIT] REMOVE_FROM_CART`, {
      product_id: id,
      product_name: item?.name,
      supplier_id: supplier_id,
      quantity: item?.quantity,
      user_id: user?.user_id
    });
    
    setCart(cart.filter((item) => !(item.id === id && item.supplier_id === supplier_id)));
  };

  const handleResupply = async () => {
  if (cart.length === 0) {
    alert("No products to resupply.");
    return;
  }
  
  if (!selectedSupplierId) {
    alert("⚠️ Please select a supplier.");
    return;
  }

  // Validate required fields
  const invalidItems = cart.filter(item => {
    const unitCost = parseFloat(item.unitCost) || 0;
    return unitCost <= 0 || item.quantity <= 0;
  });

  if (invalidItems.length > 0) {
    alert("⚠️ Please check all items:\n- Unit cost must be greater than 0\n- Quantity must be greater than 0");
    return;
  }

  try {
    const today = new Date().toISOString().split("T")[0];
    const transactionDateTime = getFormattedDateTime();
    
    // ✅ FIXED: Just log to console
    console.log(`[AUDIT] RESUPPLY_ATTEMPT`, {
      supplier_id: selectedSupplierId,
      items_count: cart.length,
      total_quantity: cart.reduce((sum, item) => sum + item.quantity, 0),
      total_cost: cart.reduce((sum, item) => sum + (parseFloat(item.unitCost) || 0) * item.quantity, 0),
      user_id: user?.user_id
    });

    for (const item of cart) {
      const resupplyData = {
        product_id: item.id,
        supplier_id: item.supplier_id,
        quantity: item.quantity,
        unit_cost: parseFloat(item.unitCost) || 0,
        expiration_date: item.noExpiry ? "" : item.expirationDate || "",
        unit_type: item.unitType,
        user_id: user.user_id,
        resupply_date: today,
        // ✅ ADDED: Include created_by and created_at
        created_by: user?.username,
        created_at: transactionDateTime
      };

      // Add resupply record
      await db.resupplied_items.add(resupplyData);

      // Update inventory
      const existingInv = await db.inventory
        .where({ product_id: item.id })
        .first();

      if (!existingInv) {
        await db.inventory.add({
          product_id: item.id,
          supplier_id: item.supplier_id,
          quantity: item.quantity,
          expiration_date: resupplyData.expiration_date,
          updated_by: user?.username,
          updated_at: new Date().toISOString()
        });
      } else {
        await db.inventory.where({ product_id: item.id }).modify((inv) => {
          inv.quantity += item.quantity;
          inv.supplier_id = item.supplier_id;
          inv.expiration_date = resupplyData.expiration_date;
          inv.updated_by = user?.username;
          inv.updated_at = new Date().toISOString();
        });
      }

      // Get current running balance for stock card
      const currentStock = existingInv ? existingInv.quantity + item.quantity : item.quantity;
      
      // Get product price
      const prod = await db.products.get(item.id);
      
      // ✅ FIXED: Just log to console
      console.log(`[AUDIT] RESUPPLY_ITEM`, {
        product_id: item.id,
        product_name: item.name,
        supplier_id: item.supplier_id,
        quantity: item.quantity,
        unit_cost: parseFloat(item.unitCost) || 0,
        total_cost: (parseFloat(item.unitCost) || 0) * item.quantity,
        expiration_date: resupplyData.expiration_date,
        user_id: user?.user_id
      });
      
      // ✅ ADD STOCK CARD RECORD FOR RESUPPLY (STOCK-IN) with created_by
      await db.stock_card.add({
        product_id: item.id,
        supplier_id: item.supplier_id,
        user_id: user.user_id,
        quantity: item.quantity, // Positive for stock-in
        unit_cost: parseFloat(item.unitCost) || 0,
        unit_price: prod?.unit_price || 0,
        resupply_date: today,
        expiration_date: resupplyData.expiration_date,
        unit_type: item.unitType,
        transaction_type: "RESUPPLY",
        transaction_date: transactionDateTime,
        running_balance: currentStock,
        // ✅ ADDED: Include created_by and created_at for audit trail
        created_by: user?.username,
        created_at: transactionDateTime
      });
    }

    // ✅ FIXED: Just log to console
    console.log(`[AUDIT] RESUPPLY_SUCCESS`, {
      supplier_id: selectedSupplierId,
      items_count: cart.length,
      total_quantity: cart.reduce((sum, item) => sum + item.quantity, 0),
      total_cost: cart.reduce((sum, item) => sum + (parseFloat(item.unitCost) || 0) * item.quantity, 0),
      user_id: user?.user_id
    });

    alert("✅ Resupply completed successfully!");
    setCart([]);
    setSelectedSupplierId("");
    setBarcode("");
    setSearchResults([]);
    setShowSearchResults(false);
    loadProductsAndSuppliers(); // Refresh data
  } catch (err) {
    console.error("Error during resupply:", err);
    
    // ✅ FIXED: Just log to console
    console.error(`[AUDIT] RESUPPLY_ERROR`, {
      error: err.message,
      supplier_id: selectedSupplierId,
      items_count: cart.length,
      user_id: user?.user_id
    });
    
    alert("❌ Failed to resupply products. Please try again.");
  }
};

  const handleClearCart = async () => {
    // ✅ FIXED: Just log to console
    console.log(`[AUDIT] CLEAR_RESUPPLY_CART`, {
      items_count: cart.length,
      total_quantity: cart.reduce((sum, item) => sum + item.quantity, 0),
      user_id: user?.user_id
    });
    
    setCart([]);
  };

  const handleSupplierChange = async (supplierId) => {
    // ✅ FIXED: Just log to console
    if (supplierId !== selectedSupplierId) {
      console.log(`[AUDIT] CHANGE_RESUPPLY_SUPPLIER`, {
        old_supplier_id: selectedSupplierId,
        new_supplier_id: supplierId,
        user_id: user?.user_id
      });
    }
    
    setSelectedSupplierId(supplierId);
  };

  const handleLowStockClick = async (product) => {
    if (!selectedSupplierId) {
      alert("⚠️ Please select a supplier first.");
      return;
    }
    
    // ✅ FIXED: Just log to console
    console.log(`[AUDIT] LOW_STOCK_CLICK`, {
      product_id: product.id,
      product_name: product.name,
      current_stock: product.stock,
      threshold: product.threshold,
      suggested_quantity: Math.max(product.threshold - product.stock + 1, 1),
      supplier_id: selectedSupplierId,
      user_id: user?.user_id
    });
    
    addToCart(product, Math.max(product.threshold - product.stock + 1, 1));
  };

  const unitOptions = (baseUnit) => {
    switch (baseUnit) {
      case "pcs":
        return ["pieces", "dozen", "boxes", "packs"];
      case "grams":
      case "kilos":
        return ["grams", "kilos"];
      case "ml":
      case "liters":
        return ["ml", "liters"];
      default:
        return [baseUnit];
    }
  };

  // Store quantity input ref
  const setQuantityInputRef = (id, supplier_id, element) => {
    const key = `${id}-${supplier_id}`;
    quantityInputRefs.current[key] = element;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Resupply Inventory</h1>
        <p style={styles.subtitle}>
          Scan or search products to restock your inventory.
        </p>
      </div>

      <div style={styles.formCard}>
        <label style={styles.label}>Select Supplier *</label>
        <select
          style={styles.input}
          value={selectedSupplierId}
          onChange={(e) => handleSupplierChange(e.target.value)}
          required
        >
          <option value="">Select Supplier</option>
          {suppliers.map((s) => (
            <option key={s.supplier_id} value={s.supplier_id}>
              {s.name}
            </option>
          ))}
        </select>

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
            onKeyDown={(e) => e.key === "Enter" && barcode.trim() && handleScan(barcode.trim())}
            onFocus={() => {
              setIsInputFocused(true);
              if (searchResults.length > 0) setShowSearchResults(true);
            }}
            onBlur={() => setIsInputFocused(false)}
            disabled={!selectedSupplierId}
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

      {/* Low Stock Section */}
      {lowStockProducts.length > 0 && (
        <div style={styles.lowStockCard}>
          <h3 style={styles.lowStockTitle}>⚠️ Low Stock Products</h3>
          <p style={styles.lowStockHint}>
            Click on any product below to quickly add it to your resupply list
          </p>
          <div style={styles.lowStockGrid}>
            {lowStockProducts.map((p) => (
              <div
                key={p.id}
                style={styles.lowStockItem}
                onClick={() => handleLowStockClick(p)}
              >
                <div style={styles.lowStockItemName}>{p.name}</div>
                <div style={styles.lowStockItemDetails}>
                  <span>Current: <strong>{p.stock}</strong></span>
                  <span>Threshold: <strong>{p.threshold}</strong></span>
                  <span>Short: <strong>{Math.max(p.threshold - p.stock + 1, 1)}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cart Section */}
      <div style={styles.cartCard}>
        <div style={styles.cartHeader}>
          <div>
            <h3 style={styles.cartTitle}>Resupply List</h3>
            <div style={styles.cartSummary}>
              <span style={styles.cartSummaryItem}>
                Items: <strong>{cart.length}</strong>
              </span>
              <span style={styles.cartSummaryItem}>
                Total Quantity: <strong>{cart.reduce((sum, item) => sum + item.quantity, 0)}</strong>
              </span>
              <span style={styles.cartSummaryItem}>
                Total Cost: <strong>₱{cart.reduce((sum, item) => sum + (parseFloat(item.unitCost) || 0) * item.quantity, 0).toFixed(2)}</strong>
              </span>
            </div>
          </div>
          {cart.length > 0 && (
            <button style={styles.clearCartButton} onClick={handleClearCart}>
              Clear All
            </button>
          )}
        </div>
        
        {cart.length === 0 ? (
          <div style={styles.emptyCart}>
            <span style={styles.emptyCartIcon}>📦</span>
            <div style={styles.emptyCartText}>No products added yet</div>
            <p style={styles.emptyCartHint}>
              {selectedSupplierId 
                ? "Scan barcode or search products to add them"
                : "Select a supplier first, then scan/search products"}
            </p>
          </div>
        ) : (
          <div style={styles.cartItems}>
            {cart.map((item) => (
              <div key={`${item.id}-${item.supplier_id}`} style={styles.cartItem}>
                <div style={styles.itemInfo}>
                  <div style={styles.itemTitle}>{item.name}</div>
                  <div style={styles.itemMeta}>
                    <span>SKU: {item.sku || 'N/A'}</span>
                    <span>Current Stock: {item.stock} {item.baseUnit}</span>
                    <span>Supplier: {suppliers.find((s) => s.supplier_id === item.supplier_id)?.name || 'N/A'}</span>
                  </div>
                </div>

                <div style={styles.itemControls}>
                  <div style={styles.controlGroup}>
                    <label style={styles.fieldLabel}>Quantity *</label>
                    <div style={styles.qtyRow}>
                      <button
                        onClick={() =>
                          updateCartField(
                            item.id,
                            item.supplier_id,
                            "quantity",
                            Math.max(item.quantity - 1, 1)
                          )
                        }
                        style={styles.qtyBtn}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        value={item.quantity}
                        style={styles.qtyInput}
                        onChange={(e) =>
                          updateCartField(
                            item.id,
                            item.supplier_id,
                            "quantity",
                            Math.max(parseInt(e.target.value) || 1, 1)
                          )
                        }
                        min="1"
                        required
                        ref={(el) => setQuantityInputRef(item.id, item.supplier_id, el)}
                      />
                      <button
                        onClick={() =>
                          updateCartField(
                            item.id,
                            item.supplier_id,
                            "quantity",
                            item.quantity + 1
                          )
                        }
                        style={styles.qtyBtn}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div style={styles.controlGroup}>
                    <label style={styles.fieldLabel}>Unit Cost (₱) *</label>
                    <div style={styles.costInputContainer}>
                      <span style={styles.currencySymbol}>₱</span>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={item.unitCost}
                        onChange={(e) =>
                          updateCartField(item.id, item.supplier_id, "unitCost", e.target.value)
                        }
                        style={styles.costInput}
                        step="0.01"
                        min="0"
                        required
                      />
                    </div>
                    <div style={styles.costTotal}>
                      Total: ₱{((parseFloat(item.unitCost) || 0) * item.quantity).toFixed(2)}
                    </div>
                  </div>

                  <div style={styles.controlGroup}>
                    <label style={styles.fieldLabel}>Unit Type</label>
                    <select
                      value={item.unitType}
                      onChange={(e) =>
                        updateCartField(item.id, item.supplier_id, "unitType", e.target.value)
                      }
                      style={styles.smallInput}
                    >
                      {unitOptions(item.baseUnit).map((u) => (
                        <option key={u} value={u}>
                          {u.charAt(0).toUpperCase() + u.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={styles.controlGroup}>
                    <label style={styles.fieldLabel}>Expiration Date</label>
                    <div style={styles.expiryRow}>
                      <input
                        type="date"
                        value={item.expirationDate}
                        onChange={(e) =>
                          updateCartField(item.id, item.supplier_id, "expirationDate", e.target.value)
                        }
                        style={styles.dateInput}
                        disabled={item.noExpiry}
                        min={new Date().toISOString().split('T')[0]}
                      />
                      <label style={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={item.noExpiry}
                          onChange={(e) =>
                            updateCartField(item.id, item.supplier_id, "noExpiry", e.target.checked)
                          }
                          style={styles.checkbox}
                        />{" "}
                        No Expiry
                      </label>
                    </div>
                  </div>

                  <button
                    onClick={() => removeFromCart(item.id, item.supplier_id)}
                    style={styles.removeButton}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div style={styles.submitContainer}>
          <div style={styles.totalCostSummary}>
            <span>Total Items: <strong>{cart.length}</strong></span>
            <span>Total Quantity: <strong>{cart.reduce((sum, item) => sum + item.quantity, 0)}</strong></span>
            <span>Total Cost: <strong style={styles.totalCost}>₱{cart.reduce((sum, item) => sum + (parseFloat(item.unitCost) || 0) * item.quantity, 0).toFixed(2)}</strong></span>
          </div>
          <button style={styles.submitButton} onClick={handleResupply}>
            ✅ Complete Resupply
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: "16px",
    backgroundColor: "#F8FAFC",
    minHeight: "100vh",
    maxWidth: "1200px",
    margin: "0 auto",
    "@media (min-width: 768px)": {
      padding: "24px",
    },
  },
  header: {
    marginBottom: "24px",
  },
  title: {
    fontSize: "24px",
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: "8px",
    "@media (min-width: 768px)": {
      fontSize: "28px",
    },
  },
  subtitle: {
    color: "#64748B",
    fontSize: "14px",
    "@media (min-width: 768px)": {
      fontSize: "16px",
    },
  },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    marginBottom: "20px",
    "@media (min-width: 768px)": {
      padding: "20px",
    },
  },
  label: {
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: "6px",
    display: "block",
    fontSize: "14px",
  },
  input: {
    width: "100%",
    padding: "12px",
    marginBottom: "12px",
    borderRadius: "8px",
    border: "1px solid #D1D5DB",
    backgroundColor: "#F9FAFB",
    fontSize: "14px",
    boxSizing: "border-box",
  },
  searchContainer: {
    position: "relative",
    width: "100%",
  },
  searchResults: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: "8px",
    border: "1px solid #E5E7EB",
    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
    maxHeight: "300px",
    overflowY: "auto",
    zIndex: 100,
  },
  searchResultItem: {
    padding: "12px",
    borderBottom: "1px solid #F3F4F6",
    cursor: "pointer",
    transition: "background-color 0.2s",
    "&:hover": {
      backgroundColor: "#F9FAFB",
    },
    "&:last-child": {
      borderBottom: "none",
    },
  },
  searchProductName: {
    fontWeight: "600",
    color: "#1F2937",
    fontSize: "14px",
    marginBottom: "4px",
  },
  searchProductDetails: {
    fontSize: "12px",
    color: "#6B7280",
  },
  lowStockCard: {
    backgroundColor: "#FFFBEB",
    border: "1px solid #F59E0B",
    borderRadius: "12px",
    padding: "16px",
    marginBottom: "20px",
    "@media (min-width: 768px)": {
      padding: "20px",
    },
  },
  lowStockTitle: {
    fontSize: "16px",
    fontWeight: "600",
    color: "#92400E",
    marginBottom: "12px",
  },
  lowStockGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
    gap: "10px",
    "@media (max-width: 640px)": {
      gridTemplateColumns: "1fr",
    },
  },
  lowStockItem: {
    backgroundColor: "#fff",
    border: "1px solid #FDE68A",
    borderRadius: "8px",
    padding: "12px",
    cursor: "pointer",
    transition: "all 0.2s",
    "&:hover": {
      backgroundColor: "#FEF3C7",
      transform: "translateY(-2px)",
    },
  },
  lowStockItemName: {
    fontWeight: "600",
    color: "#1F2937",
    fontSize: "14px",
    marginBottom: "4px",
  },
  lowStockItemDetails: {
    fontSize: "12px",
    color: "#6B7280",
  },
  cartCard: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    "@media (min-width: 768px)": {
      padding: "20px",
    },
  },
  cartHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
    flexWrap: "wrap",
    gap: "8px",
  },
  cartTitle: {
    fontSize: "18px",
    fontWeight: "600",
    color: "#1E293B",
    margin: 0,
  },
  clearCartButton: {
    backgroundColor: "transparent",
    color: "#EF4444",
    border: "1px solid #EF4444",
    borderRadius: "6px",
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.2s",
    "&:hover": {
      backgroundColor: "#FEF2F2",
    },
  },
  emptyCart: {
    textAlign: "center",
    padding: "40px 20px",
    color: "#94A3B8",
  },
  emptyCartIcon: {
    fontSize: "48px",
    display: "block",
    marginBottom: "12px",
  },
  emptyCartText: {
    fontSize: "16px",
    fontWeight: "500",
    marginBottom: "8px",
  },
  emptyCartHint: {
    fontSize: "14px",
    color: "#CBD5E1",
    margin: 0,
  },
  cartItems: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  cartItem: {
    borderBottom: "1px solid #E2E8F0",
    paddingBottom: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    "@media (min-width: 768px)": {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingBottom: "20px",
    },
  },
  itemInfo: {
    flex: "1",
  },
  itemTitle: {
    fontWeight: "600",
    color: "#1E293B",
    fontSize: "16px",
    marginBottom: "8px",
  },
  itemMeta: {
    fontSize: "13px",
    color: "#64748B",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    "@media (min-width: 768px)": {
      flexDirection: "row",
      gap: "12px",
    },
  },
  itemControls: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "12px",
    width: "100%",
    "@media (min-width: 768px)": {
      width: "auto",
      gridTemplateColumns: "repeat(2, 1fr)",
      maxWidth: "400px",
    },
  },
  controlGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  fieldLabel: {
    fontSize: "12px",
    fontWeight: "500",
    color: "#475569",
    marginBottom: "2px",
  },
  qtyRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  qtyBtn: {
    padding: "6px 10px",
    borderRadius: "4px",
    border: "1px solid #CBD5E1",
    background: "#F1F5F9",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
    minWidth: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyInput: {
    width: "50px",
    textAlign: "center",
    padding: "6px",
    borderRadius: "4px",
    border: "1px solid #CBD5E1",
    fontSize: "14px",
  },
  smallInput: {
    padding: "8px",
    borderRadius: "6px",
    border: "1px solid #CBD5E1",
    fontSize: "14px",
    width: "100%",
    boxSizing: "border-box",
  },
  expiryRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  checkboxLabel: {
    fontSize: "12px",
    color: "#475569",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    cursor: "pointer",
  },
  checkbox: {
    margin: 0,
  },
  removeButton: {
    backgroundColor: "#FEF2F2",
    color: "#DC2626",
    border: "1px solid #FECACA",
    borderRadius: "6px",
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "500",
    transition: "all 0.2s",
    "&:hover": {
      backgroundColor: "#FEE2E2",
    },
    "@media (min-width: 768px)": {
      gridColumn: "span 2",
    },
  },
  submitContainer: {
    marginTop: "20px",
    display: "flex",
    justifyContent: "center",
    "@media (min-width: 768px)": {
      justifyContent: "flex-start",
    },
  },
  submitButton: {
    backgroundColor: "#3B82F6",
    color: "#fff",
    padding: "14px 24px",
    border: "none",
    borderRadius: "8px",
    fontWeight: "600",
    fontSize: "16px",
    cursor: "pointer",
    width: "100%",
    maxWidth: "400px",
    transition: "all 0.2s",
    "&:hover": {
      backgroundColor: "#2563EB",
    },
    "@media (min-width: 768px)": {
      width: "auto",
    },
  },
};