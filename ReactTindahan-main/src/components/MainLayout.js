import React, { useState } from 'react';
import { FaDatabase } from 'react-icons/fa';
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
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isOwner = user?.role === 'Owner';

  const menuItems = [
    { name: 'Dashboard', label: 'Home', icon: <FaHome /> },
    { name: 'Inventory', label: 'Inventory', icon: <FaBoxes /> },
    { name: 'Resupply', label: 'Resupply', icon: <FaRedo /> },
    { name: 'Suppliers', label: 'Suppliers', icon: <FaTruck /> },
    { name: 'Sales', label: 'Sales', icon: <FaCashRegister /> },
  ];

  // Add Reports for server mode
  if (mode === 'server') {
    menuItems.push(
      { name: 'Reports', label: 'Reports', icon: <FaChartBar /> }
    );
    
    // Add Backup for owners only in server mode
    if (isOwner) {
      menuItems.push(
        { name: 'Backup', label: 'Backup', icon: <FaDatabase /> }
      );
    }
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
          left: sidebarVisible ? 0 : -SIDEBAR_WIDTH - 20,
          opacity: sidebarVisible ? 1 : 0,
          pointerEvents: sidebarVisible ? 'auto' : 'none',
        }}
      >
        {/* User Info */}
        <div style={styles.userInfo}>
          <div style={styles.userAvatar}>
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div style={styles.userDetails}>
            <p style={styles.userName}>{user?.username || 'User'}</p>
            <p style={styles.userRole}>{user?.role || 'User'}</p>
          </div>
        </div>
        
        <div style={styles.divider} />

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

        <div style={styles.userBadge}>
          <span style={styles.userBadgeName}>{user?.username || 'User'}</span>
          <span style={styles.userBadgeRole}>{user?.role || 'User'}</span>
        </div>
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
    overflow: 'hidden',
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
  userBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#e5e7eb',
    padding: '6px 12px',
    borderRadius: '20px',
  },
  userBadgeName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1f2937',
  },
  userBadgeRole: {
    fontSize: '12px',
    color: '#6b7280',
    backgroundColor: '#d1d5db',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  sidebar: {
    position: 'fixed',
    top: 50,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: '#f3f4f6',
    padding: '20px 12px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    zIndex: 30,
    boxShadow: '2px 0 10px rgba(0,0,0,0.15)',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    transform: 'translateX(0)',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    marginBottom: '16px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  userAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: '#3b82f6',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '18px',
    marginRight: '12px',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontWeight: '600',
    fontSize: '14px',
    color: '#1f2937',
    margin: 0,
    marginBottom: '2px',
  },
  userRole: {
    fontSize: '12px',
    color: '#6b7280',
    margin: 0,
  },
  overlay: {
    position: 'fixed',
    top: 50,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 25,
    backdropFilter: 'blur(2px)',
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
    boxSizing: 'border-box',
  },
  icon: {
    fontSize: '16px',
    width: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.2s ease',
    flexShrink: 0,
  },
  logoutIcon: {
    fontSize: '16px',
    width: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    flexShrink: 0,
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
    width: '100%',
    boxSizing: 'border-box',
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
    boxSizing: 'border-box',
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
    padding: '8px 12px',
    borderRadius: 6,
    transition: 'background-color 0.2s ease',
  },
  mainContent: {
    flex: 1,
    padding: 20,
    marginTop: 50,
    width: '100%',
    height: 'calc(100vh - 50px)',
    overflowY: 'auto',
    boxSizing: 'border-box',
  },
};