import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const SIDEBAR_WIDTH = 200;

export default function MainLayout({ children, userMode, handleLogout }) {
  const navigate = useNavigate();
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const mode = userMode ? userMode.toLowerCase() : 'client';

  const menuItems = [
    { name: 'Dashboard', label: 'Home' },
    { name: 'Inventory', label: 'Inventory' },
    { name: 'Resupply', label: 'Resupply' },
    { name: 'Suppliers', label: 'Suppliers' },
  ];

  if (mode === 'server') {
    menuItems.push(
      { name: 'Sales', label: 'Sales' },
      { name: 'Reports', label: 'Reports' }
    );
  }

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div
        style={{
          ...styles.sidebar,
          left: sidebarVisible ? 0 : -SIDEBAR_WIDTH,
        }}
      >
        {menuItems.map((item) => (
          <button
            key={item.name}
            onClick={() => {
              navigate(`/${item.name.toLowerCase()}`);
              setSidebarVisible(false);
            }}
            style={styles.menuButton}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Top bar */}
      <div style={styles.topBar}>
        <button
          onClick={() => setSidebarVisible(!sidebarVisible)}
          style={styles.menuTitle}
        >
          ☰ Menu
        </button>

        <button onClick={handleLogout} style={styles.logoutButton}>
          Logout
        </button>
      </div>

      {/* Main content */}
      <div style={styles.mainContent}>{children}</div>
    </div>
  );
}



const styles = {
  container: {
    display: 'flex',
    flexDirection: 'row',
    position: 'relative',
    minHeight: '100vh',
  },
  topBar: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    backgroundColor: '#f9fafb',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    zIndex: 5,
  },
  sidebar: {
    position: 'fixed',
    top: 50,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: '#f0f0f0',
    padding: '20px 12px',
    transition: 'left 0.3s',
    zIndex: 10,
  },
  menuButton: {
    display: 'block',
    width: '100%',
    padding: '8px 0',
    margin: '6px 0',
    background: 'none',
    border: 'none',
    textAlign: 'left',
    fontSize: 16,
    color: '#1f2937',
    cursor: 'pointer',
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#111827',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
  logoutButton: {
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#ef4444',
    border: 'none',
    borderRadius: 6,
    padding: '6px 12px',
    cursor: 'pointer',
  },
  mainContent: {
    flex: 1,
    padding: 20,
    marginTop: 50,
    marginLeft: SIDEBAR_WIDTH,
  },
};
