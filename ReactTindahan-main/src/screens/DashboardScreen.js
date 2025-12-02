import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { useLocation } from 'react-router-dom';
import * as API from '../services/APIService';

export default function DashboardScreen({ userMode }) {
  const location = useLocation();

  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const savedMode = localStorage.getItem("userMode") || "client";

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
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchDashboardStats();
    
    // Refresh every 5 minutes
    const interval = setInterval(() => {
      fetchDashboardStats();
    }, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [mode]);

  const fetchDashboardStats = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      let sales = [];
      let inventory = [];
      let products = [];

      if (mode.toLowerCase() === 'server') {
        // --- Server mode: use IndexedDB ---
        console.log('Fetching dashboard data from IndexedDB...');
        
        // Get all products from products table
        products = await db.products.toArray();
        console.log('Products from db:', products.length);
        
        // Get inventory data
        inventory = await db.inventory.toArray();
        console.log('Inventory from db:', inventory.length);
        
        // Get today's sales
        sales = await db.sales.where('sales_date').equals(today).toArray();
        console.log('Today\'s sales:', sales.length);
        
      } else {
        // --- Client mode: use API ---
        console.log('Fetching dashboard data from API...');
        
        try {
          // Fetch inventory data which includes product info
          const apiInventory = await API.fetchInventory();
          console.log('API Inventory:', apiInventory);
          
          // Extract products from inventory
          products = apiInventory.map(item => ({
            product_id: item.product_id || item.id,
            id: item.product_id || item.id,
            name: item.name,
            sku: item.sku,
            unit_price: item.unit_price,
            category_id: item.category_id,
            base_unit: item.base_unit
          }));
          
          inventory = apiInventory.map(item => ({
            product_id: item.product_id || item.id,
            id: item.product_id || item.id,
            quantity: item.quantity || 0,
            threshold: item.threshold || 5,
            expiration_date: item.expiration_date,
            name: item.name
          }));
          
          // Fetch sales data
          const allSales = await API.fetchSales();
          sales = allSales.filter(sale => {
            const saleDate = sale.sales_date || sale.date;
            return saleDate === today;
          });
          
        } catch (err) {
          console.error('Error fetching API data:', err);
          // Fallback to empty arrays
          products = [];
          inventory = [];
          sales = [];
        }
      }

      console.log('Total products found:', products.length);
      console.log('Inventory items:', inventory.length);

      // --- Calculate Today's Sales ---
      let salesToday = 0;
      let recentSalesData = [];

      if (sales.length > 0) {
        for (let sale of sales) {
          let saleItems = [];
          let totalSale = 0;
          
          if (mode.toLowerCase() === 'server') {
            saleItems = await db.sale_items.where('sales_id').equals(sale.sales_id).toArray();
            totalSale = saleItems.reduce((sum, i) => sum + (i.amount || 0), 0);
          } else {
            // For API mode, try to fetch sale items or use embedded items
            if (sale.items) {
              saleItems = sale.items;
              totalSale = saleItems.reduce((sum, i) => sum + (i.amount || 0), 0);
            } else {
              // Fallback to total_amount if available
              totalSale = sale.total_amount || 0;
              saleItems = [{ product_id: 'N/A', amount: totalSale, quantity: 1 }];
            }
          }
          
          salesToday += totalSale;

          // Get product names for display
          const productDetails = await Promise.all(
            saleItems.map(async (item) => {
              if (mode.toLowerCase() === 'server') {
                const product = await db.products.get(item.product_id);
                return product?.name || `Product #${item.product_id}`;
              } else {
                const product = products.find(p => 
                  p.product_id === item.product_id || 
                  p.id === item.product_id
                );
                return product?.name || `Product #${item.product_id}`;
              }
            })
          );

          recentSalesData.push({
            id: sale.sales_id || sale.id,
            date: sale.sales_date || sale.date,
            time: sale.sales_time || sale.time || new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            amount: totalSale,
            items: saleItems.length,
            productNames: productDetails
          });
        }
      }

      // --- Total Products ---
      // Count unique products (from products table, not inventory)
      const totalProducts = products.length;
      console.log('Calculated total products:', totalProducts);

      // --- Low Stock Items ---
      const lowStockList = inventory
        .filter(item => {
          const quantity = item.quantity || 0;
          const threshold = item.threshold || 5;
          return quantity <= threshold;
        })
        .map(item => {
          const product = products.find(p => 
            p.product_id === item.product_id || 
            p.id === item.product_id ||
            p.id === item.id
          );
          return {
            name: product?.name || item.name || 'Unknown Product',
            quantity: item.quantity || 0,
            threshold: item.threshold || 5,
            id: item.product_id || item.id
          };
        });

      const lowStockCount = lowStockList.length;

      // --- Expired / Near Expiry Items ---
      const expiredList = [];
      const todayDate = new Date();
      const nearExpiryThreshold = new Date();
      nearExpiryThreshold.setDate(todayDate.getDate() + 7); // 7 days from now

      for (let item of inventory) {
        if (!item.expiration_date) continue;
        
        const expDate = new Date(item.expiration_date);
        const product = products.find(p => 
          p.product_id === item.product_id || 
          p.id === item.product_id
        );
        
        if (expDate < todayDate) {
          expiredList.push({ 
            ...item, 
            name: product?.name || item.name || 'Unknown Product',
            type: 'expired' 
          });
        } else if (expDate <= nearExpiryThreshold) {
          expiredList.push({ 
            ...item, 
            name: product?.name || item.name || 'Unknown Product',
            type: 'near-expiry' 
          });
        }
      }

      const expiredCount = expiredList.filter(e => e.type === 'expired').length;

      // --- Notifications ---
      const expAlerts = expiredList.map(item => ({ 
        ...item, 
        type: item.type,
        message: item.type === 'expired' ? 'Item has expired' : 'Item expiring soon'
      }));
      const lowAlerts = lowStockList.map(item => ({ 
        ...item, 
        type: 'low', 
        message: 'Low stock level' 
      }));

      // --- Update State ---
      setStats({ 
        salesToday, 
        totalProducts, 
        lowStock: lowStockCount, 
        expired: expiredCount 
      });
      setNotifications([...expAlerts, ...lowAlerts]);
      setRecentSales(recentSalesData.slice(0, 5));
      setLowStockItems(lowStockList);
      setExpiredItems(expiredList);
      setLastUpdated(new Date());

    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTotalProductsClick = () => {
    fetchDashboardStats();
  };
  
  const handleRefresh = () => {
    fetchDashboardStats();
  };
  
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };
  
  const formatTime = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  };

  return (
    <div style={styles.content}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.headerTitleSection}>
            <h2 style={styles.pageTitle}>Dashboard</h2>
            {lastUpdated && (
              <span style={styles.lastUpdated}>
                Last updated: {formatTime(lastUpdated)}
              </span>
            )}
          </div>
          <p style={styles.pageSubtitle}>
            Overview of your store's performance and inventory status
            <span style={styles.modeIndicator}> | Mode: {mode === 'server' ? 'Local Database' : 'API Server'}</span>
          </p>
        </div>
        <div style={styles.headerRight}>
          <button 
            onClick={handleRefresh}
            style={styles.refreshButton}
            title="Refresh dashboard"
          >
            🔄 Refresh
          </button>
          <div style={styles.userSection}>
            <div style={styles.userInfo}>
              <span style={styles.userName}>{user?.username || 'User'}</span>
              <span style={styles.userRole}>{user?.role || 'Staff'}</span>
            </div>
            <div style={styles.notificationBadge}>
              {notifications.length > 0 && (
                <span style={styles.notificationCount}>{notifications.length}</span>
              )}
              <span style={styles.notificationIcon}>🔔</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.mainContent}>
        <div style={styles.welcomeSection}>
          <h2 style={styles.welcomeTitle}>Welcome back, {user?.username || 'User'}! 👋</h2>
          <p style={styles.welcomeSubtitle}>Here's what's happening with your business today.</p>
        </div>

        {loading ? (
          <div style={styles.loadingContainer}>
            <div style={styles.loadingSpinner}></div>
            <p style={styles.loadingText}>Loading dashboard data...</p>
          </div>
        ) : (
          <>
            {/* Stat Cards */}
            <div style={styles.statCardsContainer}>
              <div 
                onClick={handleTotalProductsClick} 
                style={{ cursor: 'pointer', textDecoration: 'none' }}
              >
                <StatCard 
                  label="Total Products" 
                  value={stats.totalProducts} 
                  change={`${stats.totalProducts} items in inventory`} 
                  icon="📦"
                  bg="linear-gradient(135deg, #22c55e 0%, #16a34a 100%)"
                  text="#ffffff"
                />
              </div>
              
              <StatCard 
                label="Today's Sales" 
                value={formatCurrency(stats.salesToday)} 
                change={recentSales.length > 0 ? `${recentSales.length} transactions today` : "No sales today"} 
                icon="💰"
                bg="linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)"
                text="#ffffff"
              />
              
              <div 
                onClick={() => setShowLowStockModal(true)} 
                style={{ cursor: 'pointer', textDecoration: 'none' }}
              >
                <StatCard 
                  label="Low Stock Items" 
                  value={stats.lowStock} 
                  change={`${stats.lowStock > 0 ? `${stats.lowStock} items need attention` : 'All items well-stocked'}`} 
                  icon="⚠️"
                  bg="linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
                  text="#ffffff"
                />
              </div>
              
              <div 
                onClick={() => setShowExpiredModal(true)} 
                style={{ cursor: 'pointer', textDecoration: 'none' }}
              >
                <StatCard 
                  label="Expiring Soon" 
                  value={stats.expired} 
                  change={stats.expired > 0 ? `${stats.expired} items need review` : 'No expiry issues'} 
                  icon="🚨"
                  bg="linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                  text="#ffffff"
                />
              </div>
            </div>

            {/* Recent Activity & Alerts Sections */}
            <div style={styles.gridContainer}>
              {/* Recent Sales */}
              <div style={styles.sectionCard}>
                <div style={styles.sectionHeader}>
                  <h3 style={styles.sectionTitle}>Recent Sales</h3>
                  <span style={styles.sectionBadge}>{recentSales.length}</span>
                </div>
                {recentSales.length === 0 ? (
                  <div style={styles.emptySection}>
                    <div style={styles.emptyIcon}>🛒</div>
                    <p style={styles.emptyText}>No sales recorded today</p>
                    <p style={styles.emptySubtext}>Sales will appear here as they occur</p>
                  </div>
                ) : (
                  <div style={styles.salesList}>
                    {recentSales.map((sale, index) => (
                      <div key={sale.id || index} style={styles.saleItem}>
                        <div style={styles.saleIcon}>💰</div>
                        <div style={styles.saleDetails}>
                          <div style={styles.saleHeader}>
                            <span style={styles.saleTime}>{sale.time}</span>
                            <span style={styles.saleAmount}>{formatCurrency(sale.amount)}</span>
                          </div>
                          <div style={styles.saleProducts}>
                            {sale.productNames.slice(0, 2).join(', ')}
                            {sale.productNames.length > 2 && (
                              <span style={styles.moreItems}> +{sale.productNames.length - 2} more</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notifications */}
              <div style={styles.sectionCard}>
                <div style={styles.sectionHeader}>
                  <h3 style={styles.sectionTitle}>Notifications</h3>
                  {notifications.length > 0 && (
                    <span style={styles.notificationBadgeSmall}>{notifications.length}</span>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div style={styles.emptySection}>
                    <div style={styles.emptyIcon}>✅</div>
                    <p style={styles.emptyText}>No notifications</p>
                    <p style={styles.emptySubtext}>All systems are running smoothly</p>
                  </div>
                ) : (
                  <div style={styles.notificationsList}>
                    {notifications.slice(0, 5).map((notif, index) => (
                      <div key={index} style={{
                        ...styles.notificationItem,
                        borderLeftColor: notif.type === 'low' ? '#f59e0b' : 
                                       notif.type === 'expired' ? '#ef4444' : '#3b82f6'
                      }}>
                        <div style={styles.notificationIcon}>
                          {notif.type === 'low' ? '⚠️' : notif.type === 'expired' ? '🚨' : 'ℹ️'}
                        </div>
                        <div style={styles.notificationContent}>
                          <p style={styles.notificationTitle}>{notif.name}</p>
                          <p style={styles.notificationMessage}>{notif.message}</p>
                          {notif.type === 'low' && (
                            <p style={styles.notificationDetail}>
                              Stock: {notif.quantity} / Threshold: {notif.threshold}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Low Stock Modal */}
        {showLowStockModal && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalContainer}>
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>Low Stock Items</h2>
                <button 
                  onClick={() => setShowLowStockModal(false)} 
                  style={styles.closeButton}
                >
                  ✕
                </button>
              </div>
              {lowStockItems.length === 0 ? (
                <div style={styles.emptyModalContent}>
                  <div style={styles.emptyModalIcon}>✅</div>
                  <p style={styles.emptyModalText}>No items are low in stock.</p>
                </div>
              ) : (
                <div style={styles.modalContent}>
                  <p style={styles.modalDescription}>
                    {lowStockItems.length} item(s) below or at reorder threshold
                  </p>
                  <div style={styles.tableContainer}>
                    <table style={styles.table}>
                      <thead>
                        <tr style={styles.tableHeader}>
                          <th style={styles.tableCellHeader}>Product</th>
                          <th style={styles.tableCellHeader}>Current Stock</th>
                          <th style={styles.tableCellHeader}>Reorder Level</th>
                          <th style={styles.tableCellHeader}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lowStockItems.map((item, i) => (
                          <tr key={i} style={styles.tableRow}>
                            <td style={styles.tableCell}>{item.name}</td>
                            <td style={styles.tableCell}>
                              <span style={{
                                color: item.quantity === 0 ? '#ef4444' : '#f59e0b',
                                fontWeight: '600'
                              }}>
                                {item.quantity}
                              </span>
                            </td>
                            <td style={styles.tableCell}>{item.threshold}</td>
                            <td style={styles.tableCell}>
                              <span style={styles.statusBadge}>
                                {item.quantity === 0 ? 'Out of Stock' : 'Low Stock'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div style={styles.modalFooter}>
                <button 
                  style={styles.primaryButton} 
                  onClick={() => setShowLowStockModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Expired/Near Expiry Modal */}
        {showExpiredModal && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalContainer}>
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>Expiring / Expired Items</h2>
                <button 
                  onClick={() => setShowExpiredModal(false)} 
                  style={styles.closeButton}
                >
                  ✕
                </button>
              </div>
              {expiredItems.length === 0 ? (
                <div style={styles.emptyModalContent}>
                  <div style={styles.emptyModalIcon}>✅</div>
                  <p style={styles.emptyModalText}>No expired or near expiry items.</p>
                </div>
              ) : (
                <div style={styles.modalContent}>
                  <p style={styles.modalDescription}>
                    {expiredItems.length} item(s) expiring soon or already expired
                  </p>
                  <div style={styles.tableContainer}>
                    <table style={styles.table}>
                      <thead>
                        <tr style={styles.tableHeader}>
                          <th style={styles.tableCellHeader}>Product</th>
                          <th style={styles.tableCellHeader}>Expiry Date</th>
                          <th style={styles.tableCellHeader}>Days Left</th>
                          <th style={styles.tableCellHeader}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expiredItems.map((item, i) => {
                          const expDate = new Date(item.expiration_date);
                          const today = new Date();
                          const daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
                          
                          return (
                            <tr key={i} style={styles.tableRow}>
                              <td style={styles.tableCell}>{item.name}</td>
                              <td style={styles.tableCell}>{item.expiration_date}</td>
                              <td style={styles.tableCell}>
                                <span style={{
                                  color: daysLeft < 0 ? '#ef4444' : 
                                         daysLeft <= 3 ? '#f59e0b' : '#22c55e',
                                  fontWeight: '600'
                                }}>
                                  {daysLeft < 0 ? 'Expired' : `${daysLeft} days`}
                                </span>
                              </td>
                              <td style={styles.tableCell}>
                                <span style={{
                                  ...styles.statusBadge,
                                  backgroundColor: item.type === 'expired' ? '#fee2e2' : '#fef3c7',
                                  color: item.type === 'expired' ? '#dc2626' : '#d97706'
                                }}>
                                  {item.type === 'expired' ? 'Expired' : 'Near Expiry'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div style={styles.modalFooter}>
                <button 
                  style={styles.primaryButton} 
                  onClick={() => setShowExpiredModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const StatCard = ({ label, value, change, icon, bg, text }) => (
  <div style={{ ...styles.statCard, background: bg, color: text }}>
    <div style={styles.statCardHeader}>
      <span style={styles.statIcon}>{icon}</span>
      <span style={styles.statLabel}>{label}</span>
    </div>
    <p style={styles.statValue}>{value}</p>
    <p style={styles.statChange}>{change}</p>
  </div>
);

const styles = {
  content: {
    flex: 1,
    backgroundColor: '#f8fafc',
    minHeight: '100vh',
    overflowX: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 30px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitleSection: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
    marginBottom: '4px',
  },
  pageTitle: {
    fontSize: '24px',
    fontWeight: '800',
    color: '#1e293b',
    margin: '0',
    letterSpacing: '-0.5px',
  },
  lastUpdated: {
    fontSize: '12px',
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    padding: '4px 8px',
    borderRadius: '12px',
    fontWeight: '500',
  },
  pageSubtitle: {
    fontSize: '14px',
    color: '#64748b',
    margin: '0',
    lineHeight: '1.5',
  },
  modeIndicator: {
    fontWeight: '600',
    color: '#4f46e5',
    marginLeft: '4px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  refreshButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#f1f5f9',
    color: '#475569',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  userSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  userName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1e293b',
  },
  userRole: {
    fontSize: '12px',
    color: '#64748b',
  },
  notificationBadge: {
    position: 'relative',
    cursor: 'pointer',
  },
  notificationIcon: {
    fontSize: '20px',
    color: '#4b5563',
  },
  notificationCount: {
    position: 'absolute',
    top: '-8px',
    right: '-8px',
    backgroundColor: '#ef4444',
    color: 'white',
    fontSize: '10px',
    fontWeight: 'bold',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainContent: {
    padding: '30px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  welcomeSection: {
    marginBottom: '32px',
  },
  welcomeTitle: {
    fontSize: '32px',
    fontWeight: '800',
    color: '#1e293b',
    margin: '0 0 ',
  },
  welcomeSubtitle: {
    fontSize: '16px',
    color: '#64748b',
    margin: '0',
    lineHeight: '1.5',
  },
  statCardsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '20px',
    marginBottom: '40px',
  },
  statCard: {
    padding: '24px',
    borderRadius: '16px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.1)',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    cursor: 'pointer',
  },
  statCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  statIcon: {
    fontSize: '24px',
  },
  statLabel: {
    fontSize: '14px',
    fontWeight: '600',
    opacity: '0.9',
    letterSpacing: '0.5px',
  },
  statValue: {
    fontSize: '32px',
    fontWeight: '800',
    margin: '0 0 8px 0',
    lineHeight: '1',
  },
  statChange: {
    fontSize: '12px',
    opacity: '0.9',
    margin: '0',
  },
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
    gap: '24px',
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1e293b',
    margin: '0',
  },
  sectionBadge: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    fontSize: '12px',
    fontWeight: '600',
    padding: '4px 8px',
    borderRadius: '12px',
    minWidth: '24px',
    textAlign: 'center',
  },
  notificationBadgeSmall: {
    backgroundColor: '#ef4444',
    color: 'white',
    fontSize: '12px',
    fontWeight: '600',
    padding: '4px 8px',
    borderRadius: '12px',
    minWidth: '24px',
    textAlign: 'center',
  },
  salesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  saleItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: '#f8fafc',
    transition: 'background-color 0.2s ease',
  },
  saleIcon: {
    fontSize: '20px',
    color: '#4f46e5',
  },
  saleDetails: {
    flex: 1,
  },
  saleHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  saleTime: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#475569',
  },
  saleAmount: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#4f46e5',
  },
  saleProducts: {
    fontSize: '13px',
    color: '#64748b',
    lineHeight: '1.4',
  },
  moreItems: {
    color: '#94a3b8',
    fontSize: '12px',
  },
  notificationsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  notificationItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: '#f8fafc',
    borderLeft: '4px solid',
    transition: 'background-color 0.2s ease',
  },
  notificationIcon: {
    fontSize: '20px',
    flexShrink: '0',
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1e293b',
    margin: '0 0 4px 0',
  },
  notificationMessage: {
    fontSize: '13px',
    color: '#64748b',
    margin: '0 0 4px 0',
  },
  notificationDetail: {
    fontSize: '12px',
    color: '#94a3b8',
    margin: '0',
  },
  emptySection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: '48px',
    color: '#cbd5e1',
    marginBottom: '16px',
  },
  emptyText: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#64748b',
    margin: '0 0 4px 0',
  },
  emptySubtext: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: '0',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #4f46e5',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  },
  loadingText: {
    fontSize: '16px',
    color: '#64748b',
    margin: '0',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(2px)',
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '0',
    width: '90%',
    maxWidth: '800px',
    maxHeight: '90vh',
    overflow: 'hidden',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px 24px 16px',
    borderBottom: '1px solid #e2e8f0',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1e293b',
    margin: '0',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    color: '#64748b',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    transition: 'background-color 0.2s ease',
  },
  modalContent: {
    padding: '24px',
  },
  modalDescription: {
    fontSize: '14px',
    color: '#64748b',
    margin: '0 0 20px 0',
  },
  tableContainer: {
    overflowX: 'auto',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeader: {
    backgroundColor: '#f8fafc',
  },
  tableCellHeader: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: '600',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid #e2e8f0',
  },
  tableRow: {
    borderBottom: '1px solid #e2e8f0',
    transition: 'background-color 0.2s ease',
  },
  tableCell: {
    padding: '16px',
    textAlign: 'left',
    fontSize: '14px',
    color: '#334155',
    verticalAlign: 'middle',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
    backgroundColor: '#f1f5f9',
    color: '#475569',
  },
  emptyModalContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 24px',
  },
  emptyModalIcon: {
    fontSize: '48px',
    color: '#22c55e',
    marginBottom: '16px',
  },
  emptyModalText: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#64748b',
    margin: '0',
  },
  modalFooter: {
    padding: '16px 24px',
    borderTop: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
    color: '#ffffff',
    border: 'none',
    padding: '10px 24px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  '@keyframes spin': {
    '0%': { transform: 'rotate(0deg)' },
    '100%': { transform: 'rotate(360deg)' },
  },
};

// Add CSS animation for spinner
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);