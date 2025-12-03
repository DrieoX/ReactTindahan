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
      <div style={styles.mainContent}>
        <h2 style={styles.welcomeTitle}>
          Welcome back, {user?.username || 'User'}!
        </h2>
        <p style={styles.welcomeSubtitle}>
          Here's what's happening with your business today.
        </p>

        {/* Stat Cards */}
        <div style={styles.statCardsContainer}>
          <div onClick={handleTotalProductsClick} style={styles.statCardWrapper}>
            <StatCard
              label="Total Products"
              value={stats.totalProducts}
              change="View all inventory"
              bg="#22c55e"
              text="#ffffff"
            />
          </div>
          <div style={styles.statCardWrapper}>
            <StatCard
              label="Today's Sales"
              value={`₱${stats.salesToday.toFixed(2)}`}
              change="+12% from yesterday"
              bg="#4f46e5"
              text="#ffffff"
            />
          </div>
          <div onClick={() => setShowLowStockModal(true)} style={styles.statCardWrapper}>
            <StatCard
              label="Low Stock Items"
              value={stats.lowStock}
              change="+2 items need attention"
              bg="#f59e0b"
              text="#ffffff"
            />
          </div>
          <div onClick={() => setShowExpiredModal(true)} style={styles.statCardWrapper}>
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
              <div style={styles.transactionsList}>
                {recentSales.map((sale, index) => (
                  <div key={index} style={styles.transactionCard}>
                    <div style={styles.transactionHeader}>
                      <div style={styles.transactionHeaderLeft}>
                        <span style={styles.transactionStatus}>Sale Completed</span>
                        <span style={styles.transactionTime}>
                          {sale.items} items • {sale.date} {sale.time}
                        </span>
                      </div>
                      <span style={styles.transactionAmount}>₱{sale.amount.toFixed(2)}</span>
                    </div>
                    <div style={styles.transactionProducts}>
                      {sale.productNames.slice(0, 2).map((name, i) => (
                        <span key={i} style={styles.productName}>{name}</span>
                      ))}
                      {sale.productNames.length > 2 && (
                        <span style={styles.moreItems}>+{sale.productNames.length - 2} more</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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
                      <div style={styles.alertContent}>
                        <p style={styles.alertTitle}>
                          {item.type === 'expired'
                            ? 'Product Expired'
                            : item.type === 'near-expiry'
                            ? 'Near Expiry Alert'
                            : 'Low Stock Alert'}
                        </p>
                        <p style={styles.alertProduct}>{item.name}</p>
                        <p style={styles.alertDescription}>
                          {item.type === 'expired'
                            ? `Expired on ${item.expiration_date}`
                            : item.type === 'near-expiry'
                            ? `Expiring soon on ${item.expiration_date}`
                            : `Only ${item.quantity} left in stock (Threshold: ${item.threshold})`}
                        </p>
                      </div>
                    </div>
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
              <div style={styles.tableContainer}>
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
              </div>
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
              <div style={styles.tableContainer}>
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
              </div>
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
    height: 'auto',
    minHeight: '80px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
    flexWrap: 'wrap',
    gap: '16px',
    '@media (max-width: 768px)': {
      flexDirection: 'column',
      alignItems: 'flex-start',
      padding: '12px 16px',
      gap: '12px',
    },
  },
  headerLeft: {
    flex: 1,
    minWidth: '200px',
  },
  pageTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: '4px',
    '@media (max-width: 768px)': {
      fontSize: '20px',
    },
  },
  pageSubtitle: {
    fontSize: '16px',
    color: '#64748b',
    '@media (max-width: 768px)': {
      fontSize: '14px',
    },
  },
  userSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    '@media (max-width: 768px)': {
      width: '100%',
      justifyContent: 'space-between',
      marginTop: '8px',
    },
  },
  notificationIcon: {
    fontSize: '20px',
  },
  logoutIcon: {
    fontSize: '20px',
    cursor: 'pointer',
  },
  headerText: {
    fontWeight: 600,
    color: '#111827',
    fontSize: '16px',
  },
  mainContent: {
    padding: '20px',
    '@media (max-width: 768px)': {
      padding: '16px',
    },
  },
  welcomeTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '4px',
    color: '#1e293b',
    '@media (max-width: 768px)': {
      fontSize: '20px',
    },
  },
  welcomeSubtitle: {
    fontSize: '16px',
    color: '#64748b',
    marginBottom: '24px',
    '@media (max-width: 768px)': {
      fontSize: '14px',
      marginBottom: '20px',
    },
  },
  statCardsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
    marginBottom: '30px',
    '@media (max-width: 768px)': {
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '12px',
    },
    '@media (max-width: 480px)': {
      gridTemplateColumns: '1fr',
    },
  },
  statCardWrapper: {
    cursor: 'pointer',
  },
  statCard: {
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
    height: '100%',
    minHeight: '120px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    '@media (max-width: 768px)': {
      padding: '16px',
      minHeight: '110px',
    },
  },
  statLabel: {
    fontSize: '14px',
    opacity: 0.9,
    marginBottom: '8px',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '4px',
    '@media (max-width: 768px)': {
      fontSize: '20px',
    },
  },
  statChange: {
    fontSize: '12px',
    opacity: 0.9,
  },
  dashboardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '24px',
    marginBottom: '30px',
    '@media (max-width: 1024px)': {
      gridTemplateColumns: '1fr',
      gap: '20px',
    },
  },
  recentTransactions: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
    height: 'fit-content',
    '@media (max-width: 768px)': {
      padding: '16px',
    },
  },
  alertsSection: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
    height: 'fit-content',
    '@media (max-width: 768px)': {
      padding: '16px',
    },
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    flexWrap: 'wrap',
    gap: '8px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '0',
    '@media (max-width: 768px)': {
      fontSize: '16px',
    },
  },
  viewAllButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#4f46e5',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    padding: '4px 8px',
    '@media (max-width: 768px)': {
      fontSize: '13px',
    },
  },
  transactionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  transactionCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '16px',
    '@media (max-width: 768px)': {
      padding: '12px',
    },
  },
  transactionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px',
    flexWrap: 'wrap',
    gap: '8px',
  },
  transactionHeaderLeft: {
    flex: 1,
  },
  transactionStatus: {
    fontWeight: '500',
    color: '#1e293b',
    fontSize: '14px',
    display: 'block',
    marginBottom: '4px',
  },
  transactionTime: {
    fontSize: '12px',
    color: '#64748b',
    display: 'block',
  },
  transactionAmount: {
    fontWeight: '600',
    color: '#4f46e5',
    fontSize: '16px',
    whiteSpace: 'nowrap',
    '@media (max-width: 768px)': {
      fontSize: '14px',
    },
  },
  transactionProducts: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    alignItems: 'center',
  },
  productName: {
    fontSize: '12px',
    backgroundColor: '#f1f5f9',
    padding: '4px 8px',
    borderRadius: '4px',
    color: '#475569',
    '@media (max-width: 768px)': {
      fontSize: '11px',
      padding: '3px 6px',
    },
  },
  moreItems: {
    fontSize: '12px',
    color: '#64748b',
    '@media (max-width: 768px)': {
      fontSize: '11px',
    },
  },
  alertsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  alertCard: {
    borderRadius: '8px',
    padding: '16px',
    '@media (max-width: 768px)': {
      padding: '12px',
    },
  },
  alertHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    '@media (max-width: 768px)': {
      gap: '8px',
    },
  },
  alertIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    flexShrink: 0,
    '@media (max-width: 768px)': {
      width: '28px',
      height: '28px',
      fontSize: '14px',
    },
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontWeight: '600',
    color: '#1e293b',
    margin: '0 0 4px 0',
    fontSize: '14px',
    '@media (max-width: 768px)': {
      fontSize: '13px',
    },
  },
  alertProduct: {
    fontWeight: '500',
    color: '#475569',
    margin: '0 0 4px 0',
    fontSize: '13px',
    '@media (max-width: 768px)': {
      fontSize: '12px',
    },
  },
  alertDescription: {
    margin: '0',
    fontSize: '12px',
    color: '#64748b',
    '@media (max-width: 768px)': {
      fontSize: '11px',
    },
  },
  noDataText: {
    color: '#94a3b8',
    fontSize: '14px',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '20px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '24px',
    width: '100%',
    maxWidth: '600px',
    maxHeight: '80vh',
    overflowY: 'auto',
    boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
    '@media (max-width: 768px)': {
      padding: '20px',
      maxWidth: '95%',
    },
  },
  modalHeader: {
    fontSize: '20px',
    fontWeight: 'bold',
    marginBottom: '16px',
    color: '#1e293b',
    '@media (max-width: 768px)': {
      fontSize: '18px',
    },
  },
  tableContainer: {
    overflowX: 'auto',
    marginBottom: '16px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '300px',
  },
  tableHeader: {
    backgroundColor: '#f1f5f9',
  },
  tableCell: {
    textAlign: 'left',
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
    fontSize: '14px',
    color: '#334155',
    '@media (max-width: 768px)': {
      padding: '10px 12px',
      fontSize: '13px',
    },
  },
  tableRow: {
    backgroundColor: '#fff',
    '&:hover': {
      backgroundColor: '#f8fafc',
    },
  },
  modalButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  cancelButton: {
    backgroundColor: '#ef4444',
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    '@media (max-width: 768px)': {
      padding: '8px 16px',
      fontSize: '13px',
      width: '100%',
    },
  },
};