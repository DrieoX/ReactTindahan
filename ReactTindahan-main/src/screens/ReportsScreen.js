import React, { useEffect, useState } from 'react';
import { dataService } from '../services/DataService';

export const addReport = async (report) => {
  await dataService.add('backup', report);
};

export default function ReportsScreen({ userMode }) {
  const mode = userMode || 'client';
  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const user = savedUser;

  const [report, setReport] = useState([]);
  const [resupplyReport, setResupplyReport] = useState([]);
  const [timeFilter, setTimeFilter] = useState('daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [costData, setCostData] = useState({});
  const [loading, setLoading] = useState(false);
  const [resupplyLoading, setResupplyLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [costDataLoaded, setCostDataLoaded] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
    
    console.log(`[AUDIT] VIEW_REPORTS_SCREEN`, {
      user_id: user?.user_id,
      username: user?.username,
      page: 'reports',
      timestamp: new Date().toISOString()
    });
    
    // Log audit using backup table
    dataService.add('backup', {
      user_id: user?.user_id,
      backup_name: `AUDIT_VIEW_REPORTS_SCREEN`,
      backup_type: 'audit',
      created_at: new Date().toISOString(),
      schema_version: '6',
      details: JSON.stringify({
        action: 'VIEW_REPORTS_SCREEN',
        user_id: user?.user_id,
        username: user?.username,
        page: 'reports'
      })
    }).catch(console.error);
    
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      fetchProductCostData();
    }
  }, [isInitialized]);

  useEffect(() => {
    if (isInitialized && startDate && endDate && costDataLoaded) {
      console.log('✅ Cost data loaded, fetching reports...');
      fetchReport();
      fetchResupplyReport();
    }
  }, [timeFilter, startDate, endDate, isInitialized, costDataLoaded]);

  const fetchProductCostData = async () => {
    try {
      console.log('🔍 Starting to fetch product cost data...');
      
      // FIRST: Try to get cost data from resupplied_items table
      let costMap = {};
      
      try {
        console.log('📊 Attempting to fetch from resupplied_items...');
        const resuppliedItems = await dataService.getAll('resupplied_items');
        
        console.log('📊 Raw resupplied_items data:', resuppliedItems);
        console.log('📊 Number of resupplied items:', resuppliedItems?.length || 0);
        
        if (resuppliedItems && Array.isArray(resuppliedItems)) {
          // Filter items with unit_cost and sort by date (newest first)
          const validItems = resuppliedItems
            .filter(item => item && item.product_id && item.unit_cost != null)
            .sort((a, b) => {
              const dateA = new Date(a.resupply_date || a.created_at || 0);
              const dateB = new Date(b.resupply_date || b.created_at || 0);
              return dateB - dateA; // Descending (newest first)
            });
          
          console.log('📊 Valid resupplied items with cost:', validItems.length);
          
          // Get latest cost for each product
          validItems.forEach(item => {
            const productId = item.product_id;
            const unitCost = parseFloat(item.unit_cost);
            
            if (productId && !isNaN(unitCost)) {
              const itemDate = new Date(item.resupply_date || item.created_at || new Date());
              const existingDate = costMap[productId] ? new Date(costMap[productId].date) : null;
              
              if (!costMap[productId] || itemDate > existingDate) {
                costMap[productId] = {
                  cost: unitCost,
                  date: item.resupply_date || item.created_at || new Date().toISOString(),
                  source: 'resupplied_items'
                };
              }
            }
          });
          
          console.log('📊 Cost map after resupplied_items:', costMap);
        }
      } catch (err) {
        console.error('❌ Error fetching from resupplied_items:', err);
      }
      
      // SECOND: If no data found, try stock_card as fallback
      if (Object.keys(costMap).length === 0) {
        try {
          console.log('📊 No data in resupplied_items, trying stock_card...');
          const stockCardItems = await dataService.getAll('stock_card');
          
          console.log('📊 Raw stock_card data:', stockCardItems);
          
          if (stockCardItems && Array.isArray(stockCardItems)) {
            const resupplyItems = stockCardItems
              .filter(item => item && item.transaction_type === 'RESUPPLY' && item.unit_cost != null)
              .sort((a, b) => {
                const dateA = new Date(a.created_at || a.transaction_date || 0);
                const dateB = new Date(b.created_at || b.transaction_date || 0);
                return dateB - dateA; // Descending (newest first)
              });
            
            console.log('📊 Valid stock_card resupply items:', resupplyItems.length);
            
            resupplyItems.forEach(item => {
              const productId = item.product_id;
              const unitCost = parseFloat(item.unit_cost);
              
              if (productId && !isNaN(unitCost)) {
                const itemDate = new Date(item.created_at || item.transaction_date || new Date());
                const existingDate = costMap[productId] ? new Date(costMap[productId].date) : null;
                
                if (!costMap[productId] || itemDate > existingDate) {
                  costMap[productId] = {
                    cost: unitCost,
                    date: item.created_at || item.transaction_date || new Date().toISOString(),
                    source: 'stock_card'
                  };
                }
              }
            });
          }
        } catch (err) {
          console.error('❌ Error fetching from stock_card:', err);
        }
      }
      
      // THIRD: Try direct query to products table
      if (Object.keys(costMap).length === 0) {
        try {
          console.log('📊 Trying to get cost from products table...');
          const products = await dataService.getProducts();
          
          products.forEach(product => {
            if (product.product_id && product.unit_cost != null) {
              const unitCost = parseFloat(product.unit_cost);
              if (!isNaN(unitCost)) {
                costMap[product.product_id] = {
                  cost: unitCost,
                  date: new Date().toISOString(),
                  source: 'products_table'
                };
              }
            }
          });
        } catch (err) {
          console.error('❌ Error fetching from products:', err);
        }
      }
      
      console.log('✅ FINAL COST DATA:', {
        totalProductsWithCost: Object.keys(costMap).length,
        costMap: costMap,
        productIds: Object.keys(costMap),
        sampleCosts: Object.entries(costMap).slice(0, 5).map(([id, data]) => ({ 
          product_id: id, 
          cost: data.cost, 
          source: data.source 
        }))
      });
      
      setCostData(costMap);
      setCostDataLoaded(true);
      
      // Log audit
      dataService.add('backup', {
        user_id: user?.user_id,
        backup_name: `AUDIT_FETCH_COST_DATA`,
        backup_type: 'audit',
        created_at: new Date().toISOString(),
        schema_version: '6',
        details: JSON.stringify({
          action: 'FETCH_COST_DATA',
          products_with_cost: Object.keys(costMap).length,
          sample_products: Object.entries(costMap).slice(0, 3).map(([id, data]) => ({ id, cost: data.cost })),
          user_id: user?.user_id
        })
      }).catch(console.error);
    } catch (err) {
      console.error("❌ Error fetching cost data:", err);
      console.error(`[AUDIT] FETCH_COST_DATA_ERROR`, {
        error: err.message,
        user_id: user?.user_id,
        username: user?.username,
        timestamp: new Date().toISOString()
      });
    }
  };

  // Helper function to normalize dates for comparison
  const normalizeDate = (dateInput) => {
    if (!dateInput) return null;
    
    // If it's already a Date object
    if (dateInput instanceof Date) {
      return dateInput.toISOString().split('T')[0];
    }
    
    // If it's a string
    if (typeof dateInput === 'string') {
      // If it contains 'T' (ISO format), split it
      if (dateInput.includes('T')) {
        return dateInput.split('T')[0];
      }
      // If it's already YYYY-MM-DD format
      if (dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateInput;
      }
      // Try to parse other formats
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

  const matchesFilter = (dateStr) => {
    if (!dateStr) return false;
    
    try {
      // Normalize the date string
      const normalizedDate = normalizeDate(dateStr);
      
      if (!normalizedDate) {
        console.log('DEBUG: Could not normalize date:', dateStr);
        return false;
      }
      
      const date = new Date(normalizedDate);
      const today = new Date();
      const todayNormalized = today.toISOString().split('T')[0];
      
      if (timeFilter === 'custom' && startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return date >= start && date <= end;
      }
      
      switch (timeFilter) {
        case 'weekly':
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          weekStart.setHours(0, 0, 0, 0);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          weekEnd.setHours(23, 59, 59, 999);
          return date >= weekStart && date <= weekEnd;
        
        case 'monthly':
          return date.getMonth() === today.getMonth() && 
                 date.getFullYear() === today.getFullYear();
        
        case 'yearly':
          return date.getFullYear() === today.getFullYear();
        
        default: // daily
          return normalizedDate === todayNormalized;
      }
    } catch (err) {
      console.error('Error in matchesFilter:', err, dateStr);
      return false;
    }
  };

  const handleDateRangeChange = async (newStartDate, newEndDate) => {
    console.log(`[AUDIT] CHANGE_REPORT_FILTER`, {
      old_filter: timeFilter,
      new_filter: 'custom',
      start_date: newStartDate,
      end_date: newEndDate,
      user_id: user?.user_id,
      username: user?.username,
      timestamp: new Date().toISOString()
    });
    
    setStartDate(newStartDate);
    setEndDate(newEndDate);
    if (timeFilter !== 'custom') {
      setTimeFilter('custom');
    }
    
    // Log audit
    dataService.add('backup', {
      user_id: user?.user_id,
      backup_name: `AUDIT_CHANGE_REPORT_FILTER`,
      backup_type: 'audit',
      created_at: new Date().toISOString(),
      schema_version: '6',
      details: JSON.stringify({
        action: 'CHANGE_REPORT_FILTER',
        old_filter: timeFilter,
        new_filter: 'custom',
        start_date: newStartDate,
        end_date: newEndDate,
        user_id: user?.user_id
      })
    }).catch(console.error);
  };

  const handleTimeFilterChange = async (newFilter) => {
    console.log(`[AUDIT] CHANGE_REPORT_FILTER`, {
      old_filter: timeFilter,
      new_filter: newFilter,
      start_date: startDate,
      end_date: endDate,
      user_id: user?.user_id,
      username: user?.username,
      timestamp: new Date().toISOString()
    });
    
    // Reset to today for non-custom filters
    if (newFilter !== 'custom') {
      const today = new Date().toISOString().split('T')[0];
      setStartDate(today);
      setEndDate(today);
    }
    
    setTimeFilter(newFilter);
    
    // Log audit
    dataService.add('backup', {
      user_id: user?.user_id,
      backup_name: `AUDIT_CHANGE_TIME_FILTER`,
      backup_type: 'audit',
      created_at: new Date().toISOString(),
      schema_version: '6',
      details: JSON.stringify({
        action: 'CHANGE_TIME_FILTER',
        old_filter: timeFilter,
        new_filter: newFilter,
        user_id: user?.user_id
      })
    }).catch(console.error);
  };

  const getDateRangeLabel = () => {
    if (timeFilter === 'custom' && startDate && endDate) {
      if (startDate === endDate) {
        return new Date(startDate).toLocaleDateString();
      }
      return `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
    }
    
    const today = new Date();
    
    switch(timeFilter) {
      case 'weekly':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        return `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;
      
      case 'monthly':
        return today.toLocaleDateString('default', { month: 'long', year: 'numeric' });
      
      case 'yearly':
        return today.getFullYear().toString();
      
      default:
        return new Date().toLocaleDateString();
    }
  };

  const getDateRangeForExport = () => {
    return getDateRangeLabel();
  };

  const downloadCSV = async () => {
    if (report.length === 0) {
      alert('No data to download');
      return;
    }

    const totalRevenue = report.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
    const totalCost = report.reduce((sum, r) => sum + (r.totalCost || 0), 0);
    const totalIncome = totalRevenue - totalCost;
    const totalTransactions = report.length;
    const totalItemsSold = report.reduce((sum, sale) => 
      sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
    );
    
    console.log(`[AUDIT] DOWNLOAD_REPORT_CSV`, {
      report_type: 'sales_with_income',
      time_filter: timeFilter,
      start_date: startDate,
      end_date: endDate,
      total_records: report.length,
      total_revenue: totalRevenue,
      total_cost: totalCost,
      total_income: totalIncome,
      user_id: user?.user_id,
      username: user?.username,
      timestamp: new Date().toISOString()
    });

    // Log audit
    dataService.add('backup', {
      user_id: user?.user_id,
      backup_name: `AUDIT_DOWNLOAD_REPORT_CSV`,
      backup_type: 'audit',
      created_at: new Date().toISOString(),
      schema_version: '6',
      details: JSON.stringify({
        action: 'DOWNLOAD_REPORT_CSV',
        report_type: 'sales_with_income',
        time_filter: timeFilter,
        total_records: report.length,
        total_revenue: totalRevenue,
        total_cost: totalCost,
        total_income: totalIncome,
        user_id: user?.user_id
      })
    }).catch(console.error);

    const headers = ['Date', 'Created By', 'Created At', 'Product', 'Quantity', 'Selling Price', 'Cost Price', 'Income', 'Total Sale', 'Total Cost', 'Total Income'];
    
    const csvData = report.flatMap(sale => {
      const saleTotal = sale.totalAmount || 0;
      const saleCost = sale.totalCost || 0;
      const saleIncome = saleTotal - saleCost;
      
      return sale.items.map((item, index) => [
        index === 0 ? sale.sales_date : '',
        index === 0 ? (sale.created_by || 'Unknown') : '',
        index === 0 ? (sale.created_at || '') : '',
        item.name,
        item.quantity,
        `₱${item.unit_price?.toFixed(2) || '0.00'}`,
        `₱${item.unit_cost?.toFixed(2) || '0.00'}`,
        `₱${item.income?.toFixed(2) || '0.00'}`,
        index === 0 ? `₱${saleTotal.toFixed(2)}` : '',
        index === 0 ? `₱${saleCost.toFixed(2)}` : '',
        index === 0 ? `₱${saleIncome.toFixed(2)}` : ''
      ]);
    });

    const csvContent = [
      ['SmartTindahan - Income Report (Profit & Loss)'],
      ['Date Range:', getDateRangeForExport()],
      [`Generated on: ${new Date().toLocaleDateString()} by ${user?.username || 'Unknown'}`],
      [''],
      headers,
      ...csvData,
      [''],
      ['SUMMARY', '', '', '', '', '', '', '', '', '', ''],
      ['Total Revenue', '', '', '', '', '', '', '', `₱${totalRevenue.toFixed(2)}`, '', ''],
      ['Total Cost', '', '', '', '', '', '', '', '', `₱${totalCost.toFixed(2)}`, ''],
      ['Total Income (Profit)', '', '', '', '', '', '', '', '', '', `₱${totalIncome.toFixed(2)}`],
      ['Total Transactions', '', '', '', '', '', '', '', totalTransactions, '', ''],
      ['Total Items Sold', '', '', '', '', '', '', '', totalItemsSold, '', ''],
      ['Average Transaction Value', '', '', '', '', '', '', '', `₱${(totalRevenue / totalTransactions || 0).toFixed(2)}`, '', ''],
      ['Profit Margin', '', '', '', '', '', '', '', `${totalRevenue > 0 ? ((totalIncome / totalRevenue) * 100).toFixed(2) : '0.00'}%`, '', '']
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `income_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadPDF = async () => {
    if (report.length === 0) {
      alert('No data to download');
      return;
    }

    const totalRevenue = report.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
    const totalCost = report.reduce((sum, r) => sum + (r.totalCost || 0), 0);
    const totalIncome = totalRevenue - totalCost;
    const totalTransactions = report.length;
    const totalItemsSold = report.reduce((sum, sale) => 
      sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
    );
    const averageTransaction = totalRevenue / totalTransactions || 0;
    const profitMargin = totalRevenue > 0 ? (totalIncome / totalRevenue) * 100 : 0;

    console.log(`[AUDIT] DOWNLOAD_REPORT_PDF`, {
      report_type: 'income',
      time_filter: timeFilter,
      start_date: startDate,
      end_date: endDate,
      total_records: report.length,
      total_revenue: totalRevenue,
      total_cost: totalCost,
      total_income: totalIncome,
      user_id: user?.user_id,
      username: user?.username,
      timestamp: new Date().toISOString()
    });

    // Log audit
    dataService.add('backup', {
      user_id: user?.user_id,
      backup_name: `AUDIT_DOWNLOAD_REPORT_PDF`,
      backup_type: 'audit',
      created_at: new Date().toISOString(),
      schema_version: '6',
      details: JSON.stringify({
        action: 'DOWNLOAD_REPORT_PDF',
        report_type: 'income',
        time_filter: timeFilter,
        total_records: report.length,
        total_revenue: totalRevenue,
        total_cost: totalCost,
        total_income: totalIncome,
        user_id: user?.user_id
      })
    }).catch(console.error);

    const printWindow = window.open('', '_blank');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Income Report (Profit & Loss)</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
          .date-info { text-align: center; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px; }
          .date-range { font-size: 18px; font-weight: bold; color: #2c3e50; margin-bottom: 5px; }
          .generated-date { font-size: 14px; color: #7f8c8d; }
          .creator-info { font-size: 14px; color: #5d6d7e; margin-top: 5px; }
          .summary { background: #f5f5f5; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; }
          .summary-item { text-align: center; padding: 10px; border-radius: 5px; }
          .summary-revenue { background: #e8f5e8; }
          .summary-cost { background: #ffe6e6; }
          .summary-income { background: #e8f4fd; }
          .summary-other { background: #f8f9fa; }
          .summary-value { font-size: 18px; font-weight: bold; }
          .revenue-value { color: #2e7d32; }
          .cost-value { color: #c62828; }
          .income-value { color: #1565c0; }
          .summary-label { font-size: 14px; color: #7f8c8d; margin-top: 5px; }
          .profit-margin { 
            text-align: center; 
            padding: 15px; 
            margin: 20px 0; 
            border-radius: 5px;
            font-size: 18px;
            font-weight: bold;
            color: ${profitMargin >= 0 ? '#2e7d32' : '#c62828'};
            background: ${profitMargin >= 0 ? '#e8f5e8' : '#ffe6e6'};
          }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
          th { background-color: #f8f9fa; font-weight: bold; }
          .creator-column { background-color: #f9f9f9; }
          .income-positive { color: #2e7d32; font-weight: bold; }
          .income-negative { color: #c62828; font-weight: bold; }
          .total-row { background-color: #e8f5e8; font-weight: bold; }
          .cost-row { background-color: #fff5f5; }
          .income-row { background-color: '#f0f9ff'; }
          .footer { margin-top: 30px; text-align: center; color: '#7f8c8d'; font-size: 12px; }
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>SmartTindahan</h1>
          <h2>Income Report (Profit & Loss)</h2>
        </div>

        <div class="date-info">
          <div class="date-range">Date Range: ${getDateRangeForExport()}</div>
          <div class="generated-date">Generated on: ${new Date().toLocaleDateString()}</div>
          <div class="creator-info">Generated by: ${user?.username || 'Unknown'}</div>
        </div>

        <div class="summary">
          <h3>Financial Summary</h3>
          <div class="summary-grid">
            <div class="summary-item summary-revenue">
              <div class="summary-value revenue-value">₱${totalRevenue.toFixed(2)}</div>
              <div class="summary-label">Total Revenue</div>
            </div>
            <div class="summary-item summary-cost">
              <div class="summary-value cost-value">₱${totalCost.toFixed(2)}</div>
              <div class="summary-label">Total Cost</div>
            </div>
            <div class="summary-item summary-income">
              <div class="summary-value income-value">₱${totalIncome.toFixed(2)}</div>
              <div class="summary-label">Total Income (Profit)</div>
            </div>
            <div class="summary-item summary-other">
              <div class="summary-value">${totalTransactions}</div>
              <div class="summary-label">Transactions</div>
            </div>
          </div>
          
          <div class="profit-margin">
            Profit Margin: ${profitMargin.toFixed(2)}%
          </div>
        </div>

        <h3>Sales Details with Income Calculation</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th class="creator-column">Created By</th>
              <th class="creator-column">Created At</th>
              <th>Product</th>
              <th>Quantity</th>
              <th>Selling Price</th>
              <th>Cost Price</th>
              <th>Income</th>
              <th>Total Sale</th>
              <th>Total Cost</th>
              <th>Total Income</th>
            </tr>
          </thead>
          <tbody>
            ${report.map(sale => {
              const saleTotal = sale.totalAmount || 0;
              const saleCost = sale.totalCost || 0;
              const saleIncome = saleTotal - saleCost;
              
              return sale.items.map((item, index) => `
                <tr>
                  ${index === 0 ? `<td rowspan="${sale.items.length}">${sale.sales_date}</td>` : ''}
                  ${index === 0 ? `<td class="creator-column" rowspan="${sale.items.length}">${sale.created_by || 'Unknown'}</td>` : ''}
                  ${index === 0 ? `<td class="creator-column" rowspan="${sale.items.length}">${sale.created_at || ''}</td>` : ''}
                  <td>${item.name}</td>
                  <td>${item.quantity}</td>
                  <td>₱${item.unit_price?.toFixed(2) || '0.00'}</td>
                  <td class="cost-row">₱${item.unit_cost?.toFixed(2) || '0.00'}</td>
                  <td class="income-row ${item.income >= 0 ? 'income-positive' : 'income-negative'}">
                    ₱${item.income?.toFixed(2) || '0.00'}
                  </td>
                  ${index === 0 ? `<td rowspan="${sale.items.length}">₱${saleTotal.toFixed(2)}</td>` : ''}
                  ${index === 0 ? `<td class="cost-row" rowspan="${sale.items.length}">₱${saleCost.toFixed(2)}</td>` : ''}
                  ${index === 0 ? `<td class="income-row ${saleIncome >= 0 ? 'income-positive' : 'income-negative'}" rowspan="${sale.items.length}">
                    ₱${saleIncome.toFixed(2)}
                  </td>` : ''}
                </tr>
              `).join('')
            }).join('')}
          </tbody>
          <tfoot class="total-row">
            <tr>
              <td colspan="4"><strong>Grand Totals:</strong></td>
              <td></td>
              <td></td>
              <td class="cost-row"></td>
              <td class="income-row"></td>
              <td><strong>₱${totalRevenue.toFixed(2)}</strong></td>
              <td class="cost-row"><strong>₱${totalCost.toFixed(2)}</strong></td>
              <td class="income-row ${totalIncome >= 0 ? 'income-positive' : 'income-negative'}">
                <strong>₱${totalIncome.toFixed(2)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>

        <div class="footer">
          <p>Generated by SmartTindahan Income Report System</p>
          <p>Profit = Selling Price - Cost Price</p>
          <p>Report generated by: ${user?.username || 'Unknown'}</p>
        </div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() {
              window.close();
            }, 500);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const fetchReport = async () => {
    try {
      setLoading(true);
      console.log(`[AUDIT] FETCH_SALES_REPORT`, {
        time_filter: timeFilter,
        start_date: startDate,
        end_date: endDate,
        user_id: user?.user_id,
        username: user?.username,
        timestamp: new Date().toISOString()
      });

      // Get all sales
      const sales = await dataService.getSales();
      
      console.log('DEBUG REPORTS: Total sales:', sales.length);
      console.log('DEBUG REPORTS: Sample sale:', sales[0]);

      // Filter sales by date using improved matchesFilter
      const filteredSales = sales.filter(s => {
        if (!s.sales_date) {
          console.log('DEBUG REPORTS: Sale missing date:', s);
          return false;
        }
        
        const matches = matchesFilter(s.sales_date);
        
        return matches;
      });

      console.log('DEBUG REPORTS: Filtered sales:', filteredSales.length);

      if (filteredSales.length === 0) {
        setReport([]);
        setLoading(false);
        return;
      }

      // Get sale items for filtered sales
      const saleItems = [];
      for (const sale of filteredSales) {
        try {
          const items = await dataService.getSaleItems(sale.sales_id);
          console.log(`DEBUG: Sale ${sale.sales_id} items:`, items);
          saleItems.push(...items.map(item => ({ ...item, sales_id: sale.sales_id })));
        } catch (err) {
          console.error(`Error fetching items for sale ${sale.sales_id}:`, err);
        }
      }

      // Get all products for lookup
      const products = await dataService.getProducts();
      console.log('DEBUG: Total products:', products.length);
      console.log('DEBUG: Sample product:', products[0]);

      // Group sale items by sales_id
      const groupedSales = {};
      for (const item of saleItems) {
        if (!groupedSales[item.sales_id]) groupedSales[item.sales_id] = [];
        groupedSales[item.sales_id].push(item);
      }

      console.log('DEBUG: Cost data available:', costData);
      console.log('DEBUG: Looking for product 4 in costData:', costData[4]);
      console.log('DEBUG: All cost data keys:', Object.keys(costData));

      // Enrich sales data with cost calculations
      const enriched = Object.entries(groupedSales).map(([sales_id, items]) => {
        const sale = filteredSales.find(s => s.sales_id === parseInt(sales_id));
        
        const combinedItems = {};
        let saleTotal = 0;
        let saleTotalCost = 0;
        
        items.forEach(i => {
          const product = products.find(p => p.product_id === i.product_id);
          const productName = product?.name || 'Unknown Product';
          const sellingPrice = i.unit_price || i.amount || product?.unit_price || 0;
          
          // Get cost price from costData
          const productCostData = costData[i.product_id];
          const costPrice = productCostData?.cost || 0;
          const quantity = i.quantity || 0;
          const revenue = (sellingPrice * quantity) || 0;
          const cost = (costPrice * quantity) || 0;
          const income = revenue - cost;
          
          console.log('DEBUG ITEM COST:', {
            productId: i.product_id,
            productName: productName,
            sellingPrice: sellingPrice,
            costPrice: costPrice,
            quantity: quantity,
            revenue: revenue,
            cost: cost,
            income: income,
            costDataExists: !!productCostData,
            costData: productCostData,
            allCostData: costData
          });
          
          if (!combinedItems[productName]) {
            combinedItems[productName] = {
              name: productName,
              quantity: 0,
              unit_price: sellingPrice,
              unit_cost: costPrice,
              revenue: 0,
              cost: 0,
              income: 0
            };
          }
          
          combinedItems[productName].quantity += quantity;
          combinedItems[productName].revenue += revenue;
          combinedItems[productName].cost += cost;
          combinedItems[productName].income += income;
          
          saleTotal += revenue;
          saleTotalCost += cost;
        });
        
        const productDetails = Object.values(combinedItems);

        return {
          sales_id: parseInt(sales_id),
          sales_date: sale?.sales_date,
          // Use username field from sale data
          created_by: sale?.username || sale?.created_by || 'Unknown',
          created_at: sale?.created_at || '',
          items: productDetails,
          totalAmount: saleTotal,
          totalCost: saleTotalCost,
          totalIncome: saleTotal - saleTotalCost
        };
      }).sort((a, b) => new Date(b.sales_date) - new Date(a.sales_date));

      console.log('DEBUG ENRICHED REPORT:', {
        totalSales: enriched.length,
        sampleSale: enriched.length > 0 ? enriched[0] : null,
        costDataSummary: {
          totalProductsWithCost: Object.keys(costData).length,
          sampleCosts: Object.entries(costData).slice(0, 3).map(([id, data]) => ({ id, cost: data.cost, source: data.source }))
        }
      });
      
      setReport(enriched);
      
      // Log audit
      dataService.add('backup', {
        user_id: user?.user_id,
        backup_name: `AUDIT_FETCH_SALES_REPORT`,
        backup_type: 'audit',
        created_at: new Date().toISOString(),
        schema_version: '6',
        details: JSON.stringify({
          action: 'FETCH_SALES_REPORT',
          time_filter: timeFilter,
          start_date: startDate,
          end_date: endDate,
          total_sales: filteredSales.length,
          total_items: saleItems.length,
          user_id: user?.user_id
        })
      }).catch(console.error);
    } catch (err) {
      console.error("Error fetching sales report:", err);
      console.error(`[AUDIT] FETCH_SALES_REPORT_ERROR`, {
        error: err.message,
        time_filter: timeFilter,
        user_id: user?.user_id,
        username: user?.username,
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchResupplyReport = async () => {
    try {
      setResupplyLoading(true);
      console.log(`[AUDIT] FETCH_RESUPPLY_REPORT`, {
        time_filter: timeFilter,
        start_date: startDate,
        end_date: endDate,
        user_id: user?.user_id,
        username: user?.username,
        timestamp: new Date().toISOString()
      });

      // Get resupply items directly
      const resupplyItems = await dataService.getResuppliedItems();
      const products = await dataService.getProducts();
      const suppliers = await dataService.getSuppliers();

      // Filter resupply items by date
      const filteredResupplies = resupplyItems.filter(i => 
        i.resupply_date && matchesFilter(i.resupply_date)
      );

      if (filteredResupplies.length === 0) {
        setResupplyReport([]);
        setResupplyLoading(false);
        return;
      }

      // Group resupply items by date
      const groupedResupplies = {};
      for (const item of filteredResupplies) {
        const key = normalizeDate(item.resupply_date) || item.resupply_date.split('T')[0];
        if (!groupedResupplies[key]) groupedResupplies[key] = [];
        groupedResupplies[key].push(item);
      }

      // Enrich resupply data
      const enriched = Object.entries(groupedResupplies).map(([date, items]) => {
        const productDetails = items.map(i => {
          const product = products.find(p => p.product_id === i.product_id);
          const supplier = suppliers.find(s => s.supplier_id === i.supplier_id);
          const totalCost = (i.unit_cost || 0) * (i.quantity || 0);
          
          return {
            product_name: product?.name || 'Unknown Product',
            supplier_name: supplier?.name || 'Unknown Supplier',
            quantity: i.quantity,
            unit_cost: i.unit_cost,
            total_cost: totalCost,
            expiration_date: i.expiration_date || 'N/A',
            created_by: i.created_by || 'System'
          };
        });
        
        const totalItems = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
        const totalCost = items.reduce((sum, i) => sum + ((i.unit_cost || 0) * (i.quantity || 0)), 0);
        
        // Get group created_by info
        const creators = items.map(i => i.created_by).filter(Boolean);
        const groupCreatedBy = creators.length > 0 ? creators[0] : 'System';
        
        return {
          resupply_date: date,
          items: productDetails,
          totalItems,
          totalCost,
          created_by: groupCreatedBy,
          created_at: items[0]?.created_at || date
        };
      }).sort((a, b) => new Date(b.resupply_date) - new Date(a.resupply_date));

      setResupplyReport(enriched);
      
      // Log audit
      dataService.add('backup', {
        user_id: user?.user_id,
        backup_name: `AUDIT_FETCH_RESUPPLY_REPORT`,
        backup_type: 'audit',
        created_at: new Date().toISOString(),
        schema_version: '6',
        details: JSON.stringify({
          action: 'FETCH_RESUPPLY_REPORT',
          time_filter: timeFilter,
          start_date: startDate,
          end_date: endDate,
          total_resupplies: filteredResupplies.length,
          user_id: user?.user_id
        })
      }).catch(console.error);
    } catch (err) {
      console.error("Error fetching resupply report:", err);
      console.error(`[AUDIT] FETCH_RESUPPLY_REPORT_ERROR`, {
        error: err.message,
        time_filter: timeFilter,
        user_id: user?.user_id,
        username: user?.username,
        timestamp: new Date().toISOString()
      });
    } finally {
      setResupplyLoading(false);
    }
  };

  const refreshCostData = async () => {
    console.log('🔄 Refreshing cost data...');
    setCostDataLoaded(false);
    await fetchProductCostData();
  };

  const totalItemsSold = report.reduce((sum, sale) => 
    sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
  );
  const grandTotalRevenue = report.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
  const grandTotalCost = report.reduce((sum, r) => sum + (r.totalCost || 0), 0);
  const grandTotalIncome = grandTotalRevenue - grandTotalCost;
  const profitMargin = grandTotalRevenue > 0 ? (grandTotalIncome / grandTotalRevenue) * 100 : 0;

  return (
    <div style={styles.container}>
      <div style={styles.headerSection}>
        <h1 style={styles.header}>SmartTindahan</h1>
        <h2 style={styles.subheader}>Income Reports (Profit & Loss)</h2>
        <p style={styles.description}>Track your sales revenue, costs, and net income</p>

        {/* 🔹 Enhanced Timeline Selector */}
        <div style={styles.filterContainer}>
          <label style={styles.filterLabel}>View By:</label>
          <select
            value={timeFilter}
            onChange={(e) => handleTimeFilterChange(e.target.value)}
            style={styles.filterSelect}
            disabled={loading}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
            <option value="custom">Custom Date Range</option>
          </select>

          {/* Date Range Selector */}
          <div style={styles.dateRangeContainer}>
            <div style={styles.dateInputGroup}>
              <label style={styles.dateLabel}>From:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleDateRangeChange(e.target.value, endDate)}
                style={styles.dateInput}
                disabled={loading}
              />
            </div>
            <div style={styles.dateInputGroup}>
              <label style={styles.dateLabel}>To:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleDateRangeChange(startDate, e.target.value)}
                style={styles.dateInput}
                disabled={loading}
              />
            </div>
          </div>

          {/* Download Buttons */}
          <div style={styles.downloadContainer}>
            <button 
              onClick={downloadCSV}
              style={styles.downloadButton}
              disabled={report.length === 0 || loading}
            >
              📥 CSV
            </button>
            <button 
              onClick={downloadPDF}
              style={styles.downloadButton}
              disabled={report.length === 0 || loading}
            >
              📥 PDF
            </button>
            <button 
              onClick={refreshCostData}
              style={{...styles.downloadButton, backgroundColor: '#10B981'}}
              disabled={loading}
            >
              🔄 Refresh Cost Data
            </button>
          </div>
        </div>
      </div>

      <div style={styles.metricsContainer}>
        <div style={styles.metricCard}>
          <p style={styles.metricValue}>
            ₱{grandTotalRevenue.toFixed(2)}
          </p>
          <p style={styles.metricLabel}>Total Revenue</p>
          <p style={styles.metricSubLabel}>
            {timeFilter === 'custom' ? 'Custom Range' : timeFilter.charAt(0).toUpperCase() + timeFilter.slice(1)}
          </p>
        </div>

        <div style={{...styles.metricCard, backgroundColor: '#fff5f5'}}>
          <p style={{...styles.metricValue, color: '#c62828'}}>
            ₱{grandTotalCost.toFixed(2)}
          </p>
          <p style={styles.metricLabel}>Total Cost</p>
          <p style={styles.metricSubLabel}>
            {timeFilter === 'custom' ? 'Custom Range' : timeFilter.charAt(0).toUpperCase() + timeFilter.slice(1)}
          </p>
        </div>

        <div style={{...styles.metricCard, backgroundColor: grandTotalIncome >= 0 ? '#e8f5e8' : '#ffe6e6'}}>
          <p style={{...styles.metricValue, color: grandTotalIncome >= 0 ? '#2e7d32' : '#c62828'}}>
            ₱{grandTotalIncome.toFixed(2)}
          </p>
          <p style={styles.metricLabel}>Net Income (Profit)</p>
          <p style={styles.metricSubLabel}>
            {timeFilter === 'custom' ? 'Custom Range' : timeFilter.charAt(0).toUpperCase() + timeFilter.slice(1)}
          </p>
        </div>

        <div style={styles.metricCard}>
          <p style={styles.metricValue}>
            {profitMargin.toFixed(2)}%
          </p>
          <p style={styles.metricLabel}>Profit Margin</p>
          <p style={styles.metricSubLabel}>
            {timeFilter === 'custom' ? 'Custom Range' : timeFilter.charAt(0).toUpperCase() + timeFilter.slice(1)}
          </p>
        </div>
      </div>

      {!costDataLoaded && (
        <div style={styles.warningCard}>
          <p style={styles.warningText}>
            ⚠️ Cost data is still loading. If costs show as zero, please wait or click "Refresh Cost Data" above.
          </p>
          <p style={styles.warningSubText}>
            Current cost data status: {Object.keys(costData).length} products with cost data loaded.
          </p>
        </div>
      )}

      <div style={styles.contentContainer}>
        <div style={styles.mainSection}>
          <div style={styles.section}>
            <div style={styles.sectionHeaderContainer}>
              <h3 style={styles.sectionHeader}>Sales with Income Calculation</h3>
              <div style={styles.dateFilter}>
                <span style={styles.dateLabel}>Date Range:</span>
                <span style={styles.dateValue}>
                  {getDateRangeLabel()}
                </span>
              </div>
            </div>
            
            {loading ? (
              <div style={styles.placeholderCard}>
                <p style={styles.placeholderText}>Loading sales data...</p>
              </div>
            ) : report.length === 0 ? (
              <div style={styles.placeholderCard}>
                <p style={styles.placeholderText}>No sales for this {timeFilter === 'custom' ? 'date range' : timeFilter}</p>
                <p style={styles.placeholderSubText}>
                  Sales data will appear here once transactions are recorded
                </p>
              </div>
            ) : (
              <div style={styles.tableContainer}>
                <table style={styles.salesTable}>
                  <thead>
                    <tr>
                      <th style={styles.tableHeader}>Date</th>
                      <th style={styles.tableHeader}>Created By</th>
                      <th style={styles.tableHeader}>Created At</th>
                      <th style={styles.tableHeader}>Product</th>
                      <th style={styles.tableHeader}>Quantity</th>
                      <th style={styles.tableHeader}>Selling Price</th>
                      <th style={styles.tableHeader}>Cost Price</th>
                      <th style={styles.tableHeader}>Income</th>
                      <th style={styles.tableHeader}>Total Sale</th>
                      <th style={styles.tableHeader}>Total Cost</th>
                      <th style={styles.tableHeader}>Total Income</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.map((sale, saleIndex) => (
                      sale.items.map((item, itemIndex) => (
                        <tr key={`${saleIndex}-${itemIndex}`} style={itemIndex % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd}>
                          {itemIndex === 0 && (
                            <>
                              <td style={styles.tableCell} rowSpan={sale.items.length}>
                                {sale.sales_date}
                              </td>
                              <td style={styles.tableCell} rowSpan={sale.items.length}>
                                {sale.created_by || 'Unknown'}
                              </td>
                              <td style={styles.tableCell} rowSpan={sale.items.length}>
                                {sale.created_at || ''}
                              </td>
                            </>
                          )}
                          <td style={styles.tableCell}>{item.name}</td>
                          <td style={styles.tableCell}>{item.quantity}</td>
                          <td style={styles.tableCell}>₱{item.unit_price?.toFixed(2) || '0.00'}</td>
                          <td style={{...styles.tableCell, backgroundColor: '#fff5f5'}}>
                            ₱{item.unit_cost?.toFixed(2) || '0.00'}
                          </td>
                          <td style={{
                            ...styles.tableCell, 
                            backgroundColor: '#f0f9ff',
                            color: item.income >= 0 ? '#2e7d32' : '#c62828',
                            fontWeight: 'bold'
                          }}>
                            ₱{item.income?.toFixed(2) || '0.00'}
                          </td>
                          {itemIndex === 0 && (
                            <>
                              <td style={styles.tableCell} rowSpan={sale.items.length}>
                                ₱{sale.totalAmount.toFixed(2)}
                              </td>
                              <td style={{...styles.tableCell, backgroundColor: '#fff5f5'}} rowSpan={sale.items.length}>
                                ₱{sale.totalCost.toFixed(2)}
                              </td>
                              <td style={{
                                ...styles.tableCell, 
                                backgroundColor: '#f0f9ff',
                                color: sale.totalIncome >= 0 ? '#2e7d32' : '#c62828',
                                fontWeight: 'bold'
                              }} rowSpan={sale.items.length}>
                                ₱{sale.totalIncome.toFixed(2)}
                              </td>
                            </>
                          )}
                        </tr>
                      ))
                    ))}
                    {/* Table Footer with Totals */}
                    <tr style={styles.tableFooter}>
                      <td style={styles.footerCell} colSpan="5">
                        <strong>Grand Totals:</strong>
                      </td>
                      <td style={styles.footerCell}></td>
                      <td style={{...styles.footerCell, backgroundColor: '#fff5f5'}}></td>
                      <td style={{...styles.footerCell, backgroundColor: '#f0f9ff'}}></td>
                      <td style={styles.footerCell}>
                        <strong>₱{grandTotalRevenue.toFixed(2)}</strong>
                      </td>
                      <td style={{...styles.footerCell, backgroundColor: '#fff5f5'}}>
                        <strong>₱{grandTotalCost.toFixed(2)}</strong>
                      </td>
                      <td style={{
                        ...styles.footerCell, 
                        backgroundColor: '#f0f9ff',
                        color: grandTotalIncome >= 0 ? '#2e7d32' : '#c62828',
                        fontWeight: 'bold'
                      }}>
                        <strong>₱{grandTotalIncome.toFixed(2)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div style={styles.sideSection}>
          <div style={styles.section}>
            <h3 style={styles.sectionHeader}>Resupply History (Cost Incurred)</h3>
            {resupplyLoading ? (
              <div style={styles.placeholderCard}>
                <p style={styles.placeholderText}>Loading resupply data...</p>
              </div>
            ) : resupplyReport.length === 0 ? (
              <div style={styles.placeholderCard}>
                <p style={styles.placeholderText}>No resupply data for this {timeFilter === 'custom' ? 'date range' : timeFilter}</p>
                <p style={styles.placeholderSubText}>
                  Resupply history will appear here once items are restocked
                </p>
              </div>
            ) : (
              <div style={styles.reportList}>
                {resupplyReport.map((group, index) => (
                  <div key={index} style={styles.resupplyItem}>
                    <div style={styles.resupplyHeader}>
                      <p style={styles.reportDate}>{group.resupply_date}</p>
                      <div style={styles.creatorInfo}>
                        <span style={styles.creatorLabel}>Created by: </span>
                        <span style={styles.creatorValue}>{group.created_by || 'Unknown'}</span>
                        <span style={styles.creatorTime}>{group.created_at ? ` at ${group.created_at}` : ''}</span>
                      </div>
                      <p style={{...styles.reportAmount, color: '#c62828'}}>
                        Total Cost: ₱{group.totalCost?.toFixed(2) || '0.00'}
                      </p>
                    </div>
                    {group.items.map((item, idx) => (
                      <div key={idx} style={styles.resupplyDetail}>
                        <p style={styles.reportName}>
                          <strong>{item.product_name}</strong> from {item.supplier_name}
                        </p>
                        <p style={styles.reportDetails}>
                          Qty: {item.quantity} × ₱{item.unit_cost} = ₱{item.total_cost.toFixed(2)}
                          {item.expiration_date !== 'N/A' && ` | Exp: ${item.expiration_date}`}
                          {item.created_by && item.created_by !== 'Unknown' && ` | Added by: ${item.created_by}`}
                        </p>
                      </div>
                    ))}
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
    padding: '16px',
    backgroundColor: '#f5f7f9',
    minHeight: '100vh',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    '@media (min-width: 768px)': {
      padding: '24px',
    },
  },
  headerSection: {
    backgroundColor: '#ffffff',
    padding: '16px',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
    marginBottom: '20px',
    '@media (min-width: 768px)': {
      padding: '20px',
    },
  },
  header: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '8px',
    color: '#2c3e50',
    '@media (minWidth: 768px)': {
      fontSize: '28px',
    },
    '@media (maxWidth: 480px)': {
      fontSize: '20px',
    },
  },
  subheader: {
    fontSize: '20px',
    fontWeight: '600',
    marginBottom: '4px',
    color: '#34495e',
    '@media (minWidth: 768px)': {
      fontSize: '22px',
    },
    '@media (maxWidth: 480px)': {
      fontSize: '18px',
    },
  },
  description: {
    fontSize: '14px',
    marginBottom: '16px',
    color: '#7f8c8d',
    '@media (min-width: 768px)': {
      fontSize: '16px',
    },
  },
  filterContainer: {
    marginTop: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    backgroundColor: '#f8f9fa',
    padding: '16px',
    borderRadius: '10px',
    border: '1px solid #e9ecef',
    '@media (min-width: 768px)': {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
  },
  filterSelectorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    width: '100%',
    '@media (maxWidth: 768px)': {
      flexDirection: 'column',
      alignItems: 'stretch',
    },
  },
  filterLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#2c3e50',
    whiteSpace: 'nowrap',
    '@media (maxWidth: 480px)': {
      fontSize: '13px',
    },
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
    minWidth: '160px',
    '@media (maxWidth: 768px)': {
      width: '100%',
      minWidth: 'auto',
    },
  },
  dateRangeContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
    '@media (min-width: 768px)': {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '20px',
      marginLeft: 'auto',
    },
  },
  dateRangeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    '@media (maxWidth: 768px)': {
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: '8px',
    },
  },
  dateInputGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: '1',
    minWidth: '200px',
    '@media (maxWidth: 768px)': {
      width: '100%',
      minWidth: 'auto',
    },
  },
  dateLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#2c3e50',
    minWidth: '50px',
    '@media (maxWidth: 480px)': {
      fontSize: '13px',
      minWidth: '40px',
    },
  },
  dateInput: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    fontSize: '14px',
    flex: '1',
    minWidth: '140px',
    '@media (maxWidth: 768px)': {
      minWidth: 'auto',
      width: '100%',
    },
  },
  downloadContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    justifyContent: 'center',
    '@media (min-width: 768px)': {
      width: 'auto',
      marginLeft: 'auto',
      justifyContent: 'flex-end',
    },
  },
  downloadButton: {
    padding: '10px 16px',
    borderRadius: '8px',
    border: '2px solid #27ae60',
    backgroundColor: '#27ae60',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flex: '1',
    justifyContent: 'center',
    '@media (min-width: 768px)': {
      flex: 'none',
      minWidth: '100px',
    },
    '&:disabled': {
      opacity: '0.5',
      cursor: 'not-allowed',
    },
  },
  metricsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
    '@media (maxWidth: 640px)': {
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '12px',
    },
    '@media (maxWidth: 480px)': {
      gridTemplateColumns: '1fr',
    },
  },
  metricCard: {
    backgroundColor: '#ffffff',
    padding: '20px',
    borderRadius: '12px',
    textAlign: 'center',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
    borderLeft: '5px solid #3498db',
    '@media (maxWidth: 768px)': {
      padding: '16px',
    },
  },
  metricValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: '8px',
    '@media (min-width: 768px)': {
      fontSize: '28px',
    },
    '@media (maxWidth: 480px)': {
      fontSize: '20px',
    },
  },
  metricLabel: {
    fontSize: '14px',
    color: '#7f8c8d',
    marginBottom: '4px',
    fontWeight: '600',
    '@media (min-width: 768px)': {
      fontSize: '16px',
    },
  },
  metricSubLabel: {
    fontSize: '12px',
    color: '#95a5a6',
    '@media (min-width: 768px)': {
      fontSize: '14px',
    },
  },
  contentContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '20px',
    '@media (min-width: 1024px)': {
      gridTemplateColumns: '2fr 1fr',
    },
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
    '@media (maxWidth: 768px)': {
      padding: '16px',
    },
  },
  sectionHeaderContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
    flexWrap: 'wrap',
    gap: '10px',
    '@media (maxWidth: 480px)': {
      flexDirection: 'column',
      alignItems: 'stretch',
    },
  },
  sectionHeader: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#2c3e50',
    margin: '0',
    '@media (maxWidth: 480px)': {
      fontSize: '16px',
    },
  },
  dateFilter: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  dateLabel: {
    fontSize: '14px',
    color: '#7f8c8d',
    '@media (maxWidth: 480px)': {
      fontSize: '13px',
    },
  },
  dateValue: {
    fontSize: '14px',
    color: '#2c3e50',
    fontWeight: '500',
    '@media (maxWidth: 480px)': {
      fontSize: '13px',
    },
  },
  tableContainer: {
    overflowX: 'auto',
    borderRadius: '8px',
    border: '1px solid #e0e0e0',
    '@media (maxWidth: 768px)': {
      margin: '0 -8px',
      border: 'none',
    },
  },
  salesTable: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: '#ffffff',
    '@media (maxWidth: 768px)': {
      minWidth: '600px',
    },
  },
  tableHeader: {
    backgroundColor: '#3498db',
    color: 'white',
    padding: '12px 16px',
    textAlign: 'left',
    fontWeight: '600',
    fontSize: '14px',
    borderBottom: '1px solid #2980b9',
    '@media (maxWidth: 480px)': {
      padding: '10px 12px',
      fontSize: '13px',
    },
  },
  tableRowEven: {
    backgroundColor: '#f8f9fa',
  },
  tableRowOdd: {
    backgroundColor: '#ffffff',
  },
  tableCell: {
    padding: '12px 16px',
    borderBottom: '1px solid #e0e0e0',
    fontSize: '14px',
    color: '#2c3e50',
    '@media (maxWidth: 480px)': {
      padding: '10px 12px',
      fontSize: '13px',
    },
  },
  tableFooter: {
    backgroundColor: '#e8f5e8',
    fontWeight: 'bold',
  },
  footerCell: {
    padding: '12px 16px',
    borderTop: '2px solid #27ae60',
    fontSize: '14px',
    color: '#2c3e50',
    '@media (maxWidth: 480px)': {
      padding: '10px 12px',
      fontSize: '13px',
    },
  },
  reportList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  resupplyItem: {
    backgroundColor: '#f8f9fa',
    padding: '16px',
    borderRadius: '8px',
    borderLeft: '4px solid #e74c3c',
    marginBottom: '12px',
  },
  reportDate: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#7f8c8d',
    marginBottom: '4px',
    '@media (maxWidth: 480px)': {
      fontSize: '13px',
    },
  },
  reportName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#2c3e50',
    marginBottom: '4px',
    lineHeight: '1.4',
    '@media (min-width: 768px)': {
      fontSize: '16px',
    },
  },
  reportAmount: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#27ae60',
    margin: '0',
    '@media (maxWidth: 480px)': {
      fontSize: '14px',
    },
  },
  placeholderCard: {
    backgroundColor: '#f8f9fa',
    padding: '30px 20px',
    borderRadius: '8px',
    textAlign: 'center',
    '@media (maxWidth: 768px)': {
      padding: '24px 16px',
    },
  },
  placeholderText: {
    fontSize: '16px',
    color: '#7f8c8d',
    marginBottom: '8px',
    fontWeight: '500',
    '@media (maxWidth: 480px)': {
      fontSize: '14px',
    },
  },
  placeholderSubText: {
    fontSize: '14px',
    color: '#95a5a6',
    '@media (maxWidth: 480px)': {
      fontSize: '13px',
    },
  },
};