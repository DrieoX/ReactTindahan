import React, { useState, useEffect } from 'react';
import { db } from '../db';
import MainLayout from '../components/MainLayout';
import { useLocation } from 'react-router-dom';

export default function DashboardScreen({ userMode }) {
  const location = useLocation();

  // Load from localStorage as fallback
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

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Today's Sales
      const sales = await db.sales.where('sales_date').equals(today).toArray();
      let salesToday = 0;
      for (let sale of sales) {
        const items = await db.sale_items.where('sales_id').equals(sale.sales_id).toArray();
        salesToday += items.reduce((sum, i) => sum + i.amount, 0);
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
        expAlerts.push({
          ...i,
          type: 'expired',
          name: product?.name || 'Unknown',
        });
      }

      const lowAlerts = [];
      for (let i of lowStockItems) {
        const product = await db.products.get(i.product_id);
        lowAlerts.push({
          ...i,
          type: 'low',
          name: product?.name || 'Unknown',
        });
      }

      setStats({ salesToday, totalProducts, lowStock, expired });
      setNotifications([...expAlerts, ...lowAlerts]);
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    }
  };

  return (
    <MainLayout>
      <div style={styles.content}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <h2 style={styles.pageTitle}>Dashboard</h2>
            <p style={styles.pageSubtitle}>
              Overview of your store’s performance and inventory status
            </p>
          </div>
          <div style={styles.userSection}>
            <span>🔔</span>
            <span style={styles.headerText}>{user?.username || 'User'}</span>
            <span>🚪</span>
          </div>
        </div>

        {/* Main Content */}
        <div style={{ padding: '30px' }}>
          {/* Welcome Header */}
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '4px', color: '#1E293B' }}>
            Welcome back, {user?.username || 'User'}!
          </h2>
          <p style={{ fontSize: '16px', color: '#64748B', marginBottom: '20px' }}>
            Here's what's happening with your business today.
          </p>

          {/* Stat Cards */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: '30px' }}>
            <StatCard label="Today's Sales" value={`₱${stats.salesToday.toFixed(2)}`} bg="#d1fae5" text="#065f46" />
            <StatCard label="Total Products" value={stats.totalProducts} bg="#dbeafe" text="#1e40af" />
            <StatCard label="Low Stock" value={stats.lowStock} bg="#fef9c3" text="#854d0e" />
            <StatCard label="Expired Items" value={stats.expired} bg="#fee2e2" text="#991b1b" />
          </div>

          {/* Alerts & Notifications */}
          <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#1E293B' }}>
            Alerts & Notifications
          </h3>
          {notifications.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '14px' }}>No alerts right now.</p>
          ) : (
            notifications.map((item, index) => (
              <div
                key={index}
                style={{
                  padding: '16px',
                  marginBottom: '10px',
                  borderRadius: '12px',
                  backgroundColor: item.type === 'expired' ? '#fee2e2' : '#fef9c3',
                }}
              >
                <p style={{ fontWeight: '600', marginBottom: '4px' }}>
                  {item.type === 'expired' ? 'Product Expired:' : 'Low Stock Alert:'} {item.name}
                </p>
                <p style={{ fontSize: '13px', color: '#374151' }}>
                  {item.type === 'expired'
                    ? `Expired on ${item.expiration_date}`
                    : `Only ${item.quantity} left in stock`}
                </p>
              </div>
            ))
          )}

          {/* Quick Actions */}
          <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#1E293B' }}>
            Quick Actions
          </h3>
          <QuickAction label="Start New Sale" desc="Process customer transactions" bg="#dbeafe" />
          <QuickAction label="Manage Inventory" desc="Add or update products" bg="#d1fae5" />
          <QuickAction label="View Reports" desc="Analyze sales performance" bg="#ede9fe" />
        </div>
      </div>
    </MainLayout>
  );
}

/* Stat Card */
const StatCard = ({ label, value, bg, text }) => (
  <div style={{ backgroundColor: bg, padding: '16px', borderRadius: '12px', width: '48%', marginBottom: '12px' }}>
    <p style={{ color: '#374151', fontSize: '14px' }}>{label}</p>
    <p style={{ fontSize: '18px', fontWeight: 'bold', color: text }}>{value}</p>
  </div>
);

/* Quick Action Card */
const QuickAction = ({ label, desc, bg }) => (
  <div style={{ width: '100%', backgroundColor: bg, padding: '16px', borderRadius: '12px', margin: '6px 0' }}>
    <p style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>{label}</p>
    <p style={{ fontSize: '12px', color: '#374151' }}>{desc}</p>
  </div>
);

const styles = {
  content: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    minHeight: '100vh',
  },
  header: {
    height: '100px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 30px',
    borderBottom: '1px solid #E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  headerLeft: { flex: 1 },
  pageTitle: { fontSize: '24px', fontWeight: 'bold', color: '#1E293B', marginBottom: '4px' },
  pageSubtitle: { fontSize: '16px', color: '#64748B' },
  userSection: { display: 'flex', alignItems: 'center', gap: '20px' },
  headerText: { fontWeight: '600', color: '#111827', fontSize: '16px' },
};
