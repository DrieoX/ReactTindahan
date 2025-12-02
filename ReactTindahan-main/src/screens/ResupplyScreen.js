import React, { useState, useEffect, useRef } from "react";
import { db } from "../db";
import * as API from "../services/APIService";

export default function ResupplyScreen({ userMode }) {
  const mode = userMode || 'client';
  const [barcode, setBarcode] = useState("");
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  // ✅ Load data once
  useEffect(() => {
    loadProductsAndSuppliers();

    const handleGlobalScan = (e) => {
      if (document.activeElement === inputRef.current) return;

      if (e.key === "Enter" && barcode.trim()) {
        handleScan(barcode.trim());
      } else if (e.key.length === 1) {
        setBarcode((prev) => prev + e.key);
      }
    };

    window.addEventListener("keydown", handleGlobalScan);
    return () => window.removeEventListener("keydown", handleGlobalScan);
  }, [barcode, selectedSupplierId, mode]);

  const loadProductsAndSuppliers = async () => {
    setLoading(true);
    try {
      let prodData = [];
      let supData = [];
      let invData = [];

      if (mode === 'server') {
        // Local DB mode
        prodData = await db.products.toArray();
        supData = await db.suppliers.toArray();
        invData = await db.inventory.toArray();
      } else {
        // API mode
        try {
          const [apiProducts, apiSuppliers, apiInventory] = await Promise.all([
            API.fetchProducts && API.fetchProducts() || 
            fetch('http://localhost:5000/api/products').then(r => r.json()),
            API.fetchSuppliers(),
            API.fetchInventory()
          ]);
          
          prodData = apiProducts || [];
          supData = apiSuppliers || [];
          invData = apiInventory || [];
        } catch (apiErr) {
          console.error('API fetch error:', apiErr);
          // Fallback to empty arrays
          prodData = [];
          supData = [];
          invData = [];
        }
      }

      const enrichedProducts = prodData.map((p) => {
        const inv = invData.find((i) => i.product_id === p.product_id || i.id === p.product_id);
        return {
          id: p.product_id || p.id,
          sku: p.sku,
          name: p.name,
          price: parseFloat(p.unit_price) || 0,
          stock: inv?.quantity || 0,
          baseUnit: p.base_unit || "pcs",
          threshold: p.threshold || 5,
        };
      });

      setProducts(enrichedProducts);
      setSuppliers(supData);

      const lowStock = enrichedProducts.filter((p) => p.stock <= p.threshold);
      setLowStockProducts(lowStock);
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = (code) => {
    const product = products.find((p) => p.sku === code);
    if (product) {
      if (!selectedSupplierId) {
        alert("⚠️ Please select a supplier before scanning.");
        setBarcode("");
        return;
      }
      addToCart(product, 1);
    } else {
      alert("❌ Product not found for scanned code!");
    }
    setBarcode("");
  };

  const addToCart = (product, qty = 1) => {
    if (!selectedSupplierId) return alert("Select a supplier first!");

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

  const removeFromCart = (id, supplier_id) => {
    setCart(cart.filter((item) => !(item.id === id && item.supplier_id === supplier_id)));
  };

  const handleResupply = async () => {
    if (cart.length === 0) return alert("No products to resupply.");
    
    try {
      const today = new Date().toISOString().split("T")[0];
      
      if (mode === 'server') {
        // Local DB mode
        for (const item of cart) {
          const resupplyData = {
            product_id: item.id,
            supplier_id: item.supplier_id,
            quantity: item.quantity,
            unit_cost: parseFloat(item.unitCost) || 0,
            expiration_date: item.noExpiry ? "" : item.expirationDate || "",
            unit_type: item.unitType,
            user_id: 1,
            resupply_date: today,
          };

          await db.resupplied_items.add(resupplyData);

          const existingInv = await db.inventory
            .where({ product_id: item.id })
            .first();

          if (!existingInv) {
            await db.inventory.add({
              product_id: item.id,
              supplier_id: item.supplier_id,
              quantity: item.quantity,
              expiration_date: resupplyData.expiration_date,
            });
          } else {
            await db.inventory.where({ product_id: item.id }).modify((inv) => {
              inv.quantity += item.quantity;
              inv.supplier_id = item.supplier_id;
              inv.expiration_date = resupplyData.expiration_date;
            });
          }

          const prod = await db.products.get(item.id);
          await db.stock_card.add({
            product_id: item.id,
            supplier_id: item.supplier_id,
            user_id: 1,
            quantity: item.quantity,
            unit_cost: parseFloat(item.unitCost) || 0,
            unit_price: prod?.unit_price || 0,
            resupply_date: today,
            expiration_date: resupplyData.expiration_date,
            unit_type: item.unitType,
            transaction_type: "RESUPPLY",
          });
        }
      } else {
        // API mode
        for (const item of cart) {
          const resupplyData = {
            product_id: item.id,
            supplier_id: item.supplier_id,
            quantity: item.quantity,
            unit_cost: parseFloat(item.unitCost) || 0,
            expiration_date: item.noExpiry ? "" : item.expirationDate || "",
            unit_type: item.unitType,
            user_id: 1,
            resupply_date: today,
          };

          // Send to API
          try {
            const response = await fetch('http://localhost:5000/api/resupplied_items', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(resupplyData)
            });

            if (!response.ok) throw new Error('Failed to save resupply data');

            // Update inventory via API
            await fetch('http://localhost:5000/api/inventory', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                product_id: item.id,
                supplier_id: item.supplier_id,
                quantity: item.quantity,
                expiration_date: resupplyData.expiration_date
              })
            });

            // Add to stock card via API if endpoint exists
            try {
              await fetch('http://localhost:5000/api/stock_card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  product_id: item.id,
                  supplier_id: item.supplier_id,
                  user_id: 1,
                  quantity: item.quantity,
                  unit_cost: parseFloat(item.unitCost) || 0,
                  unit_price: item.price || 0,
                  resupply_date: today,
                  expiration_date: resupplyData.expiration_date,
                  unit_type: item.unitType,
                  transaction_type: "RESUPPLY"
                })
              });
            } catch (stockErr) {
              console.warn('Stock card API not available:', stockErr);
            }

          } catch (apiErr) {
            console.error('API error during resupply:', apiErr);
            throw apiErr;
          }
        }
      }

      alert("✅ Resupply completed successfully!");
      setCart([]);
      setSelectedSupplierId("");
      loadProductsAndSuppliers();
    } catch (err) {
      console.error("Error during resupply:", err);
      alert("❌ Failed to resupply products: " + err.message);
    }
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

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Resupply Inventory</h1>
        <p style={styles.subtitle}>
          Scan or add products to restock your inventory.
          <span style={styles.modeIndicator}> | Mode: {mode === 'server' ? 'Local Database' : 'API Server'}</span>
        </p>
      </div>

      {loading && (
        <div style={styles.loading}>
          Loading products and suppliers...
        </div>
      )}

      <div style={styles.formCard}>
        <label style={styles.label}>Select Supplier *</label>
        <select
          style={styles.input}
          value={selectedSupplierId}
          onChange={(e) => setSelectedSupplierId(e.target.value)}
        >
          <option value="">Select Supplier</option>
          {suppliers.map((s) => (
            <option key={s.supplier_id || s.id} value={s.supplier_id || s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <input
          ref={inputRef}
          style={styles.input}
          placeholder="Scan or enter product SKU"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleScan(barcode.trim())}
        />
      </div>

      {/* Low Stock Section */}
      {lowStockProducts.length > 0 && (
        <div style={styles.lowStockCard}>
          <h3>⚠️ Low Stock Products ({lowStockProducts.length})</h3>
          <div style={styles.lowStockGrid}>
            {lowStockProducts.map((p) => (
              <div
                key={p.id}
                style={styles.lowStockItem}
                onClick={() => addToCart(p, 1)}
              >
                <div style={styles.lowStockName}>{p.name}</div>
                <div style={styles.lowStockInfo}>
                  Stock: {p.stock} {p.baseUnit} | Threshold: {p.threshold}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cart Section */}
      <div style={styles.cartCard}>
        <h3 style={{ marginBottom: 10 }}>Resupply List ({cart.length} items)</h3>
        {cart.length === 0 ? (
          <div style={styles.emptyCart}>
            <span style={{ fontSize: 48, color: "#9CA3AF" }}>📦</span>
            <div>No products added yet</div>
            <div style={{ fontSize: '0.9rem', color: '#6B7280', marginTop: '8px' }}>
              Select a supplier and scan products or click on low stock items
            </div>
          </div>
        ) : (
          cart.map((item) => (
            <div key={`${item.id}-${item.supplier_id}`} style={styles.cartItem}>
              <div style={styles.itemInfo}>
                <div style={styles.itemTitle}>{item.name}</div>
                <div style={styles.itemMeta}>
                  SKU: {item.sku} | Current Stock: {item.stock} {item.baseUnit}
                  <br />
                  Supplier:{" "}
                  {suppliers.find((s) => s.supplier_id === item.supplier_id || s.id === item.supplier_id)?.name}
                </div>
              </div>

              <div style={styles.itemControls}>
                <label style={styles.fieldLabel}>Quantity</label>
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
                        parseInt(e.target.value) || 1
                      )
                    }
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

                <label style={styles.fieldLabel}>Unit Cost (₱)</label>
                <input
                  type="number"
                  placeholder="Enter cost"
                  value={item.unitCost}
                  onChange={(e) =>
                    updateCartField(item.id, item.supplier_id, "unitCost", e.target.value)
                  }
                  style={styles.smallInput}
                />

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

                <label style={styles.fieldLabel}>Expiration Date</label>
                <div style={styles.expiryRow}>
                  <input
                    type="date"
                    value={item.expirationDate}
                    onChange={(e) =>
                      updateCartField(item.id, item.supplier_id, "expirationDate", e.target.value)
                    }
                    style={styles.smallInput}
                    disabled={item.noExpiry}
                  />
                  <label style={{ fontSize: 12, display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={item.noExpiry}
                      onChange={(e) =>
                        updateCartField(item.id, item.supplier_id, "noExpiry", e.target.checked)
                      }
                      style={{ marginRight: '4px' }}
                    />
                    No Expiry
                  </label>
                </div>

                <button
                  onClick={() => removeFromCart(item.id, item.supplier_id)}
                  style={styles.removeButton}
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {cart.length > 0 && (
        <div style={styles.cartSummary}>
          <div style={styles.summaryInfo}>
            <div>Total Items: {cart.reduce((sum, item) => sum + item.quantity, 0)}</div>
            <div>Unique Products: {cart.length}</div>
            <div>Total Cost: ₱{cart.reduce((sum, item) => sum + (parseFloat(item.unitCost) || 0) * item.quantity, 0).toFixed(2)}</div>
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
    padding: "clamp(20px, 5vw, 40px)",
    backgroundColor: "#f8fafc",
    minHeight: "100vh",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    marginBottom: "32px",
    backgroundColor: "#ffffff",
    padding: "28px 32px",
    borderRadius: "20px",
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.03)",
    border: "1px solid #e2e8f0",
  },
  title: {
    fontSize: "32px",
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: "8px",
    letterSpacing: "-0.5px",
    background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: {
    fontSize: "15px",
    color: "#64748b",
    lineHeight: "1.5",
    maxWidth: "600px",
  },
  modeIndicator: {
    fontWeight: "600",
    color: "#4f46e5",
    marginLeft: "4px",
  },
  loading: {
    backgroundColor: "#ffffff",
    padding: "20px",
    borderRadius: "12px",
    textAlign: "center",
    color: "#64748b",
    fontSize: "14px",
    fontWeight: "500",
    marginBottom: "20px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
    border: "1px solid #e2e8f0",
  },
  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "28px 32px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
    marginBottom: "24px",
    border: "1px solid #e2e8f0",
  },
  label: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#374151",
    marginBottom: "10px",
    display: "block",
    letterSpacing: "0.3px",
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    marginBottom: "20px",
    borderRadius: "12px",
    border: "2px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    fontSize: "15px",
    transition: "all 0.2s ease",
    outline: "none",
    boxSizing: "border-box",
  },
  lowStockCard: {
    backgroundColor: "#fffbeb",
    borderRadius: "16px",
    padding: "24px",
    marginBottom: "24px",
    border: "2px solid #f59e0b",
    boxShadow: "0 4px 6px rgba(245, 158, 11, 0.1)",
  },
  lowStockGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "12px",
    marginTop: "16px",
  },
  lowStockItem: {
    backgroundColor: "#ffffff",
    padding: "16px",
    borderRadius: "12px",
    cursor: "pointer",
    transition: "all 0.2s ease",
    border: "1px solid #fef3c7",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  lowStockName: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#92400e",
  },
  lowStockInfo: {
    fontSize: "12px",
    color: "#b45309",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  cartCard: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "28px 32px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
    marginBottom: "24px",
    border: "1px solid #e2e8f0",
  },
  emptyCart: {
    textAlign: "center",
    padding: "60px 20px",
    color: "#94a3b8",
    fontSize: "16px",
    fontWeight: "500",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
  },
  cartItem: {
    borderBottom: "1px solid #f1f5f9",
    padding: "24px 0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "24px",
    flexWrap: "wrap",
  },
  itemInfo: {
    flex: "1",
    minWidth: "300px",
  },
  itemTitle: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: "6px",
  },
  itemMeta: {
    fontSize: "13px",
    color: "#64748b",
    lineHeight: "1.5",
  },
  itemControls: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    minWidth: "280px",
  },
  fieldLabel: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  qtyRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  qtyBtn: {
    width: "36px",
    height: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
    border: "2px solid #e2e8f0",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    color: "#475569",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  qtyInput: {
    width: "60px",
    height: "36px",
    textAlign: "center",
    border: "2px solid #e2e8f0",
    borderRadius: "8px",
    backgroundColor: "#ffffff",
    fontSize: "14px",
    fontWeight: "600",
    outline: "none",
  },
  smallInput: {
    padding: "10px 12px",
    borderRadius: "8px",
    border: "2px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    fontSize: "14px",
    outline: "none",
    transition: "all 0.2s ease",
    width: "100%",
    boxSizing: "border-box",
  },
  expiryRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  removeButton: {
    backgroundColor: "#fee2e2",
    color: "#dc2626",
    border: "2px solid #fecaca",
    borderRadius: "8px",
    padding: "10px 16px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s ease",
    marginTop: "8px",
    alignSelf: "flex-start",
  },
  cartSummary: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "24px 32px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "20px",
    border: "1px solid #e2e8f0",
  },
  summaryInfo: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "20px",
    width: "100%",
    textAlign: "center",
  },
  summaryItem: {
    fontSize: "14px",
    color: "#64748b",
    fontWeight: "500",
  },
  summaryValue: {
    fontSize: "18px",
    fontWeight: "700",
    color: "#1e293b",
    marginTop: "4px",
  },
  submitButton: {
    backgroundColor: "#4f46e5",
    color: "#ffffff",
    padding: "16px 32px",
    border: "none",
    borderRadius: "12px",
    fontWeight: "600",
    fontSize: "16px",
    cursor: "pointer",
    transition: "all 0.2s ease",
    width: "100%",
    maxWidth: "320px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    boxShadow: "0 4px 6px rgba(79, 70, 229, 0.2)",
  },
};

// Add CSS for hover effects and focus states
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  input:focus, select:focus {
    border-color: #4f46e5 !important;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1) !important;
  }
  
  button:hover {
    transform: translateY(-2px);
  }
  
  button:active {
    transform: translateY(0);
  }
  
  .qty-btn:hover {
    background-color: #e2e8f0;
    border-color: #cbd5e1;
  }
  
  .low-stock-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    border-color: #fbbf24;
  }
  
  .remove-button:hover {
    background-color: #fecaca;
    border-color: #fca5a5;
  }
  
  .submit-button:hover {
    background-color: #4338ca;
    box-shadow: 0 6px 12px rgba(79, 70, 229, 0.3);
  }
  
  .low-stock-item:hover .low-stock-name {
    color: #7c2d12;
  }
  
  input[type="checkbox"] {
    accent-color: #4f46e5;
  }
  
  select {
    cursor: pointer;
    background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23374151' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
    background-repeat: no-repeat;
    background-position: right 12px center;
    background-size: 16px;
    padding-right: 40px;
  }
`;
document.head.appendChild(styleSheet);

// Add summary info styling within the component
const summaryInfoStyles = {
  display: "flex",
  justifyContent: "space-around",
  width: "100%",
  flexWrap: "wrap",
  gap: "20px",
};

// Update the summaryInfo style in the styles object
styles.summaryInfo = summaryInfoStyles;

// Add summary item container style
styles.summaryItem = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "12px 16px",
  backgroundColor: "#f8fafc",
  borderRadius: "10px",
  minWidth: "120px",
};

styles.summaryLabel = {
  fontSize: "12px",
  color: "#64748b",
  fontWeight: "500",
  marginBottom: "4px",
};

styles.summaryValue = {
  fontSize: "20px",
  fontWeight: "700",
  color: "#1e293b",
};