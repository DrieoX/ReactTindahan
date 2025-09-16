import React, { useEffect, useState } from 'react';
import { db } from '../db';

export default function ReportsScreen({ userMode }) {
  const [report, setReport] = useState([]);
  const [resupplyReport, setResupplyReport] = useState([]);
  const mode = userMode || 'client'; // default client if not passed

  useEffect(() => {
    fetchReport();
    fetchResupplyReport();
  }, []);

  const fetchReport = async () => {
    try {
      const salesData = await db.sale_items.toArray();
      const sales = await db.sales.toArray();
      const products = await db.products.toArray();

      const enriched = salesData.map(item => {
        const sale = sales.find(s => s.sales_id === item.sales_id);
        const product = products.find(p => p.product_id === item.product_id);
        return {
          sales_date: sale?.sales_date,
          name: product?.name,
          quantity: item.quantity,
          amount: item.amount
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

      const enriched = resuppliedItems.map(item => {
        const product = products.find(p => p.product_id === item.product_id);
        const supplier = suppliers.find(s => s.supplier_id === item.supplier_id);
        return {
          resupply_date: item.resupply_date,
          product_name: product?.name,
          supplier_name: supplier?.name,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          expiration_date: item.expiration_date || 'N/A'
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
      </div>

      <div style={styles.metricsContainer}>
        <div style={styles.metricCard}>
          <p style={styles.metricValue}>
            ₱{report.reduce((sum, r) => sum + (r.amount || 0), 0).toFixed(2)}
          </p>
          <p style={styles.metricLabel}>Total Revenue</p>
          <p style={styles.metricSubLabel}>Today</p>
        </div>

        <div style={styles.metricCard}>
          <p style={styles.metricValue}>
            ₱{report.length > 0 ? (report.reduce((sum, r) => sum + (r.amount || 0), 0) / report.length).toFixed(2) : '0.00'}
          </p>
          <p style={styles.metricLabel}>Avg. Transaction</p>
          <p style={styles.metricSubLabel}>Today</p>
        </div>

        <div style={styles.metricCard}>
          <p style={styles.metricValue}>{report.length}</p>
          <p style={styles.metricLabel}>Total Transactions</p>
          <p style={styles.metricSubLabel}>Today</p>
        </div>
      </div>

      <div style={styles.contentContainer}>
        <div style={styles.mainSection}>
          <div style={styles.section}>
            <div style={styles.sectionHeaderContainer}>
              <h3 style={styles.sectionHeader}>Recent Sales</h3>
              <div style={styles.dateFilter}>
                <span style={styles.dateLabel}>Date Range:</span>
                <span style={styles.dateValue}>09/09/2025 - 09/16/2025</span>
              </div>
            </div>
            
            {report.length === 0 ? (
              <div style={styles.placeholderCard}>
                <p style={styles.placeholderText}>No sales in selected period</p>
                <p style={styles.placeholderSubText}>
                  Sales data will appear here once you start making transactions
                </p>
              </div>
            ) : (
              <div style={styles.reportList}>
                {report.map((item, index) => (
                  <div key={index} style={styles.reportItem}>
                    <div style={styles.reportItemLeft}>
                      <p style={styles.reportDate}>{item.sales_date}</p>
                      <p style={styles.reportName}>{item.name}</p>
                    </div>
                    <div style={styles.reportItemRight}>
                      <p style={styles.reportDetails}>
                        Qty: {item.quantity}
                      </p>
                      <p style={styles.reportAmount}>₱{item.amount}</p>
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
                <p style={styles.placeholderText}>No resupply data available</p>
                <p style={styles.placeholderSubText}>
                  Resupply history will appear here once items are restocked
                </p>
              </div>
            ) : (
              <div style={styles.reportList}>
                {resupplyReport.map((item, index) => (
                  <div key={index} style={styles.resupplyItem}>
                    <p style={styles.reportDate}>{item.resupply_date}</p>
                    <p style={styles.reportName}>{item.product_name}</p>
                    <p style={styles.reportDetails}>
                      Supplier: {item.supplier_name}, Qty: {item.quantity}
                    </p>
                    <p style={styles.reportDetails}>
                      Unit Cost: ₱{item.unit_cost}, Expiry: {item.expiration_date}
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

const styles = {
  container: {
    padding: 'clamp(16px, 3vw, 24px)',
    backgroundColor: '#f5f7f9',
    minHeight: '100vh',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },

  // Header Section
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

  // Metrics
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
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    color: '#7f8c8d',
    marginBottom: '4px',
    fontWeight: '600',
  },
  metricSubLabel: {
    fontSize: 'clamp(12px, 1.2vw, 14px)',
    color: '#95a5a6',
  },

  // Content Layout
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

  // Sections
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

  // Report items
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
  reportDetails: {
    fontSize: '14px',
    color: '#7f8c8d',
    marginBottom: '2px',
  },
  reportAmount: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#27ae60',
    margin: '0',
  },

  // Empty / placeholder
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