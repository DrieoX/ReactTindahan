import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser } from '../services/UserService';

export default function LoginScreen({ setUserMode }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('Client');
  const navigate = useNavigate();

  const handleLogin = async () => {
    const result = await loginUser(username, password);
    if (result.success) {
      alert(`Welcome! Logged in as ${result.user.role} in ${mode} mode`);

      // Save to localStorage
      localStorage.setItem("user", JSON.stringify(result.user));
      localStorage.setItem("userMode", mode);

      setUserMode(mode.toLowerCase());
      navigate('/dashboard', { replace: true });
    } else {
      alert(result.error);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.icon}>🛒</div>
      <h2 style={styles.title}>Sign in to your account</h2>
      <p style={styles.subtitle}>Access your POS system</p>

      <label style={styles.label}>Email address</label>
      <input
        type="email"
        placeholder="Enter your email"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        style={styles.input}
      />

      <label style={styles.label}>Password</label>
      <input
        type="password"
        placeholder="Enter your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={styles.input}
      />

      <select
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        style={styles.select}
      >
        <option value="Server">Server</option>
        <option value="Client">Client</option>
      </select>

      <button style={styles.button} onClick={handleLogin}>
        Sign in
      </button>

      <p style={styles.footer}>
        Don’t have an account?{' '}
        <span
          style={styles.link}
          onClick={() => navigate('/signup')}
        >
          Sign up here
        </span>
      </p>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '400px',
    margin: '50px auto',
    padding: '24px',
    backgroundColor: '#F9FAFB',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    textAlign: 'center',
    fontFamily: 'Arial, sans-serif',
  },
  icon: { fontSize: '48px', marginBottom: '16px' },
  title: { fontSize: '22px', fontWeight: '600', marginBottom: '4px', color: '#111827' },
  subtitle: { fontSize: '14px', color: '#6B7280', marginBottom: '24px' },
  label: { display: 'block', textAlign: 'left', marginBottom: '6px', marginTop: '12px', fontSize: '14px', color: '#374151' },
  input: { width: '100%', padding: '12px', marginBottom: '12px', borderRadius: '8px', border: '1px solid #D1D5DB' },
  select: { width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '8px', border: '1px solid #D1D5DB' },
  button: { width: '100%', padding: '14px', backgroundColor: '#3B82F6', color: '#fff', fontWeight: '600', border: 'none', borderRadius: '8px', cursor: 'pointer', marginBottom: '12px' },
  footer: { fontSize: '14px', color: '#6B7280' },
  link: { color: '#3B82F6', fontWeight: '500', cursor: 'pointer' },
};
