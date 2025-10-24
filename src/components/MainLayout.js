import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FaHome,
  FaCashRegister,
  FaBoxes,
  FaChartBar,
  FaRedo,
  FaTruck,
  FaBars,
  FaSignOutAlt 
} from 'react-icons/fa';

const SIDEBAR_WIDTH = 200;

export default function MainLayout({ children, userMode, handleLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [isLogoutClicked, setIsLogoutClicked] = useState(false);

  const mode = userMode ? userMode.toLowerCase() : 'client';

  const menuItems = [
    { name: 'Dashboard', label: 'Home', icon: <FaHome /> },
    { name: 'Inventory', label: 'Inventory', icon: <FaBoxes /> },
    { name: 'Resupply', label: 'Resupply', icon: <FaRedo /> },
    { name: 'Suppliers', label: 'Suppliers', icon: <FaTruck /> },
  ];

  if (mode === 'server') {
    menuItems.push(
      { name: 'Sales', label: 'Sales', icon: <FaCashRegister /> },
      { name: 'Reports', label: 'Reports', icon: <FaChartBar /> }
    );
  }

  const currentPath = location.pathname.toLowerCase();

  const handleLogoutClick = () => {
    setIsLogoutClicked(true);
    setTimeout(() => {
      handleLogout();
      setSidebarVisible(false);
    }, 300);
  };

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div
        style={{
          ...styles.sidebar,
          left: sidebarVisible ? 0 : -SIDEBAR_WIDTH,
        }}
      >
        {/* Menu Items */}
        {menuItems.map((item, index) => {
          const itemPath = `/${item.name.toLowerCase()}`;
          const isActive = currentPath === itemPath;

          return (
            <React.Fragment key={item.name}>
              <button
                onClick={() => {
                  navigate(itemPath);
                  setSidebarVisible(false);
                }}
                style={{
                  ...styles.menuButton,
                  backgroundColor: isActive ? '#e5e7eb' : '#ffffff',
                  boxShadow: isActive
                    ? 'inset 0 2px 6px rgba(0,0,0,0.3)'
                    : '0 3px 6px rgba(0,0,0,0.1)',
                  transform: isActive ? 'translateY(2px)' : 'translateY(0)',
                  color: isActive ? '#111827' : '#374151',
                  fontWeight: isActive ? 700 : 500,
                }}
                onMouseDown={(e) =>
                  (e.currentTarget.style.transform = 'translateY(2px)')
                }
                onMouseUp={(e) =>
                  (e.currentTarget.style.transform = isActive ? 'translateY(2px)' : 'translateY(0)')
                }
              >
                <span style={{
                  ...styles.icon,
                  color: isActive ? '#3b82f6' : '#6b7280'
                }}>
                  {item.icon}
                </span>
                {item.label}
              </button>

              {/* Divider between menu items */}
              {index < menuItems.length - 1 && <div style={styles.divider} />}
            </React.Fragment>
          );
        })}

        {/* Spacer to push logout to bottom */}
        <div style={styles.spacer} />

        {/* Logout Button in Sidebar */}
        <div style={styles.logoutSection}>
          <div style={styles.divider} />
          <button
            onClick={handleLogoutClick}
            style={{
              ...styles.sidebarLogoutButton,
              backgroundColor: isLogoutClicked ? '#ef4444' : '#0ea5e9',
              transform: isLogoutClicked ? 'translateY(2px)' : 'translateY(0)',
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'translateY(2px)';
            }}
            onMouseUp={(e) => {
              if (!isLogoutClicked) {
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            <span style={styles.logoutIcon}>
              <FaSignOutAlt />
            </span>
            {isLogoutClicked ? 'Logging out...' : 'Logout'}
          </button>
        </div>
      </div>

      {/* Overlay when sidebar is open */}
      {sidebarVisible && (
        <div
          style={styles.overlay}
          onClick={() => setSidebarVisible(false)}
        />
      )}

      {/* Top bar */}
      <div style={styles.topBar}>
        <button
          onClick={() => setSidebarVisible(!sidebarVisible)}
          style={styles.menuTitle}
        >
          <FaBars style={{ marginRight: '8px' }} />
          Menu
        </button>

        {/* Removed Logout from top bar - keeping spacer for balance */}
        <div style={styles.topBarSpacer} />
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
    zIndex: 20,
  },
  topBarSpacer: {
    width: '60px',
  },
  sidebar: {
    position: 'fixed',
    top: 50,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: '#f3f4f6',
    padding: '20px 12px',
    transition: 'left 0.3s ease',
    zIndex: 30,
    boxShadow: '2px 0 5px rgba(0,0,0,0.2)',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  overlay: {
    position: 'fixed',
    top: 50,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 25,
  },
  menuButton: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '12px 16px',
    margin: '8px 0',
    border: 'none',
    textAlign: 'left',
    fontSize: 16,
    borderRadius: 8,
    cursor: 'pointer',
    backgroundColor: '#fff',
    transition: 'all 0.2s ease',
    gap: '12px',
  },
  icon: {
    fontSize: '16px',
    width: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.2s ease',
  },
  logoutIcon: {
    fontSize: '16px',
    width: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#d1d5db',
    margin: '4px 0',
  },
  spacer: {
    flex: 1,
  },
  logoutSection: {
    marginTop: 'auto',
    paddingTop: '10px',
  },
  sidebarLogoutButton: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '12px 16px',
    margin: '8px 0',
    border: 'none',
    textAlign: 'left',
    fontSize: 16,
    borderRadius: 8,
    cursor: 'pointer',
    color: '#ffffff',
    fontWeight: 600,
    transition: 'all 0.3s ease',
    gap: '12px',
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#111827',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  mainContent: {
    flex: 1,
    padding: 20,
    marginTop: 50,
    width: '100%',
    height: 'calc(100vh - 50px)',
    overflowY: 'auto',
  },
};