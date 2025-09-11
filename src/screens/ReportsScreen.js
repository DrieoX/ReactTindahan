import React, { useEffect, useState } from 'react';
import { db } from '../db';

export default function ReportsScreen({ userMode }) {
  const [report, setReport] = useState([]);
  const mode = userMode || 'client'; // default client if not passed

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    try {
      const salesData = await db.sale_items
        .toArray();

      // Join manually (since Dexie doesn’t support joins directly)
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
      console.error("Error fetching report:", err);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>SmartTindahan</h1>

      <h2 style={styles.subheader}>Sales Reports</h2>
      <p style={styles.description}>Track your sales performance and analytics</p>

      <div style={styles.metricsContainer}>
        <div style={styles.metricCard}>
          <p style={styles.metricValue}>₱0.00</p>
          <p style={styles.metricLabel}>Total Revenue</p>
          <p style={styles.metricSubLabel}>Today</p>
        </div>

        <div style={styles.metricCard}>
          <p style={styles.metricValue}>₱0.00</p>
          <p style={styles.metricLabel}>Avg. Transaction</p>
          <p style={styles.metricSubLabel}>Today</p>
        </div>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionHeader}>Recent Sales</h3>
        {report.length === 0 ? (
          <div style={styles.placeholderCard}>
            <p style={styles.placeholderText}>No sales in selected period</p>
            <p style={styles.placeholderSubText}>
              Sales data will appear here once you start making transactions
            </p>
          </div>
        ) : (
          report.map((item, index) => (
            <div key={index} style={styles.reportItem}>
              <p style={styles.reportDate}>{item.sales_date}</p>
              <p style={styles.reportName}>{item.name}</p>
              <p style={styles.reportDetails}>
                Qty: {item.quantity}, ₱{item.amount}
              </p>
            </div>
          ))
        )}
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionHeader}>Top Selling Products</h3>
        <div style={styles.placeholderCard}>
          <p style={styles.placeholderText}>No sales data available</p>
          <p style={styles.placeholderSubText}>
            Top selling products will appear here
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: 'clamp(12px, 3vw, 24px)',
    backgroundColor: '#fff',
    minHeight: '100vh',
  },

  // Titles
  header: {
    fontSize: 'clamp(20px, 2.5vw, 24px)',
    fontWeight: 'bold',
    marginBottom: '8px',
    color: '#1f2937',
  },
  subheader: {
    fontSize: 'clamp(18px, 2vw, 20px)',
    fontWeight: '600',
    marginBottom: '4px',
    color: '#374151',
  },
  description: {
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    marginBottom: '16px',
    color: '#6b7280',
  },

  // Metrics
  metricsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 'clamp(12px, 2vw, 20px)',
    marginBottom: '20px',
  },
  metricCard: {
    backgroundColor: '#f9fafb',
    padding: 'clamp(12px, 2.5vw, 16px)',
    borderRadius: '8px',
    textAlign: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  metricValue: {
    fontSize: 'clamp(18px, 2vw, 20px)',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '4px',
  },
  metricLabel: {
    fontSize: 'clamp(12px, 1.5vw, 14px)',
    color: '#374151',
    marginBottom: '2px',
  },
  metricSubLabel: {
    fontSize: 'clamp(10px, 1.2vw, 12px)',
    color: '#6b7280',
  },

  // Sections
  section: {
    marginBottom: '20px',
  },
  sectionHeader: {
    fontSize: 'clamp(16px, 2vw, 18px)',
    fontWeight: '600',
    marginBottom: '12px',
    color: '#374151',
  },

  // Report items
  reportItem: {
    backgroundColor: '#f9fafb',
    padding: 'clamp(12px, 2.5vw, 16px)',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  reportDate: {
    fontSize: 'clamp(12px, 1.5vw, 14px)',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '4px',
  },
  reportName: {
    fontSize: 'clamp(14px, 2vw, 16px)',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '4px',
  },
  reportDetails: {
    fontSize: 'clamp(12px, 1.5vw, 14px)',
    color: '#6b7280',
  },

  // Empty / placeholder
  placeholderCard: {
    backgroundColor: '#f9fafb',
    padding: 'clamp(16px, 4vw, 20px)',
    borderRadius: '8px',
    textAlign: 'center',
  },
  placeholderText: {
    fontSize: 'clamp(14px, 1.5vw, 16px)',
    color: '#6b7280',
    marginBottom: '4px',
  },
  placeholderSubText: {
    fontSize: 'clamp(12px, 1.5vw, 14px)',
    color: '#9ca3af',
  },
};
