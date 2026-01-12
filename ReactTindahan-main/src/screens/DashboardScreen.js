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
    totalSales: 0,
    inventoryValue: 0
  });
  const [notifications, setNotifications] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [expiredItems, setExpiredItems] = useState([]);
  const [showLowStockModal, setShowLowStockModal] = useState(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [costData, setCostData] = useState({});

  useEffect(() => {
    fetchDashboardStats();
    fetchProductCostData();
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

  // Helper function to normalize dates for comparison
  const normalizeDate = (dateInput) => {
    if (!dateInput) return null;
    
    if (dateInput instanceof Date) {
      return dateInput.toISOString().split('T')[0];
    }
    
    if (typeof dateInput === 'string') {
      if (dateInput.includes('T')) {
        return dateInput.split('T')[0];
      }
      if (dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateInput;
      }
      try {
        const date = new Date(dateInput);
        return date.toISOString().split('T')[0];
      } catch (e) {
        console.error('Error parsing date:', dateInput, e);
        return null;
      }
    }
    
    return null;
  };

  // Fetch product cost data for income calculation
  const fetchProductCostData = async () => {
    try {
      const resupplyItems = await dataService.getAll('resupplied_items');
      const stockCardItems = await dataService.getAll('stock_card');
      
      const costMap = {};
      
      resupplyItems
        .filter(item => item && item.resupply_date)
        .sort((a, b) => new Date(b.resupply_date) - new Date(a.resupply_date))
        .forEach(item => {
          if (item.product_id && item.unit_cost) {
            if (!costMap[item.product_id] || new Date(item.resupply_date) > new Date(costMap[item.product_id].date)) {
              costMap[item.product_id] = {
                cost: item.unit_cost,
                date: item.resupply_date
              };
            }
          }
        });
      
      stockCardItems
        .filter(item => item && item.transaction_type === 'RESUPPLY')
        .sort((a, b) => new Date(b.created_at || b.transaction_date) - new Date(a.created_at || a.transaction_date))
        .forEach(item => {
          if (item.product_id && item.unit_cost && !costMap[item.product_id]) {
            costMap[item.product_id] = {
              cost: item.unit_cost,
              date: item.created_at || item.transaction_date || new Date().toISOString()
            };
          }
        });
      
      setCostData(costMap);
    } catch (err) {
      console.error("Error fetching cost data:", err);
    }
  };

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      
      await logAudit('VIEW_DASHBOARD', {
        page: 'dashboard',
        user_id: user.user_id,
        username: user.username
      });

      // Get all data needed
      const sales = await dataService.getSales();
      const products = await dataService.getAll('products');
      const inventoryRecords = await dataService.getAll('inventory');
      const today = new Date().toISOString().split('T')[0];

      // Calculate inventory value
      let inventoryValue = 0;
      let totalProducts = 0;
      let lowStockCount = 0;
      let expiredCount = 0;
      let nearExpiryCount = 0;

      // Process inventory for stats
      const inventoryDetails = products.map((p) => {
        const invRecord = inventoryRecords.find(inv => inv.product_id === p.product_id);
        const invQuantity = invRecord ? invRecord.quantity : 0;
        const threshold = invRecord?.threshold || p.threshold || 5;
        
        // Calculate inventory value
        inventoryValue += (p.unit_price || 0) * invQuantity;
        totalProducts++;
        
        // Check low stock
        if (invQuantity <= threshold) {
          lowStockCount++;
        }
        
        // Check expiry (if applicable)
        const expiration_date = invRecord?.expiration_date || p.expiration_date;
        if (expiration_date) {
          const expDate = new Date(expiration_date);
          const todayDate = new Date();
          todayDate.setHours(0, 0, 0, 0);
          
          if (expDate < todayDate) {
            expiredCount++;
          } else if (expDate <= new Date(todayDate.getTime() + 7 * 24 * 60 * 60 * 1000)) {
            nearExpiryCount++;
          }
        }
        
        return {
          ...p,
          quantity: invQuantity,
          threshold: threshold,
          expiration_date: expiration_date
        };
      });

      // Filter today's sales
      const todaySales = sales.filter(sale => {
        if (!sale.sales_date) return false;
        const saleDateNormalized = normalizeDate(sale.sales_date);
        return saleDateNormalized === today;
      });

      // Process today's sales with income calculation (similar to ReportsScreen)
      const recentSalesData = [];
      let totalSalesToday = 0;
      let totalCostToday = 0;
      let totalIncomeToday = 0;

      for (let sale of todaySales) {
        try {
          const items = await dataService.getSaleItems(sale.sales_id);
          const products = await dataService.getAll('products');
          
          // Calculate sale totals with cost data
          let saleTotal = 0;
          let saleCost = 0;
          const saleItems = [];
          
          items.forEach(item => {
            const product = products.find(p => p.product_id === item.product_id);
            const productName = product?.name || 'Unknown Product';
            const sellingPrice = item.unit_price || item.amount || product?.unit_price || 0;
            const costPrice = costData[item.product_id]?.cost || 0;
            const quantity = item.quantity || 0;
            const revenue = sellingPrice * quantity;
            const cost = costPrice * quantity;
            const income = revenue - cost;
            
            saleTotal += revenue;
            saleCost += cost;
            
            saleItems.push({
              name: productName,
              quantity: quantity,
              unit_price: sellingPrice,
              unit_cost: costPrice,
              income: income
            });
          });
          
          const saleIncome = saleTotal - saleCost;
          totalSalesToday += saleTotal;
          totalCostToday += saleCost;
          totalIncomeToday += saleIncome;
          
          recentSalesData.push({
            id: sale.sales_id,
            date: sale.sales_date,
            time: sale.created_at || sale.sales_date,
            amount: saleTotal,
            cost: saleCost,
            income: saleIncome,
            items: items.length,
            productNames: saleItems.map(item => item.name),
            saleItems: saleItems,
            user_id: sale.user_id,
            created_by: sale.created_by || 'Unknown'
          });
        } catch (error) {
          console.error('Error processing sale:', error);
        }
      }

      // Get low stock items for notifications
      const lowStockItemsData = inventoryDetails
        .filter(i => i.quantity <= i.threshold)
        .map(i => ({
          id: i.product_id,
          name: i.name || 'Unknown Product',
          quantity: i.quantity,
          threshold: i.threshold,
          updated_at: i.updated_at
        }));

      // Get expired and near-expiry items for notifications
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      const nearExpiryThreshold = new Date();
      nearExpiryThreshold.setDate(todayDate.getDate() + 7);
      
      const expiredItemsData = [];
      
      for (let i of inventoryDetails) {
        if (!i.expiration_date) continue;
        
        try {
          const expDate = new Date(i.expiration_date);
          expDate.setHours(0, 0, 0, 0);
          
          if (expDate < todayDate) {
            expiredItemsData.push({
              id: i.product_id,
              name: i.name || 'Unknown Product',
              expiration_date: i.expiration_date,
              quantity: i.quantity,
              type: 'expired',
              updated_at: i.updated_at
            });
          } else if (expDate <= nearExpiryThreshold) {
            expiredItemsData.push({
              id: i.product_id,
              name: i.name || 'Unknown Product',
              expiration_date: i.expiration_date,
              quantity: i.quantity,
              type: 'near-expiry',
              updated_at: i.updated_at
            });
          }
        } catch (error) {
          console.error('Error parsing expiration date:', i.expiration_date, error);
        }
      }

      // Update stats
      setStats({
        salesToday: totalSalesToday,
        totalProducts: totalProducts,
        lowStock: lowStockCount,
        expired: expiredCount + nearExpiryCount,
        totalSales: todaySales.length,
        inventoryValue: inventoryValue
      });

      // Set notifications
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
      setRecentSales(recentSalesData.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 5));
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
      
      await logAudit('DASHBOARD_ERROR', {
        error: err.message,
        user_id: user.user_id
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTotalProductsClick = async () => {
    await logAudit('CLICK_VIEW_INVENTORY', {
      action: 'view_all_inventory',
      user_id: user.user_id,
      username: user.username
    });
    
    fetchDashboardStats();
  };

  const handleLowStockClick = async () => {
    await logAudit('VIEW_LOW_STOCK', {
      action: 'open_low_stock_modal',
      low_stock_count: stats.lowStock,
      user_id: user.user_id
    });
    setShowLowStockModal(true);
  };

  const handleExpiredClick = async () => {
    await logAudit('VIEW_EXPIRED_ITEMS', {
      action: 'open_expired_items_modal',
      expired_count: stats.expired,
      user_id: user.user_id
    });
    setShowExpiredModal(true);
  };

  const handleCloseLowStockModal = async () => {
    await logAudit('CLOSE_LOW_STOCK_MODAL', {
      action: 'close_low_stock_modal',
      user_id: user.user_id
    });
    setShowLowStockModal(false);
  };

  const handleCloseExpiredModal = async () => {
    await logAudit('CLOSE_EXPIRED_MODAL', {
      action: 'close_expired_items_modal',
      user_id: user.user_id
    });
    setShowExpiredModal(false);
  };

  // Format currency
  const formatCurrency = (amount) => {
    return `₱${parseFloat(amount).toFixed(2)}`;
  };

  // Get profit margin color
  const getProfitMarginColor = (income, revenue) => {
    if (revenue === 0) return '#6b7280';
    const margin = (income / revenue) * 100;
    return margin >= 20 ? '#10b981' : margin >= 10 ? '#f59e0b' : '#ef4444';
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
                  value={formatCurrency(stats.salesToday)}
                  change={`${stats.totalSales} transactions`}
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
              {/* Today's Transactions - Enhanced with Income Calculation */}
              <div style={styles.recentTransactions}>
                <div style={styles.sectionHeader}>
                  <h3 style={styles.sectionTitle}>Today's Transactions with Income</h3>
                  <button style={styles.viewAllButton} onClick={fetchDashboardStats}>
                    Refresh
                  </button>
                </div>

                {recentSales.length === 0 ? (
                  <p style={styles.noDataText}>No transactions today</p>
                ) : (
                  <div style={styles.transactionsList}>
                    {recentSales.map((sale, index) => {
                      const profitMargin = sale.amount > 0 ? (sale.income / sale.amount) * 100 : 0;
                      const marginColor = getProfitMarginColor(sale.income, sale.amount);
                      
                      return (
                        <div key={index} style={styles.transactionCard}>
                          <div style={styles.transactionHeader}>
                            <div style={styles.transactionHeaderLeft}>
                              <span style={styles.transactionStatus}>Sale Completed</span>
                              <span style={styles.transactionTime}>
                                {sale.items} items • {new Date(sale.time).toLocaleTimeString()}
                              </span>
                              <span style={styles.transactionCreator}>
                                By: {sale.created_by}
                              </span>
                            </div>
                            <div style={styles.transactionAmounts}>
                              <span style={styles.transactionAmount}>{formatCurrency(sale.amount)}</span>
                              <span style={{...styles.transactionIncome, color: sale.income >= 0 ? '#10b981' : '#ef4444'}}>
                                {sale.income >= 0 ? '+' : ''}{formatCurrency(sale.income)}
                              </span>
                              <span style={{...styles.transactionMargin, color: marginColor}}>
                                ({profitMargin.toFixed(1)}%)
                              </span>
                            </div>
                          </div>
                          
                          <div style={styles.transactionProducts}>
                            {sale.saleItems?.slice(0, 3).map((item, i) => (
                              <div key={i} style={styles.productDetail}>
                                <span style={styles.productName}>{item.name}</span>
                                <span style={styles.productInfo}>
                                  {item.quantity} × {formatCurrency(item.unit_price)}
                                </span>
                                <span style={{
                                  ...styles.productIncome,
                                  color: item.income >= 0 ? '#10b981' : '#ef4444'
                                }}>
                                  {item.income >= 0 ? '+' : ''}{formatCurrency(item.income)}
                                </span>
                              </div>
                            ))}
                            {sale.saleItems?.length > 3 && (
                              <div style={styles.moreItemsContainer}>
                                <span style={styles.moreItems}>
                                  +{sale.saleItems.length - 3} more items
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Today's Summary */}
                    {recentSales.length > 0 && (
                      <div style={styles.dailySummary}>
                        <div style={styles.summaryHeader}>
                          <span style={styles.summaryTitle}>Today's Summary</span>
                          <span style={styles.summaryCount}>{recentSales.length} transactions</span>
                        </div>
                        <div style={styles.summaryStats}>
                          <div style={styles.summaryStat}>
                            <span style={styles.summaryLabel}>Total Revenue:</span>
                            <span style={styles.summaryValue}>{formatCurrency(recentSales.reduce((sum, s) => sum + s.amount, 0))}</span>
                          </div>
                          <div style={styles.summaryStat}>
                            <span style={styles.summaryLabel}>Total Cost:</span>
                            <span style={{...styles.summaryValue, color: '#ef4444'}}>
                              {formatCurrency(recentSales.reduce((sum, s) => sum + s.cost, 0))}
                            </span>
                          </div>
                          <div style={styles.summaryStat}>
                            <span style={styles.summaryLabel}>Net Income:</span>
                            <span style={{
                              ...styles.summaryValue,
                              color: recentSales.reduce((sum, s) => sum + s.income, 0) >= 0 ? '#10b981' : '#ef4444'
                            }}>
                              {formatCurrency(recentSales.reduce((sum, s) => sum + s.income, 0))}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Alerts & Notifications */}
              <div style={styles.alertsSection}>
                <div style={styles.sectionHeader}>
                  <h3 style={styles.sectionTitle}>Alerts & Notifications</h3>
                  {notifications.length > 0 && (
                    <span style={styles.alertCountBadge}>{notifications.length}</span>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div style={styles.noAlertsContainer}>
                    <div style={styles.noAlertsIcon}>✅</div>
                    <p style={styles.noAlertsText}>No alerts right now.</p>
                    <p style={styles.noAlertsSubtext}>Everything is running smoothly!</p>
                  </div>
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
                        onClick={() => {
                          if (item.type === 'low' || item.type === 'expired' || item.type === 'near-expiry') {
                            item.type === 'low' ? handleLowStockClick() : handleExpiredClick();
                          }
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
                            <div style={styles.alertTitleRow}>
                              <p style={styles.alertTitle}>
                                {item.type === 'expired'
                                  ? 'Product Expired'
                                  : item.type === 'near-expiry'
                                  ? 'Near Expiry Alert'
                                  : 'Low Stock Alert'}
                              </p>
                              <span style={styles.alertTime}>
                                {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : 'Today'}
                              </span>
                            </div>
                            <p style={styles.alertProduct}>{item.name}</p>
                            <p style={styles.alertDescription}>
                              {item.type === 'expired'
                                ? `Expired on ${item.expiration_date} • ${item.quantity} units in stock`
                                : item.type === 'near-expiry'
                                ? `Expiring on ${item.expiration_date} • ${item.quantity} units in stock`
                                : `Only ${item.quantity} left in stock (Threshold: ${item.threshold})`}
                            </p>
                            <div style={styles.alertAction}>
                              <span style={styles.alertActionText}>
                                Click to view details →
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {/* Inventory Value Summary */}
                    <div style={styles.inventoryValueCard}>
                      <div style={styles.inventoryValueHeader}>
                        <span style={styles.inventoryValueIcon}>💰</span>
                        <div>
                          <p style={styles.inventoryValueTitle}>Inventory Value</p>
                          <p style={styles.inventoryValueAmount}>{formatCurrency(stats.inventoryValue)}</p>
                        </div>
                      </div>
                      <p style={styles.inventoryValueSubtext}>
                        Total value of {stats.totalProducts} products in stock
                      </p>
                    </div>
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
            <div style={styles.modalHeaderRow}>
              <h2 style={styles.modalHeader}>Low Stock Items</h2>
              <span style={styles.modalBadge}>{lowStockItems.length} items</span>
            </div>
            {lowStockItems.length === 0 ? (
              <div style={styles.emptyModalContent}>
                <div style={styles.emptyModalIcon}>✅</div>
                <p style={styles.noDataText}>No items are low in stock.</p>
                <p style={styles.emptyModalSubtext}>All products have sufficient stock levels.</p>
              </div>
            ) : (
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeader}>
                      <th style={styles.tableCell}>Product</th>
                      <th style={styles.tableCell}>Current Stock</th>
                      <th style={styles.tableCell}>Threshold</th>
                      <th style={styles.tableCell}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockItems.map((item, i) => (
                      <tr key={i} style={styles.tableRow}>
                        <td style={styles.tableCell}>
                          <strong>{item.name}</strong>
                        </td>
                        <td style={{
                          ...styles.tableCell,
                          color: item.quantity === 0 ? '#ef4444' : '#f59e0b',
                          fontWeight: '600'
                        }}>
                          {item.quantity}
                        </td>
                        <td style={styles.tableCell}>{item.threshold}</td>
                        <td style={styles.tableCell}>
                          <span style={{
                            ...styles.statusBadge,
                            backgroundColor: item.quantity === 0 ? '#fef2f2' : '#fffbeb',
                            color: item.quantity === 0 ? '#dc2626' : '#d97706',
                            borderColor: item.quantity === 0 ? '#fecaca' : '#fde68a'
                          }}>
                            {item.quantity === 0 ? 'Out of Stock' : 'Low Stock'}
                          </span>
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
            <div style={styles.modalHeaderRow}>
              <h2 style={styles.modalHeader}>Expiring / Expired Items</h2>
              <span style={styles.modalBadge}>{expiredItems.length} items</span>
            </div>
            {expiredItems.length === 0 ? (
              <div style={styles.emptyModalContent}>
                <div style={styles.emptyModalIcon}>✅</div>
                <p style={styles.noDataText}>No expired or near expiry items.</p>
                <p style={styles.emptyModalSubtext}>All products have valid expiry dates.</p>
              </div>
            ) : (
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeader}>
                      <th style={styles.tableCell}>Product</th>
                      <th style={styles.tableCell}>Status</th>
                      <th style={styles.tableCell}>Expiry Date</th>
                      <th style={styles.tableCell}>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiredItems.map((item, i) => (
                      <tr key={i} style={{
                        ...styles.tableRow,
                        backgroundColor: item.type === 'expired' ? '#fef2f2' : '#fff7ed'
                      }}>
                        <td style={styles.tableCell}>
                          <strong>{item.name}</strong>
                        </td>
                        <td style={styles.tableCell}>
                          <span style={{
                            ...styles.statusBadge,
                            backgroundColor: item.type === 'expired' ? '#fef2f2' : '#fff7ed',
                            color: item.type === 'expired' ? '#dc2626' : '#ea580c',
                            borderColor: item.type === 'expired' ? '#fecaca' : '#fed7aa'
                          }}>
                            {item.type === 'expired' ? 'Expired' : 'Near Expiry'}
                          </span>
                        </td>
                        <td style={styles.tableCell}>{item.expiration_date}</td>
                        <td style={styles.tableCell}>{item.quantity} units</td>
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