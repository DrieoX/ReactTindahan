import React, { useEffect, useState } from 'react';
import { db } from '../db';

export const addReport = async (report) => {
  await db.backup.add(report);

  await fetch('http://localhost:5000/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
};

export default function ReportsScreen({ userMode }) {
  const [report, setReport] = useState([]);
  const [resupplyReport, setResupplyReport] = useState([]);
  const [timeFilter, setTimeFilter] = useState('daily');
  const mode = userMode || 'client';

  useEffect(() => {
    fetchReport();
    fetchResupplyReport();
  }, [timeFilter]);

  const isToday = (dateStr) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isThisWeek = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
    const lastDay = new Date(now.setDate(now.getDate() - now.getDay() + 6));
    return date >= firstDay && date <= lastDay;
  };

  const isThisMonth = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  };

  const isThisYear = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    return date.getFullYear() === now.getFullYear();
  };

  const matchesFilter = (dateStr) => {
    switch (timeFilter) {
      case 'weekly':
        return isThisWeek(dateStr);
      case 'monthly':
        return isThisMonth(dateStr);
      case 'yearly':
        return isThisYear(dateStr);
      default:
        return isToday(dateStr);
    }
  };

  const fetchReport = async () => {
    try {
      const salesData = await db.sale_items.toArray();
      const sales = await db.sales.toArray();
      const products = await db.products.toArray();

      const filteredSales = sales.filter(s => matchesFilter(s.sales_date));

      const groupedSales = {};
      for (const item of salesData) {
        if (filteredSales.find(s => s.sales_id === item.sales_id)) {
          if (!groupedSales[item.sales_id]) groupedSales[item.sales_id] = [];
          groupedSales[item.sales_id].push(item);
        }
      }

      const enriched = Object.entries(groupedSales).map(([sales_id, items]) => {
        const sale = filteredSales.find(s => s.sales_id === parseInt(sales_id));
        const totalAmount = items.reduce((sum, i) => sum + (i.amount || 0), 0);
        const productDetails = items.map(i => {
          const product = products.find(p => p.product_id === i.product_id);
          return {
            name: product?.name || 'Unknown Product',
            quantity: i.quantity,
            amount: i.amount
          };
        });
        return {
          sales_date: sale?.sales_date,
          items: productDetails,
          totalAmount
        };
      }).sort((a, b) => new Date(b.sales_date) - new Date(a.sales_date));

      setReport(enriched);
    } catch (err) {
      console.error("Error fetching sales report:", err);
    }
  };

  const fetchResupplyReport = async () => {
    try {
      const resuppliedItems = await db.resupplied_items.toArray();
      const products = await db.products.toArray();
      const suppliers = await db.suppliers.toArray();

      const filteredResupplies = resuppliedItems.filter(i => matchesFilter(i.resupply_date));

      const groupedResupplies = {};
      for (const item of filteredResupplies) {
        const key = item.resupply_date;
        if (!groupedResupplies[key]) groupedResupplies[key] = [];
        groupedResupplies[key].push(item);
      }

      const enriched = Object.entries(groupedResupplies).map(([date, items]) => {
        const productDetails = items.map(i => {
          const product = products.find(p => p.product_id === i.product_id);
          const supplier = suppliers.find(s => s.supplier_id === i.supplier_id);
          return {
            product_name: product?.name || 'Unknown Product',
            supplier_name: supplier?.name || 'Unknown Supplier',
            quantity: i.quantity,
            unit_cost: i.unit_cost,
            expiration_date: i.expiration_date || 'N/A'
          };
        });
        const totalItems = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
        return {
          resupply_date: date,
          items: productDetails,
          totalItems
        };
      }).sort((a, b) => new Date(b.resupply_date) - new Date(a.resupply_date));

      setResupplyReport(enriched);
    } catch (err) {
      console.error("Error fetching resupply report:", err);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.headerSection}>
        <h1 style={styles.header}>SmartTindahan</h1>
        <h2 style={styles.subheader}>Sales Reports</h2>
        <p style={styles.description}>Track your sales performance and analytics</p>

        {/* 🔹 Enhanced Timeline Selector */}
        <div style={styles.filterContainer}>
          <label style={styles.filterLabel}>View By:</label>
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
      </div>

      <div style={styles.metricsContainer}>
        <div style={styles.metricCard}>
          <p style={styles.metricValue}>
            ₱{report.reduce((sum, r) => sum + (r.totalAmount || 0), 0).toFixed(2)}
          </p>
          <p style={styles.metricLabel}>Total Revenue</p>
          <p style={styles.metricSubLabel}>
            {timeFilter.charAt(0).toUpperCase() + timeFilter.slice(1)}
          </p>
        </div>

        <div style={styles.metricCard}>
          <p style={styles.metricValue}>
            ₱{report.length > 0 ? (report.reduce((sum, r) => sum + (r.totalAmount || 0), 0) / report.length).toFixed(2) : '0.00'}
          </p>
          <p style={styles.metricLabel}>Avg. Transaction</p>
          <p style={styles.metricSubLabel}>
            {timeFilter.charAt(0).toUpperCase() + timeFilter.slice(1)}
          </p>
        </div>

        <div style={styles.metricCard}>
          <p style={styles.metricValue}>{report.length}</p>
          <p style={styles.metricLabel}>Total Transactions</p>
          <p style={styles.metricSubLabel}>
            {timeFilter.charAt(0).toUpperCase() + timeFilter.slice(1)}
          </p>
        </div>
      </div>

      <div style={styles.contentContainer}>
        <div style={styles.mainSection}>
          <div style={styles.section}>
            <div style={styles.sectionHeaderContainer}>
              <h3 style={styles.sectionHeader}>Recent Sales</h3>
              <div style={styles.dateFilter}>
                <span style={styles.dateLabel}>Date Range:</span>
                <span style={styles.dateValue}>
                  {new Date().toLocaleDateString()}
                </span>
              </div>
            </div>
            
            {report.length === 0 ? (
              <div style={styles.placeholderCard}>
                <p style={styles.placeholderText}>No sales for this {timeFilter}</p>
                <p style={styles.placeholderSubText}>
                  Sales data will appear here once transactions are recorded
                </p>
              </div>
            ) : (
              <div style={styles.reportList}>
                {report.map((group, index) => (
                  <div key={index} style={styles.reportItem}>
                    <div style={styles.reportItemLeft}>
                      <p style={styles.reportDate}>{group.sales_date}</p>
                      {group.items.map((item, idx) => (
                        <p key={idx} style={styles.reportName}>
                          {item.name} — Qty: {item.quantity} — ₱{item.amount}
                        </p>
                      ))}
                    </div>
                    <div style={styles.reportItemRight}>
                      <p style={styles.reportAmount}>Total: ₱{group.totalAmount}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={styles.sideSection}>
          <div style={styles.section}>
            <h3 style={styles.sectionHeader}>Resupply History</h3>
            {resupplyReport.length === 0 ? (
              <div style={styles.placeholderCard}>
                <p style={styles.placeholderText}>No resupply data for this {timeFilter}</p>
                <p style={styles.placeholderSubText}>
                  Resupply history will appear here once items are restocked
                </p>
              </div>
            ) : (
              <div style={styles.reportList}>
                {resupplyReport.map((group, index) => (
                  <div key={index} style={styles.resupplyItem}>
                    <p style={styles.reportDate}>{group.resupply_date}</p>
                    {group.items.map((item, idx) => (
                      <p key={idx} style={styles.reportName}>
                        {item.product_name} — {item.supplier_name} — Qty: {item.quantity}, ₱{item.unit_cost}, Exp: {item.expiration_date}
                      </p>
                    ))}
                    <p style={styles.reportAmount}>Total Items: {group.totalItems}</p>
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

const styles = {
  container: {
    padding: 'clamp(16px, 3vw, 24px)',
    backgroundColor: '#f5f7f9',
    minHeight: '100vh',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  headerSection: {
    backgroundColor: '#ffffff',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
    marginBottom: '20px',
  },
  header: {
    fontSize: 'clamp(20px, 2.5vw, 28px)',
    fontWeight: 'bold',
    marginBottom: '8px',
    color: '#2c3e50',
  },
  subheader: {
    fontSize: 'clamp(18px, 2vw, 22px)',
    fontWeight: '600',
    marginBottom: '4px',
    color: '#34495e',
  },
  description: {
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    marginBottom: '0',
    color: '#7f8c8d',
  },
  // Enhanced Filter Styles
  filterContainer: {
    marginTop: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    backgroundColor: '#f8f9fa',
    padding: '12px 16px',
    borderRadius: '10px',
    border: '1px solid #e9ecef',
  },
  filterLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#2c3e50',
    marginRight: '8px',
  },
  filterSelect: {
    padding: '10px 16px',
    borderRadius: '8px',
    border: '2px solid #3498db',
    backgroundColor: '#ffffff',
    fontSize: '14px',
    fontWeight: '500',
    color: '#2c3e50',
    cursor: 'pointer',
    outline: 'none',
    transition: 'all 0.2s ease',
    minWidth: '140px',
  },
  metricsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 'clamp(12px, 2vw, 20px)',
    marginBottom: '20px',
  },
  metricCard: {
    backgroundColor: '#ffffff',
    padding: '20px',
    borderRadius: '12px',
    textAlign: 'center',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
    borderLeft: '5px solid #3498db',
  },
  metricValue: {
    fontSize: 'clamp(20px, 2.5vw, 28px)',
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: '8px',
  },
  metricLabel: {
    fontSize: 'clamp(14px, 1.5vw, 16px',
    color: '#7f8c8d',
    marginBottom: '4px',
    fontWeight: '600',
  },
  metricSubLabel: {
    fontSize: 'clamp(12px, 1.2vw, 14px)',
    color: '#95a5a6',
  },
  contentContainer: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '20px',
  },
  mainSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  sideSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  section: {
    backgroundColor: '#ffffff',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
    marginBottom: '0',
  },
  sectionHeaderContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    flexWrap: 'wrap',
    gap: '10px',
  },
  sectionHeader: {
    fontSize: 'clamp(16px, 2vw, 18px)',
    fontWeight: '600',
    color: '#2c3e50',
    margin: '0',
  },
  dateFilter: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  dateLabel: {
    fontSize: '14px',
    color: '#7f8c8d',
  },
  dateValue: {
    fontSize: '14px',
    color: '#2c3e50',
    fontWeight: '500',
  },
  reportList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  reportItem: {
    backgroundColor: '#f8f9fa',
    padding: '16px',
    borderRadius: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeft: '4px solid #2ecc71',
  },
  resupplyItem: {
    backgroundColor: '#f8f9fa',
    padding: '16px',
    borderRadius: '8px',
    borderLeft: '4px solid #e74c3c',
    marginBottom: '12px',
  },
  reportItemLeft: {
    flex: 1,
  },
  reportItemRight: {
    textAlign: 'right',
  },
  reportDate: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#7f8c8d',
    marginBottom: '4px',
  },
  reportName: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: '4px',
  },
  reportAmount: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#27ae60',
    margin: '0',
  },
  placeholderCard: {
    backgroundColor: '#f8f9fa',
    padding: '30px 20px',
    borderRadius: '8px',
    textAlign: 'center',
  },
  placeholderText: {
    fontSize: '16px',
    color: '#7f8c8d',
    marginBottom: '8px',
    fontWeight: '500',
  },
  placeholderSubText: {
    fontSize: '14px',
    color: '#95a5a6',
  },
};