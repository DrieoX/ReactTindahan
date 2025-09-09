import React, { useState, useEffect } from 'react';
import { db } from '../db';
import MainLayout from '../components/MainLayout';

export default function SalesScreen({ userMode }) {
  const [products, setProducts] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [mode] = useState(userMode || 'client');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const items = await db.products.toArray();
      const inventory = await db.inventory.toArray();

      const merged = items.map((p) => {
        const inv = inventory.find((i) => i.product_id === p.product_id);
        return {
          ...p,
          unit_price: parseFloat(p.unit_price) || 0,
          stock: inv ? parseInt(inv.quantity) : 0,
        };
      });

      setProducts(merged);
    } catch (err) {
      console.error('Error loading products:', err);
    }
  };

  const addItem = (product) => {
    if (selectedItems.find((item) => item.product_id === product.product_id)) return;
    setSelectedItems([...selectedItems, { ...product, quantity: 1 }]);
    setShowModal(false);
  };

  const addItemByBarcode = () => {
    if (!barcodeInput) return;
    const product = products.find((p) => p.sku === barcodeInput);
    if (product) {
      addItem(product);
      setBarcodeInput('');
      setMessage('');
    } else {
      setMessage('Product not found with this barcode');
    }
  };

  const updateQuantity = (productId, qty) => {
    setSelectedItems((prev) =>
      prev.map((item) =>
        item.product_id === productId ? { ...item, quantity: qty } : item
      )
    );
  };

  const handleSale = async () => {
    if (selectedItems.length === 0) return;
    try {
      const saleId = await db.sales.add({ sales_date: new Date().toISOString() });

      for (const item of selectedItems) {
        const amount = item.quantity * item.unit_price;

        await db.sale_items.add({
          sales_id: saleId,
          product_id: item.product_id,
          quantity: item.quantity,
          amount,
        });

        await db.inventory.where('product_id').equals(item.product_id).modify((inv) => {
          inv.quantity = (inv.quantity || 0) - item.quantity;
        });
      }

      setMessage('Sale recorded successfully');
      setSelectedItems([]);
      setBarcodeInput('');
      loadProducts();
    } catch (err) {
      console.error('Error processing sale:', err);
    }
  };

  const totalAmount = selectedItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );

  return (
    <MainLayout userMode={mode.toLowerCase()}>
      <div className="p-6 bg-white min-h-screen">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">SmartTindahan</h1>
        <h2 className="text-xl font-semibold text-gray-700 mb-1">BORNOK Store</h2>
        <p className="text-gray-500 mb-6">Scan items and process customer transactions</p>

        {/* Barcode Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Barcode Scanner</h3>
          <input
            type="text"
            placeholder="Scan barcode here..."
            className="border rounded px-3 py-2 w-full mb-3"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItemByBarcode()}
          />
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Search Products
          </button>
        </div>

        {/* Current Order */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Current Order</h3>
          {selectedItems.length === 0 ? (
            <div className="bg-gray-100 p-4 rounded text-center">
              <p className="text-gray-600 font-semibold mb-1">Cart is empty</p>
              <p className="text-gray-400 text-sm">Scan items to add them to the cart</p>
            </div>
          ) : (
            <div className="space-y-4">
              {selectedItems.map((item) => (
                <div key={item.product_id} className="bg-gray-50 p-4 rounded">
                  <h4 className="font-bold text-gray-800 mb-2">{item.name}</h4>
                  <div className="flex justify-between text-sm mb-2">
                    <span>₱{item.unit_price.toFixed(2)}</span>
                    <span className="text-gray-500">Stock: {item.stock}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <input
                      type="number"
                      className="border rounded px-2 py-1 w-20 text-center"
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item.product_id, parseInt(e.target.value) || 0)}
                    />
                    <span className="font-semibold text-gray-800">
                      ₱{(item.quantity * item.unit_price).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Total + Action */}
        {selectedItems.length > 0 && (
          <>
            <div className="border-t pt-4 mb-6">
              <p className="text-xl font-bold text-gray-800 text-center">
                Total: ₱{totalAmount.toFixed(2)}
              </p>
            </div>
            <button
              onClick={handleSale}
              className="bg-green-600 text-white px-6 py-3 rounded w-full"
            >
              Process Payment
            </button>
          </>
        )}

        {message && (
          <p className="text-green-600 text-center mt-4">{message}</p>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center">
            <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4">Select Product</h3>
              <div className="divide-y">
                {products.map((item) => (
                  <div
                    key={item.product_id}
                    onClick={() => addItem(item)}
                    className="py-3 cursor-pointer hover:bg-gray-100"
                  >
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-sm text-gray-500">
                      ₱{item.unit_price.toFixed(2)} • Stock: {item.stock} • SKU: {item.sku}
                    </p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="mt-4 bg-red-500 text-white px-4 py-2 rounded w-full"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}