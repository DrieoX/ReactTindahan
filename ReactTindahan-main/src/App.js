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
import MainLayout from './components/MainLayout';

import { db } from './db';

// 🔒 Protected Route Middleware
function ProtectedRoute({ element, userMode }) {
  if (!userMode) {
    return <Navigate to="/" replace />;
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
        <Route path="/suppliers" element={<SuppliersScreen />} />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </MainLayout>
  );
}

// 🔹 Server stack
function ServerStack({ handleLogout, userMode }) {
  return (
    <MainLayout userMode={userMode} handleLogout={handleLogout}>
      <Routes>
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="/inventory" element={<InventoryScreen />} />
        <Route path="/resupply" element={<ResupplyScreen />} />
        <Route path="/sales" element={<SalesScreen />} />
        <Route path="/reports" element={<ReportsScreen />} />
        <Route path="/suppliers" element={<SuppliersScreen />} />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </MainLayout>
  );
}

// 🔹 Auth stack
function AuthStack({ setUserMode }) {
  return (
    <Routes>
      <Route path="/" element={<LoginScreen setUserMode={setUserMode} />} />
      <Route path="/signup" element={<SignupScreen />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  const [userMode, setUserMode] = useState(null);
  const [loading, setLoading] = useState(true); // ⏳ Prevent white screen

  useEffect(() => {
    const init = async () => {
      try {
        await db.open();
        console.log('✅ Database initialized');
      } catch (err) {
        console.error('❌ Error initializing DB:', err);
      }

      const savedMode = localStorage.getItem('userMode');
      if (savedMode) setUserMode(savedMode);
      setLoading(false);
    };

    init();
  }, []);

  const handleLogout = () => {
    setUserMode(null);
    localStorage.removeItem('user');
    localStorage.removeItem('userMode');
    sessionStorage.clear();
    window.location.href = '/'; // full reset
  };

  if (loading) {
    // Prevent blank flash
    return (
      <div style={{ textAlign: 'center', marginTop: '40vh', fontSize: 20 }}>
        Loading SmartTindahan...
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {!userMode ? (
          // Not logged in
          <>
            <Route path="/*" element={<AuthStack setUserMode={setUserMode} />} />
          </>
        ) : userMode === 'server' ? (
          // Server user, protected
          <Route
            path="/*"
            element={<ProtectedRoute userMode={userMode} element={<ServerStack handleLogout={handleLogout} userMode={userMode} />} />}
          />
        ) : (
          // Client user, protected
          <Route
            path="/*"
            element={<ProtectedRoute userMode={userMode} element={<ClientStack handleLogout={handleLogout} userMode={userMode} />} />}
          />
        )}
      </Routes>
    </Router>
  );
}