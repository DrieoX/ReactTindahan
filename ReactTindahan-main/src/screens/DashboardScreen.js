import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { useLocation } from 'react-router-dom';

export default function DashboardScreen({ userMode }) {
  const location = useLocation();

  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const savedMode = localStorage.getItem("userMode") || "Client";

  const user = location.state?.user || savedUser;
  const mode = location.state?.userMode || userMode || savedMode;

  const [stats, setStats] = useState({
    salesToday: 0,
    totalProducts: 0,
    lowStock: 0,
    expired: 0,
  });
  const [notifications, setNotifications] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [expiredItems, setExpiredItems] = useState([]);
  const [showLowStockModal, setShowLowStockModal] = useState(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // ✅ Today's Sales
      const sales = await db.sales.where('sales_date').equals(today).toArray();
      let salesToday = 0;
      let recentSalesData = [];

      for (let sale of sales) {
        const items = await db.sale_items.where('sales_id').equals(sale.sales_id).toArray();
        const totalSale = items.reduce((sum, i) => sum + i.amount, 0);
        salesToday += totalSale;

        const productDetails = await Promise.all(
          items.map(async (item) => {
            const product = await db.products.get(item.product_id);
            return product?.name || 'Unknown Product';
          })
        );

        recentSalesData.push({
          id: sale.sales_id,
          date: sale.sales_date,
          time: sale.sales_time || '00:00',
          amount: totalSale,
          items: items.length,
          productNames: productDetails
        });
      }

      // ✅ Total Products
      const totalProducts = await db.products.count();

      // ✅ Low Stock
      const inventory = await db.inventory.toArray();
      const products = await db.products.toArray();
      const lowStockItems = inventory
        .filter(i => i.quantity <= i.threshold)
        .map(i => {
          const product = products.find(p => p.product_id === i.product_id);
          return {
            name: product?.name || 'Unknown Product',
            quantity: i.quantity,
            threshold: i.threshold,
          };
        });
      const lowStock = lowStockItems.length;

      // ✅ Expired / Near Expiry
      const expiredItems = [];
      const todayDate = new Date();
      const nearExpiryThreshold = new Date();
      nearExpiryThreshold.setDate(todayDate.getDate() + 7);

      for (let i of inventory) {
        if (!i.expiration_date) continue; // ❌ Skip items without expiration
        const expDate = new Date(i.expiration_date);
        const product = await db.products.get(i.product_id);
        if (expDate < todayDate) {
          expiredItems.push({
            ...i,
            name: product?.name || 'Unknown Product',
            type: 'expired'
          });
        } else if (expDate <= nearExpiryThreshold) {
          expiredItems.push({
            ...i,
            name: product?.name || 'Unknown Product',
            type: 'near-expiry'
          });
        }
      }

      const expired = expiredItems.filter(e => e.type === 'expired').length;

      // ✅ Alerts
      const expAlerts = expiredItems.map(item => ({
        ...item,
        type: item.type,
      }));

      const lowAlerts = lowStockItems.map(i => ({
        ...i,
        type: 'low',
        name: i.name,
      }));

      setStats({ salesToday, totalProducts, lowStock, expired });
      setNotifications([...expAlerts, ...lowAlerts]);
      setRecentSales(recentSalesData.slice(0, 5));
      setLowStockItems(lowStockItems);
      setExpiredItems(expiredItems);
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    }
  };

  const handleTotalProductsClick = () => {
    // Acts as "clear filter" button – just reloads stats
    fetchDashboardStats();
  };

  return (
    <div style={styles.content}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h2 style={styles.pageTitle}>Dashboard</h2>
          <p style={styles.pageSubtitle}>
            Overview of your store's performance and inventory status
          </p>
        </div>
        <div style={styles.userSection}>
          <span style={styles.notificationIcon}>🔔</span>
          <span style={styles.headerText}>{user?.username || 'User'}</span>
          <span style={styles.logoutIcon}>🚪</span>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: '30px' }}>
        <h2 style={styles.welcomeTitle}>
          Welcome back, {user?.username || 'User'}!
        </h2>
        <p style={styles.welcomeSubtitle}>
          Here's what's happening with your business today.
        </p>

        {/* Stat Cards */}
        <div style={styles.statCardsContainer}>
          <div onClick={handleTotalProductsClick} style={{ cursor: 'pointer' }}>
            <StatCard
              label="Total Products"
              value={stats.totalProducts}
              change="View all inventory"
              bg="#22c55e"
              text="#ffffff"
            />
          </div>
          <StatCard
            label="Today's Sales"
            value={`₱${stats.salesToday.toFixed(2)}`}
            change="+12% from yesterday"
            bg="#4f46e5"
            text="#ffffff"
          />
          <div onClick={() => setShowLowStockModal(true)} style={{ cursor: 'pointer' }}>
            <StatCard
              label="Low Stock Items"
              value={stats.lowStock}
              change="+2 items need attention"
              bg="#f59e0b"
              text="#ffffff"
            />
          </div>
          <div onClick={() => setShowExpiredModal(true)} style={{ cursor: 'pointer' }}>
            <StatCard
              label="Expiring Soon"
              value={stats.expired}
              change="Check expiry details"
              bg="#ef4444"
              text="#ffffff"
            />
          </div>
        </div>

        {/* Transactions + Alerts */}
        <div style={styles.dashboardGrid}>
          {/* Recent Transactions */}
          <div style={styles.recentTransactions}>
            <div style={styles.sectionHeader}>
              <h3 style={styles.sectionTitle}>Recent Transactions</h3>
              <button style={styles.viewAllButton}>View all transactions</button>
            </div>

            {recentSales.length === 0 ? (
              <p style={styles.noDataText}>No recent transactions</p>
            ) : (
              recentSales.map((sale, index) => (
                <div key={index} style={styles.transactionCard}>
                  <div style={styles.transactionHeader}>
                    <span style={styles.transactionStatus}>Sale Completed</span>
                    <span style={styles.transactionTime}>
                      {sale.items} items • {sale.date} {sale.time}
                    </span>
                  </div>
                  <div style={styles.transactionProducts}>
                    {sale.productNames.slice(0, 2).map((name, i) => (
                      <span key={i} style={styles.productName}>{name}</span>
                    ))}
                    {sale.productNames.length > 2 && (
                      <span style={styles.moreItems}>+{sale.productNames.length - 2} more</span>
                    )}
                  </div>
                  <div style={styles.transactionAmount}>₱{sale.amount.toFixed(2)}</div>
                </div>
              ))
            )}
          </div>

          {/* Alerts */}
          <div style={styles.alertsSection}>
            <h3 style={styles.sectionTitle}>Alerts & Notifications</h3>
            {notifications.length === 0 ? (
              <p style={styles.noDataText}>No alerts right now.</p>
            ) : (
              <div style={styles.alertsList}>
                {notifications.map((item, index) => (
                  <div
                    key={index}
                    style={{
                      ...styles.alertCard,
                      backgroundColor:
                        item.type === 'expired'
                          ? '#fef2f2'
                          : item.type === 'near-expiry'
                          ? '#fff7ed'
                          : '#fffbeb',
                      borderLeft: `4px solid ${
                        item.type === 'expired'
                          ? '#ef4444'
                          : item.type === 'near-expiry'
                          ? '#fb923c'
                          : '#f59e0b'
                      }`,
                    }}
                  >
                    <div style={styles.alertHeader}>
                      <span
                        style={{
                          ...styles.alertIcon,
                          backgroundColor:
                            item.type === 'expired'
                              ? '#ef4444'
                              : item.type === 'near-expiry'
                              ? '#fb923c'
                              : '#f59e0b',
                        }}
                      >
                        {item.type === 'expired'
                          ? '⚠️'
                          : item.type === 'near-expiry'
                          ? '⏳'
                          : '📉'}
                      </span>
                      <div>
                        <p style={styles.alertTitle}>
                          {item.type === 'expired'
                            ? 'Product Expired'
                            : item.type === 'near-expiry'
                            ? 'Near Expiry Alert'
                            : 'Low Stock Alert'}
                        </p>
                        <p style={styles.alertProduct}>{item.name}</p>
                      </div>
                    </div>
                    <p style={styles.alertDescription}>
                      {item.type === 'expired'
                        ? `Expired on ${item.expiration_date}`
                        : item.type === 'near-expiry'
                        ? `Expiring soon on ${item.expiration_date}`
                        : `Only ${item.quantity} left in stock (Threshold: ${item.threshold})`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ✅ Low Stock Modal */}
      {showLowStockModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContainer}>
            <h2 style={styles.modalHeader}>Low Stock Items</h2>
            {lowStockItems.length === 0 ? (
              <p style={styles.noDataText}>No items are low in stock.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeader}>
                    <th style={styles.tableCell}>Product</th>
                    <th style={styles.tableCell}>Quantity</th>
                    <th style={styles.tableCell}>Threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockItems.map((item, i) => (
                    <tr key={i} style={styles.tableRow}>
                      <td style={styles.tableCell}>{item.name}</td>
                      <td style={styles.tableCell}>{item.quantity}</td>
                      <td style={styles.tableCell}>{item.threshold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={styles.modalButtons}>
              <button style={styles.cancelButton} onClick={() => setShowLowStockModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Expired/Near Expiry Modal */}
      {showExpiredModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContainer}>
            <h2 style={styles.modalHeader}>Expiring / Expired Items</h2>
            {expiredItems.length === 0 ? (
              <p style={styles.noDataText}>No expired or near expiry items.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeader}>
                    <th style={styles.tableCell}>Product</th>
                    <th style={styles.tableCell}>Status</th>
                    <th style={styles.tableCell}>Expiry Date</th>
                  </tr>
                </thead>
                <tbody>
                  {expiredItems.map((item, i) => (
                    <tr key={i} style={styles.tableRow}>
                      <td style={styles.tableCell}>{item.name}</td>
                      <td style={styles.tableCell}>
                        {item.type === 'expired' ? 'Expired' : 'Near Expiry'}
                      </td>
                      <td style={styles.tableCell}>{item.expiration_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={styles.modalButtons}>
              <button style={styles.cancelButton} onClick={() => setShowExpiredModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const StatCard = ({ label, value, change, bg, text }) => (
  <div style={{ ...styles.statCard, backgroundColor: bg, color: text }}>
    <p style={styles.statLabel}>{label}</p>
    <p style={styles.statValue}>{value}</p>
    <p style={styles.statChange}>{change}</p>
  </div>
);

const styles = {
  content: {
    flex: 1,
    backgroundColor: '#f8fafc',
    minHeight: '100vh',
  },
  header: {
    height: 'clamp(60px, 10vh, 100px)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 clamp(12px, 3vw, 30px)',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  headerLeft: { flex: 1, minWidth: '200px' },
  pageTitle: { fontSize: 'clamp(18px, 2vw, 24px)', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' },
  pageSubtitle: { fontSize: 'clamp(14px, 1.5vw, 16px)', color: '#64748b' },
  userSection: { display: 'flex', alignItems: 'center', gap: 'clamp(8px, 2vw, 20px)', flexWrap: 'wrap', justifyContent: 'flex-end' },
  notificationIcon: { fontSize: '20px' },
  logoutIcon: { fontSize: '20px', cursor: 'pointer' },
  headerText: { fontWeight: 600, color: '#111827', fontSize: 'clamp(14px, 1.5vw, 16px)' },
  welcomeTitle: { fontSize: '24px', fontWeight: 'bold', marginBottom: '4px', color: '#1e293b' },
  welcomeSubtitle: { fontSize: '16px', color: '#64748b', marginBottom: '20px' },
  statCardsContainer: { display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '30px' },
  statCard: { padding: '20px', borderRadius: '12px', flex: '1 1 200px', minWidth: '200px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)' },
  statLabel: { fontSize: '14px', opacity: 0.9, marginBottom: '8px' },
  statValue: { fontSize: '24px', fontWeight: 'bold', marginBottom: '4px' },
  statChange: { fontSize: '12px', opacity: 0.9 },
  dashboardGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '30px' },
  recentTransactions: { backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)', height: 'fit-content' },
  alertsSection: { backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)', height: 'fit-content' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  sectionTitle: { fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '0' },
  viewAllButton: { backgroundColor: 'transparent', border: 'none', color: '#4f46e5', fontSize: '14px', fontWeight: '500', cursor: 'pointer' },
  transactionCard: { border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '12px' },
  transactionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' },
  transactionStatus: { fontWeight: '500', color: '#1e293b' },
  transactionTime: { fontSize: '12px', color: '#64748b' },
  transactionProducts: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' },
  productName: { fontSize: '12px', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: '#475569' },
  moreItems: { fontSize: '12px', color: '#64748b' },
  transactionAmount: { fontWeight: '600', color: '#4f46e5', fontSize: '14px' },
  alertsList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  alertCard: { borderRadius: '8px', padding: '16px' },
  alertHeader: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' },
  alertIcon: { width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' },
  alertTitle: { fontWeight: '600', color: '#1e293b', margin: '0', fontSize: '14px' },
  alertProduct: { fontWeight: '500', color: '#475569', margin: '0', fontSize: '13px' },
  alertDescription: { margin: '0', fontSize: '12px', color: '#64748b' },
  noDataText: { color: '#94a3b8', fontSize: '14px', fontStyle: 'italic' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContainer: { backgroundColor: '#fff', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' },
  modalHeader: { fontSize: '20px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: '16px' },
  tableHeader: { backgroundColor: '#f1f5f9' },
  tableCell: { textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '14px', color: '#334155' },
  tableRow: { backgroundColor: '#fff' },
  modalButtons: { display: 'flex', justifyContent: 'flex-end', gap: '12px' },
  cancelButton: { backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer' },
};
