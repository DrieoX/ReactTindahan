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

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Today's Sales
      const sales = await db.sales.where('sales_date').equals(today).toArray();
      let salesToday = 0;
      let recentSalesData = [];
      
      for (let sale of sales) {
        const items = await db.sale_items.where('sales_id').equals(sale.sales_id).toArray();
        const totalSale = items.reduce((sum, i) => sum + i.amount, 0);
        salesToday += totalSale;
        
        // Get product names for this sale
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

      // Total Products
      const totalProducts = await db.products.count();

      // Low Stock
      const lowStockItems = await db.inventory.filter(i => i.quantity <= i.threshold).toArray();
      const lowStock = lowStockItems.length;

      // Expired
      const expiredItems = await db.inventory.filter(i => i.expiration_date <= today).toArray();
      const expired = expiredItems.length;

      // Alerts
      const expAlerts = [];
      for (let i of expiredItems) {
        const product = await db.products.get(i.product_id);
        expAlerts.push({ ...i, type: 'expired', name: product?.name || 'Unknown' });
      }

      const lowAlerts = [];
      for (let i of lowStockItems) {
        const product = await db.products.get(i.product_id);
        lowAlerts.push({ ...i, type: 'low', name: product?.name || 'Unknown' });
      }

      setStats({ salesToday, totalProducts, lowStock, expired });
      setNotifications([...expAlerts, ...lowAlerts]);
      setRecentSales(recentSalesData.slice(0, 5)); // Get latest 5 sales
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    }
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
          <StatCard 
            label="Today's Sales" 
            value={`₱${stats.salesToday.toFixed(2)}`} 
            change="+12% from yesterday" 
            bg="#4f46e5" 
            text="#ffffff" 
          />
          <StatCard 
            label="Items Sold" 
            value={recentSales.reduce((total, sale) => total + sale.items, 0)} 
            change="+8% from yesterday" 
            bg="#0ea5e9" 
            text="#ffffff" 
          />
          <StatCard 
            label="Low Stock Items" 
            value={stats.lowStock} 
            change="+2 items need attention" 
            bg="#f59e0b" 
            text="#ffffff" 
          />
          <StatCard 
            label="Expiring Soon" 
            value={stats.expired} 
            change="+1 items need attention" 
            bg="#ef4444" 
            text="#ffffff" 
          />
        </div>

        {/* Recent Transactions and Alerts Side by Side */}
        <div style={styles.dashboardGrid}>
          {/* Recent Transactions Section */}
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

          {/* Alerts Section */}
          <div style={styles.alertsSection}>
            <h3 style={styles.sectionTitle}>Alerts & Notifications</h3>
            {notifications.length === 0 ? (
              <p style={styles.noDataText}>No alerts right now.</p>
            ) : (
              <div style={styles.alertsList}>
                {notifications.map((item, index) => (
                  <div key={index} style={{
                    ...styles.alertCard,
                    backgroundColor: item.type === 'expired' ? '#fef2f2' : '#fffbeb',
                    borderLeft: `4px solid ${item.type === 'expired' ? '#ef4444' : '#f59e0b'}`,
                  }}>
                    <div style={styles.alertHeader}>
                      <span style={{
                        ...styles.alertIcon,
                        backgroundColor: item.type === 'expired' ? '#ef4444' : '#f59e0b'
                      }}>
                        {item.type === 'expired' ? '⚠️' : '📉'}
                      </span>
                      <div>
                        <p style={styles.alertTitle}>
                          {item.type === 'expired' ? 'Product Expired' : 'Low Stock Alert'}
                        </p>
                        <p style={styles.alertProduct}>{item.name}</p>
                      </div>
                    </div>
                    <p style={styles.alertDescription}>
                      {item.type === 'expired'
                        ? `Expired on ${item.expiration_date}`
                        : `Only ${item.quantity} left in stock (Threshold: ${item.threshold})`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const StatCard = ({ label, value, change, bg, text }) => (
  <div style={{...styles.statCard, backgroundColor: bg, color: text}}>
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
  headerLeft: { 
    flex: 1, 
    minWidth: '200px',
  },
  pageTitle: { 
    fontSize: 'clamp(18px, 2vw, 24px)', 
    fontWeight: 'bold', 
    color: '#1e293b', 
    marginBottom: '4px',
  },
  pageSubtitle: { 
    fontSize: 'clamp(14px, 1.5vw, 16px)', 
    color: '#64748b',
  },
  userSection: { 
    display: 'flex', 
    alignItems: 'center', 
    gap: 'clamp(8px, 2vw, 20px)',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
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
    fontSize: 'clamp(14px, 1.5vw, 16px)',
  },
  welcomeTitle: {
    fontSize: '24px', 
    fontWeight: 'bold', 
    marginBottom: '4px', 
    color: '#1e293b'
  },
  welcomeSubtitle: {
    fontSize: '16px', 
    color: '#64748b', 
    marginBottom: '20px'
  },
  statCardsContainer: {
    display: 'flex', 
    flexWrap: 'wrap', 
    gap: '16px', 
    marginBottom: '30px'
  },
  statCard: {
    padding: '20px', 
    borderRadius: '12px', 
    flex: '1 1 200px', 
    minWidth: '200px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
  },
  statLabel: {
    fontSize: '14px', 
    opacity: 0.9, 
    marginBottom: '8px'
  },
  statValue: {
    fontSize: '24px', 
    fontWeight: 'bold', 
    marginBottom: '4px'
  },
  statChange: {
    fontSize: '12px', 
    opacity: 0.9
  },
  dashboardGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    marginBottom: '30px',
  },
  recentTransactions: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
    height: 'fit-content',
  },
  alertsSection: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
    height: 'fit-content',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '18px', 
    fontWeight: '600', 
    color: '#1e293b',
    marginBottom: '0',
  },
  viewAllButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#4f46e5',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  transactionCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '12px',
    position: 'relative',
  },
  transactionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px',
  },
  transactionStatus: {
    fontWeight: '500',
    color: '#1e293b',
  },
  transactionTime: {
    fontSize: '12px',
    color: '#64748b',
  },
  transactionProducts: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginBottom: '8px',
  },
  productName: {
    fontSize: '12px',
    backgroundColor: '#f1f5f9',
    padding: '2px 6px',
    borderRadius: '4px',
    color: '#475569',
  },
  moreItems: {
    fontSize: '12px',
    color: '#64748b',
  },
  transactionAmount: {
    fontWeight: '600',
    color: '#4f46e5',
    fontSize: '14px',
  },
  alertsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  alertCard: {
    borderRadius: '8px',
    padding: '16px',
  },
  alertHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
  },
  alertIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
  },
  alertTitle: {
    fontWeight: '600',
    color: '#1e293b',
    margin: '0',
    fontSize: '14px',
  },
  alertProduct: {
    fontWeight: '500',
    color: '#475569',
    margin: '0',
    fontSize: '13px',
  },
  alertDescription: {
    margin: '0',
    fontSize: '12px',
    color: '#64748b',
  },
  noDataText: {
    color: '#94a3b8', 
    fontSize: '14px',
    fontStyle: 'italic',
  },
};