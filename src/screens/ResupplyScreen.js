import React, { useState, useEffect, useRef } from "react";
import { db } from "../db";

export default function ResupplyScreen() {
  const [barcode, setBarcode] = useState("");
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const inputRef = useRef(null);
  
  // State for button clicks
  const [clickedButtons, setClickedButtons] = useState({});

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
  }, [barcode, selectedSupplierId]);

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

  const loadProductsAndSuppliers = async () => {
    try {
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

        await fetch("http://localhost:5000/api/resupply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resupplyData),
        });
      }

      alert("✅ Resupply completed successfully!");
      setCart([]);
      setSelectedSupplierId("");
      loadProductsAndSuppliers();
    } catch (err) {
      console.error("Error during resupply:", err);
      alert("❌ Failed to resupply products.");
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
        </p>
      </div>

      <div style={styles.formCard}>
        <label style={styles.label}>Select Supplier *</label>
        <select
          style={styles.input}
          value={selectedSupplierId}
          onChange={(e) => setSelectedSupplierId(e.target.value)}
        >
          <option value="">Select Supplier</option>
          {suppliers.map((s) => (
            <option key={s.supplier_id} value={s.supplier_id}>
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
          <h3>⚠️ Low Stock Products</h3>
          {lowStockProducts.map((p) => (
            <div
              key={p.id}
              style={styles.lowStockItem}
              onClick={() => handleButtonClick(`lowStock-${p.id}`, () => addToCart(p, 1))}
            >
              {p.name} | Stock: {p.stock} {p.baseUnit}
            </div>
          ))}
        </div>
      )}

      {/* Cart Section */}
      <div style={styles.cartCard}>
        <h3 style={{ marginBottom: 10 }}>Resupply List</h3>
        {cart.length === 0 ? (
          <div style={styles.emptyCart}>
            <span style={{ fontSize: 48, color: "#9CA3AF" }}>📦</span>
            <div>No products added yet</div>
          </div>
        ) : (
          cart.map((item) => (
            <div key={`${item.id}-${item.supplier_id}`} style={styles.cartItem}>
              <div style={styles.itemInfo}>
                <div style={styles.itemTitle}>{item.name}</div>
                <div style={styles.itemMeta}>
                  SKU: {item.sku} | Stock: {item.stock} {item.baseUnit}
                  <br />
                  Supplier:{" "}
                  {suppliers.find((s) => s.supplier_id === item.supplier_id)?.name}
                </div>
              </div>

              <div style={styles.itemControls}>
                <label style={styles.fieldLabel}>Quantity</label>
                <div style={styles.qtyRow}>
                  <button
                    onClick={() => handleButtonClick(`decrease-${item.id}-${item.supplier_id}`, () =>
                      updateCartField(
                        item.id,
                        item.supplier_id,
                        "quantity",
                        Math.max(item.quantity - 1, 1)
                      )
                    )}
                    style={{
                      ...styles.qtyBtn,
                      backgroundColor: clickedButtons[`decrease-${item.id}-${item.supplier_id}`] ? '#ffffff' : '#0ea5e9',
                      color: clickedButtons[`decrease-${item.id}-${item.supplier_id}`] ? '#0ea5e9' : '#ffffff',
                      border: clickedButtons[`decrease-${item.id}-${item.supplier_id}`] ? '2px solid #0ea5e9' : '1px solid #CBD5E1',
                    }}
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
                    onClick={() => handleButtonClick(`increase-${item.id}-${item.supplier_id}`, () =>
                      updateCartField(
                        item.id,
                        item.supplier_id,
                        "quantity",
                        item.quantity + 1
                      )
                    )}
                    style={{
                      ...styles.qtyBtn,
                      backgroundColor: clickedButtons[`increase-${item.id}-${item.supplier_id}`] ? '#ffffff' : '#0ea5e9',
                      color: clickedButtons[`increase-${item.id}-${item.supplier_id}`] ? '#0ea5e9' : '#ffffff',
                      border: clickedButtons[`increase-${item.id}-${item.supplier_id}`] ? '2px solid #0ea5e9' : '1px solid #CBD5E1',
                    }}
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
                  <label style={{ fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={item.noExpiry}
                      onChange={(e) =>
                        updateCartField(item.id, item.supplier_id, "noExpiry", e.target.checked)
                      }
                    />{" "}
                    No Expiry
                  </label>
                </div>

                <button
                  onClick={() => handleButtonClick(`remove-${item.id}-${item.supplier_id}`, () => removeFromCart(item.id, item.supplier_id))}
                  style={{
                    ...styles.removeButton,
                    backgroundColor: clickedButtons[`remove-${item.id}-${item.supplier_id}`] ? '#ffffff' : '#ef4444',
                    color: clickedButtons[`remove-${item.id}-${item.supplier_id}`] ? '#ef4444' : '#ffffff',
                    border: clickedButtons[`remove-${item.id}-${item.supplier_id}`] ? '2px solid #ef4444' : 'none',
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {cart.length > 0 && (
        <button 
          style={{
            ...styles.submitButton,
            backgroundColor: clickedButtons['completeResupply'] ? '#ffffff' : '#0ea5e9',
            color: clickedButtons['completeResupply'] ? '#0ea5e9' : '#ffffff',
            border: clickedButtons['completeResupply'] ? '2px solid #0ea5e9' : 'none',
          }}
          onClick={() => handleButtonClick('completeResupply', handleResupply)}
        >
          ✅ Complete Resupply
        </button>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: "clamp(12px, 4vw, 30px)",
    backgroundColor: "#F8FAFC",
    minHeight: "100vh",
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: "#1E293B",
  },
  subtitle: {
    color: "#64748B",
  },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    marginBottom: 20,
  },
  label: {
    fontWeight: 600,
    color: "#1E293B",
    marginBottom: 6,
    display: "block",
  },
  input: {
    width: "100%",
    padding: 10,
    marginBottom: 12,
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    backgroundColor: "#F9FAFB",
  },
  lowStockCard: {
    backgroundColor: "#fffbeb",
    border: "1px solid #f59e0b",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  lowStockItem: {
    padding: "8px 12px",
    margin: "4px 0",
    backgroundColor: "#fff",
    borderRadius: 6,
    border: "1px solid #fcd34d",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  cartCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  emptyCart: {
    textAlign: "center",
    padding: 30,
    color: "#94A3B8",
  },
  cartItem: {
    borderBottom: "1px solid #E2E8F0",
    padding: "12px 0",
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  itemInfo: {
    flex: 1,
    minWidth: 200,
  },
  itemTitle: {
    fontWeight: 600,
    color: "#1E293B",
  },
  itemMeta: {
    fontSize: 13,
    color: "#64748B",
  },
  itemControls: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    alignItems: "flex-end",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#374151",
    marginBottom: 2,
  },
  qtyRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  qtyBtn: {
    padding: "4px 8px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "bold",
    transition: "all 0.2s ease",
    minWidth: "28px",
  },
  qtyInput: {
    width: 50,
    textAlign: "center",
    padding: 4,
    borderRadius: 4,
    border: "1px solid #CBD5E1",
  },
  smallInput: {
    padding: 6,
    borderRadius: 6,
    border: "1px solid #CBD5E1",
    width: 120,
  },
  expiryRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  removeButton: {
    border: "none",
    borderRadius: 6,
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "500",
    transition: "all 0.2s ease",
  },
  submitButton: {
    padding: 14,
    border: "none",
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 16,
    marginTop: 20,
    cursor: "pointer",
    width: "100%",
    maxWidth: 320,
    transition: "all 0.2s ease",
  },
};