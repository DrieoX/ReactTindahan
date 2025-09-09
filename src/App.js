import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

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

// 🔹 Logout button
const LogoutButton = ({ handleLogout }) => (
  <button
    onClick={handleLogout}
    style={{ marginLeft: 15, color: 'red', fontWeight: 'bold', cursor: 'pointer' }}
  >
    Logout
  </button>
);

// 🔹 Client stack
function ClientStack({ handleLogout, userMode }) {
  return (
    <MainLayout userMode={userMode}>
      <nav style={{ marginBottom: 20 }}>
        <Link to="/dashboard">Dashboard</Link> |{' '}
        <Link to="/inventory">Inventory</Link> |{' '}
        <Link to="/resupply">Resupply</Link> |{' '}
        <Link to="/suppliers">Suppliers</Link>
        <LogoutButton handleLogout={handleLogout} />
      </nav>
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
    <MainLayout userMode={userMode}>
      <nav style={{ marginBottom: 20 }}>
        <Link to="/dashboard">Dashboard</Link> |{' '}
        <Link to="/inventory">Inventory</Link> |{' '}
        <Link to="/resupply">Resupply</Link> |{' '}
        <Link to="/sales">Sales</Link> |{' '}
        <Link to="/reports">Reports</Link> |{' '}
        <Link to="/suppliers">Suppliers</Link>
        <LogoutButton handleLogout={handleLogout} />
      </nav>
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
  const [userMode, setUserMode] = useState(null); // server | client | null

  useEffect(() => {
    const initDB = async () => {
      try {
        await db.open(); // Dexie auto initializes tables
        console.log('✅ Database initialized');
      } catch (err) {
        console.error('❌ Error initializing DB:', err);
      }
    };
    initDB();
  }, []);

  const handleLogout = () => {
    setUserMode(null);
    window.location.href = '/'; // redirect to login
  };

  return (
    <Router>
      {userMode === 'server' ? (
        <ServerStack handleLogout={handleLogout} userMode={userMode} />
      ) : userMode === 'client' ? (
        <ClientStack handleLogout={handleLogout} userMode={userMode} />
      ) : (
        <AuthStack setUserMode={setUserMode} />
      )}
    </Router>
  );
}
