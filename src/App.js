import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

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

// 🔹 Client stack
function ClientStack({ handleLogout, userMode }) {
  return (
    <MainLayout userMode={userMode} handleLogout={handleLogout}>
      <Routes>
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="/inventory" element={<InventoryScreen />} />
        <Route path="/resupply" element={<ResupplyScreen />} />
        <Route path="/suppliers" element={<SuppliersScreen />} />
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
    </Routes>
  );
}

export default function App() {
  const [userMode, setUserMode] = useState(null);

  useEffect(() => {
    const initDB = async () => {
      try {
        await db.open();
        console.log('✅ Database initialized');
      } catch (err) {
        console.error('❌ Error initializing DB:', err);
      }
    };
    initDB();

    // Restore login session
    const savedMode = localStorage.getItem('userMode');
    if (savedMode) {
      setUserMode(savedMode);
    }
  }, []);

  const handleLogout = () => {
    setUserMode(null);
    localStorage.removeItem('user');
    localStorage.removeItem('userMode');
    sessionStorage.clear();
    window.location.href = '/'; // force reset to login
  };

  return (
    <Router>
      {userMode === 'server' ? (
        <ServerStack handleLogout={handleLogout} userMode={userMode} />
      ) : userMode === 'client' ? (
        <ClientStack handleLogout={handleLogout} userMode={userMode} />
      ) : (
        <AuthStack
          setUserMode={(mode) => {
            setUserMode(mode);
            localStorage.setItem('userMode', mode);
          }}
        />
      )}
    </Router>
  );
}
