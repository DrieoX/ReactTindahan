import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignUpScreen';
import DashboardScreen from './screens/DashboardScreen';
import InventoryScreen from './screens/InventoryScreen';
import ResupplyScreen from './screens/ResupplyScreen';
import SalesScreen from './screens/SalesScreen';
import ReportsScreen from './screens/ReportsScreen';
import SuppliersScreen from './screens/SuppliersScreen';
import BackupScreen from './screens/BackupScreen';
import MainLayout from './components/MainLayout';
import { dataService } from './services/DataService';

import { db } from './db';
import { initAutoBackup, checkAndRunBackup } from './services/autoBackup';

// 🔐 Capacitor storage permission - Dynamically import to avoid build errors
let Filesystem;
const isCapacitor = typeof window !== 'undefined' && window.Capacitor;

if (isCapacitor) {
  try {
    import('@capacitor/filesystem').then(module => {
      Filesystem = module.Filesystem;
    }).catch(error => {
      console.log('Filesystem plugin not available:', error);
    });
  } catch (error) {
    console.log('Capacitor import failed, running in web mode');
  }
}

// 🔒 Protected Route Middleware
function ProtectedRoute({ element, userMode, allowedRoles = [] }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  if (!userMode) {
    return <Navigate to="/" replace />;
  }
  
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return element;
}

// 🔹 Client stack
function ClientStack({ handleLogout, userMode }) {
  return (
    <MainLayout userMode={userMode} handleLogout={handleLogout}>
      <Routes>
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="/inventory" element={<InventoryScreen />} />
        <Route path="/resupply" element={<ResupplyScreen />} />
        <Route path="/sales" element={<SalesScreen />} />
        <Route path="/suppliers" element={<SuppliersScreen />} />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </MainLayout>
  );
}

// 🔹 Server stack
function ServerStack({ handleLogout, userMode }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isOwner = user.role === 'Owner';
  
  return (
    <MainLayout userMode={userMode} handleLogout={handleLogout}>
      <Routes>
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="/inventory" element={<InventoryScreen />} />
        <Route path="/resupply" element={<ResupplyScreen />} />
        <Route path="/sales" element={<SalesScreen />} />
        <Route path="/reports" element={<ReportsScreen />} />
        <Route path="/suppliers" element={<SuppliersScreen />} />
        {isOwner && <Route path="/backup" element={<BackupScreen />} />}
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </MainLayout>
  );
}

// 🔹 Auth stack - Updated to use handleLogin
function AuthStack({ handleLogin }) {
  return (
    <Routes>
      <Route path="/" element={<LoginScreen handleLogin={handleLogin} />} />
      <Route path="/signup" element={<SignupScreen />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  const [userMode, setUserMode] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ Define handleLogin INSIDE the App component
  const handleLogin = (user) => {
    const mode = user.role === 'Owner' ? 'server' : 'client';
    setUserMode(mode);
    localStorage.setItem('userMode', mode);
    localStorage.setItem('user', JSON.stringify(user));
    
    // Update data service with mode
    dataService.setUserMode(mode);
  };

  useEffect(() => {
    const init = async () => {
      try {
        // Initialize auto backup system
        initAutoBackup();
        
        // 🔐 REQUEST STORAGE PERMISSION (Capacitor Android/iOS)
        if (isCapacitor && Filesystem) {
          try {
            // Check if we have permission
            const hasPermission = await Filesystem.checkPermissions();
            
            // Request permission if needed
            if (hasPermission.publicStorage !== 'granted') {
              try {
                await Filesystem.requestPermissions();
                console.log('✅ Storage permission requested');
              } catch (permError) {
                console.warn('⚠️ Permission request failed (may not be needed):', permError);
              }
            } else {
              console.log('✅ Storage permission already granted');
            }
          } catch (permissionError) {
            console.warn('⚠️ Permission check failed, continuing:', permissionError);
          }
        }

        // Initialize database
        await db.open();
        console.log('✅ Database initialized');

        // Restore user mode from localStorage
        const savedMode = localStorage.getItem('userMode');
        if (savedMode && (savedMode === 'client' || savedMode === 'server')) {
          setUserMode(savedMode);
          // Update data service with saved mode
          dataService.setUserMode(savedMode);
        }

        setLoading(false);
        
        // Schedule auto backup check for owners
        // Wait 5 seconds for app to fully initialize
        setTimeout(() => {
          checkAndRunBackup().then(success => {
            if (success) {
              console.log('✅ Auto backup completed on startup');
            } else {
              console.log('ℹ️ Auto backup not needed or not run');
            }
          }).catch(error => {
            console.error('❌ Auto backup check failed:', error);
          });
        }, 5000);
        
      } catch (err) {
        console.error('❌ Initialization error:', err);
        setLoading(false);
      }
    };

    init();
  }, []);

  const handleLogout = () => {
    setUserMode(null);
    localStorage.removeItem('user');
    localStorage.removeItem('userMode');
    sessionStorage.clear();
    window.location.href = '/';
  };

  if (loading) {
    return (
      <div style={{ 
        textAlign: 'center', 
        marginTop: '40vh', 
        fontSize: 20,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ marginBottom: '20px' }}>
          Loading TindaTrack...
        </div>
        <div 
          style={{
            width: '50px',
            height: '50px',
            border: '5px solid #f3f3f3',
            borderTop: '5px solid #3498db',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}
        />
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {!userMode ? (
          <Route path="/*" element={<AuthStack handleLogin={handleLogin} />} />
        ) : userMode === 'server' ? (
          <Route
            path="/*"
            element={
              <ProtectedRoute 
                userMode={userMode} 
                element={<ServerStack handleLogout={handleLogout} userMode={userMode} />} 
              />
            }
          />
        ) : (
          <Route
            path="/*"
            element={
              <ProtectedRoute 
                userMode={userMode} 
                element={<ClientStack handleLogout={handleLogout} userMode={userMode} />} 
              />
            }
          />
        )}
      </Routes>
    </Router>
  );
}