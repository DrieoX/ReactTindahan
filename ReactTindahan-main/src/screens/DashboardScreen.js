import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { dataService } from '../services/DataService';

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
    totalSales: 0
  });
  const [notifications, setNotifications] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [expiredItems, setExpiredItems] = useState([]);
  const [showLowStockModal, setShowLowStockModal] = useState(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  // ✅ Log audit action
  const logAudit = async (action, details = {}) => {
    try {
      await dataService.add('backup', {
        user_id: user.user_id,
        backup_name: `AUDIT_${action}`,
        backup_type: 'audit',
        created_at: new Date().toISOString(),
        schema_version: '6',
        details: JSON.stringify(details)
      });
    } catch (error) {
      console.error('Failed to log audit:', error);
    }
  };

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      
      // ✅ Log dashboard view using backup table for audit
      await logAudit('VIEW_DASHBOARD', {
        page: 'dashboard',
        user_id: user.user_id,
        username: user.username
      });

      // ✅ Get dashboard stats from dataService
      const dashboardStats = await dataService.getDashboardStats();
      setStats(dashboardStats);

      const today = new Date().toISOString().split('T')[0];

      // ✅ Get today's sales
      const sales = await dataService.getSales(today);
      let recentSalesData = [];

      // ✅ Process sales to get details
      for (let sale of sales) {
        const items = await dataService.getSaleItems(sale.sales_id);
        const totalSale = items.reduce((sum, i) => sum + i.total_amount, 0);

        const productDetails = await Promise.all(
          items.map(async (item) => {
            try {
              const product = await dataService.getById('products', item.product_id);
              return product?.name || 'Unknown Product';
            } catch (error) {
              return 'Unknown Product';
            }
          })
        );

        recentSalesData.push({
          id: sale.sales_id,
          date: sale.sales_date,
          amount: totalSale,
          items: items.length,
          productNames: productDetails,
          user_id: sale.user_id
        });
      }

      // ✅ Get inventory with details for low stock and expired items
      const inventoryDetails = await dataService.getInventoryWithDetails();
      
      // ✅ Filter low stock items
      const lowStockItemsData = inventoryDetails
        .filter(i => i.quantity <= i.threshold)
        .map(i => ({
          name: i.product_name || 'Unknown Product',
          quantity: i.quantity,
          threshold: i.threshold,
          updated_at: i.updated_at
        }));

      // ✅ Filter expired and near-expiry items
      const todayDate = new Date();
      const nearExpiryThreshold = new Date();
      nearExpiryThreshold.setDate(todayDate.getDate() + 7);
      
      const expiredItemsData = [];
      
      for (let i of inventoryDetails) {
        if (!i.expiration_date) continue;
        const expDate = new Date(i.expiration_date);
        
        if (expDate < todayDate) {
          expiredItemsData.push({
            ...i,
            name: i.product_name || 'Unknown Product',
            type: 'expired',
            updated_at: i.updated_at
          });
        } else if (expDate <= nearExpiryThreshold) {
          expiredItemsData.push({
            ...i,
            name: i.product_name || 'Unknown Product',
            type: 'near-expiry',
            updated_at: i.updated_at
          });
        }
      }

      const expiredCount = expiredItemsData.filter(e => e.type === 'expired').length;

      // ✅ Update stats with accurate expired count
      setStats(prev => ({
        ...prev,
        expired: expiredCount
      }));

      // ✅ Set notifications
      const expAlerts = expiredItemsData.map(item => ({
        ...item,
        type: item.type,
      }));

      const lowAlerts = lowStockItemsData.map(i => ({
        ...i,
        type: 'low',
        name: i.name,
      }));

      setNotifications([...expAlerts, ...lowAlerts]);
      setRecentSales(recentSalesData.slice(0, 5));
      setLowStockItems(lowStockItemsData);
      setExpiredItems(expiredItemsData);
      
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
      
      // Try to get basic stats from dataService if detailed fetch fails
      try {
        const basicStats = await dataService.getDashboardStats();
        setStats(basicStats);
      } catch (fallbackError) {
        console.error('Fallback stats fetch failed:', fallbackError);
      }
      
      // ✅ Log error in backup table for audit
      await logAudit('DASHBOARD_ERROR', {
        error: err.message,
        user_id: user.user_id
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTotalProductsClick = async () => {
    // ✅ Log "View All Inventory" click using backup table
    await logAudit('CLICK_VIEW_INVENTORY', {
      action: 'view_all_inventory',
      user_id: user.user_id,
      username: user.username
    });
    
    // Acts as "clear filter" button – just reloads stats
    fetchDashboardStats();
  };

  const handleLowStockClick = async () => {
    // ✅ Log low stock modal view using backup table
    await logAudit('VIEW_LOW_STOCK', {
      action: 'open_low_stock_modal',
      low_stock_count: stats.lowStock,
      user_id: user.user_id
    });
    setShowLowStockModal(true);
  };

  const handleExpiredClick = async () => {
    // ✅ Log expired items modal view using backup table
    await logAudit('VIEW_EXPIRED_ITEMS', {
      action: 'open_expired_items_modal',
      expired_count: stats.expired,
      user_id: user.user_id
    });
    setShowExpiredModal(true);
  };

  const handleCloseLowStockModal = async () => {
    // ✅ Log low stock modal close using backup table
    await logAudit('CLOSE_LOW_STOCK_MODAL', {
      action: 'close_low_stock_modal',
      user_id: user.user_id
    });
    setShowLowStockModal(false);
  };

  const handleCloseExpiredModal = async () => {
    // ✅ Log expired items modal close using backup table
    await logAudit('CLOSE_EXPIRED_MODAL', {
      action: 'close_expired_items_modal',
      user_id: user.user_id
    });
    setShowExpiredModal(false);
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
      </div>

      {/* Main Content */}
      <div style={styles.mainContent}>
        <h2 style={styles.welcomeTitle}>
          Welcome back, {user?.username || 'User'}!
        </h2>
        <p style={styles.welcomeSubtitle}>
          Here's what's happening with your business today.
        </p>

        {loading ? (
          <div style={styles.loadingContainer}>
            <p>Loading dashboard data...</p>
          </div>
        ) : (
          <>
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
                  change="View daily report"
                  bg="#4f46e5"
                  text="#ffffff"
                />
              </div>
              <div onClick={handleLowStockClick} style={styles.statCardWrapper}>
                <StatCard
                  label="Low Stock Items"
                  value={stats.lowStock}
                  change={`${stats.lowStock} items need attention`}
                  bg="#f59e0b"
                  text="#ffffff"
                />
              </div>
              <div onClick={handleExpiredClick} style={styles.statCardWrapper}>
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
                              {sale.items} items • {sale.date}
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
          </>
        )}
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
                      <th style={styles.tableCell}>Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockItems.map((item, i) => (
                      <tr key={i} style={styles.tableRow}>
                        <td style={styles.tableCell}>{item.name}</td>
                        <td style={styles.tableCell}>{item.quantity}</td>
                        <td style={styles.tableCell}>{item.threshold}</td>
                        <td style={styles.tableCell}>
                          {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={styles.modalButtons}>
              <button style={styles.cancelButton} onClick={handleCloseLowStockModal}>
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
                      <th style={styles.tableCell}>Last Updated</th>
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
                        <td style={styles.tableCell}>
                          {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={styles.modalButtons}>
              <button style={styles.cancelButton} onClick={handleCloseExpiredModal}>
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
    backgroundColor: '#f9fafb',
    minHeight: '100vh',
    padding: '20px'
  },
  // Connection UI Styles
  connectionContainer: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '40px 20px'
  },
  connectionHeader: {
    textAlign: 'center',
    marginBottom: '30px'
  },
  connectionTitle: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: '10px'
  },
  connectionSubtitle: {
    fontSize: '16px',
    color: '#6b7280',
    lineHeight: '1.6'
  },
  connectionCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '30px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
  },
  connectionStatus: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    marginBottom: '25px',
    padding: '15px',
    backgroundColor: '#fef2f2',
    borderRadius: '8px'
  },
  statusDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    display: 'inline-block'
  },
  statusText: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#374151'
  },
  connectionActions: {
    display: 'flex',
    gap: '15px',
    justifyContent: 'center',
    marginBottom: '30px'
  },
  primaryButton: {
    padding: '14px 28px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  secondaryButton: {
    padding: '14px 28px',
    backgroundColor: '#6b7280',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  connectionHelp: {
    backgroundColor: '#f9fafb',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb'
  },
  helpList: {
    paddingLeft: '20px',
    lineHeight: '1.8',
    color: '#4b5563'
  },
  // Header connection badge
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '30px'
  },
  headerLeft: {
    flex: 1
  },
  connectionBadge: {
    padding: '10px 20px',
    borderRadius: '8px',
    color: 'white',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    minWidth: '200px'
  },
  connectionInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  connectionText: {
    fontSize: '14px',
    fontWeight: '500'
  },
  reconnectButton: {
    marginLeft: '10px',
    padding: '4px 12px',
    backgroundColor: 'rgba(255,255,255,0.2)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '4px',
    color: 'white',
    fontSize: '12px',
    cursor: 'pointer'
  },
  serverUrl: {
    marginTop: '6px',
    fontSize: '11px',
    opacity: '0.9'
  },
  // Loading container
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    gap: '20px'
  },
  connectionIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '20px'
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '5px solid #e5e7eb',
    borderTopColor: '#3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  // Modal styles for connection
  formGroup: {
    marginBottom: '20px'
  },
  input: {
    width: '100%',
    padding: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '16px',
    marginTop: '8px'
  },
  helpText: {
    color: '#6b7280',
    fontSize: '14px',
    marginTop: '5px',
    display: 'block'
  },
  connectButton: {
    padding: '12px 24px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    cursor: 'pointer',
    fontWeight: '600'
  },
  // Existing styles (keep these from your original)
  pageTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: '8px'
  },
  pageSubtitle: {
    fontSize: '14px',
    color: '#6b7280'
  },
  mainContent: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '30px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  welcomeTitle: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: '8px'
  },
  welcomeSubtitle: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '30px'
  },
  statCardsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '20px',
    marginBottom: '30px'
  },
  statCardWrapper: {
    cursor: 'pointer'
  },
  statCard: {
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  statLabel: {
    fontSize: '14px',
    opacity: '0.9',
    marginBottom: '8px'
  },
  statValue: {
    fontSize: '28px',
    fontWeight: 'bold',
    marginBottom: '8px'
  },
  statChange: {
    fontSize: '12px',
    opacity: '0.8'
  },
  dashboardGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '30px'
  },
  recentTransactions: {
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    padding: '24px'
  },
  alertsSection: {
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    padding: '24px'
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#111827'
  },
  viewAllButton: {
    padding: '8px 16px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer'
  },
  noDataText: {
    color: '#6b7280',
    textAlign: 'center',
    padding: '40px 0'
  },
  transactionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  transactionCard: {
    backgroundColor: 'white',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb'
  },
  transactionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px'
  },
  transactionHeaderLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  transactionStatus: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#059669'
  },
  transactionTime: {
    fontSize: '12px',
    color: '#6b7280'
  },
  transactionAmount: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#111827'
  },
  transactionProducts: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '8px'
  },
  productName: {
    fontSize: '12px',
    backgroundColor: '#e5e7eb',
    padding: '4px 8px',
    borderRadius: '4px',
    color: '#374151'
  },
  moreItems: {
    fontSize: '12px',
    color: '#6b7280',
    padding: '4px 8px'
  },
  alertsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  alertCard: {
    padding: '16px',
    borderRadius: '8px',
    transition: 'transform 0.2s'
  },
  alertHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px'
  },
  alertIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    flexShrink: 0
  },
  alertContent: {
    flex: 1
  },
  alertTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#111827',
    marginBottom: '4px'
  },
  alertProduct: {
    fontSize: '13px',
    color: '#374151',
    marginBottom: '4px'
  },
  alertDescription: {
    fontSize: '12px',
    color: '#6b7280'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '30px',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto'
  },
  modalHeader: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#111827',
    marginBottom: '20px'
  },
  tableContainer: {
    overflowX: 'auto',
    marginBottom: '20px'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  tableHeader: {
    backgroundColor: '#f9fafb',
    borderBottom: '2px solid #e5e7eb'
  },
  tableRow: {
    borderBottom: '1px solid #e5e7eb'
  },
  tableCell: {
    padding: '12px',
    textAlign: 'left',
    fontSize: '14px',
    color: '#374151'
  },
  modalButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px'
  },
  cancelButton: {
    padding: '10px 20px',
    backgroundColor: '#6b7280',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer'
  }
};

// Add CSS animation
const styleSheet = document.styleSheets[0];
styleSheet.insertRule(`
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`, styleSheet.cssRules.length);