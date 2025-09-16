import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerUser } from '../services/UserService';

export default function SignupScreen() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleRegister = async () => {
    if (!fullName || !storeName || !email || !password || !confirmPassword) {
      alert('Please fill out all fields.');
      return;
    }
    if (password !== confirmPassword) {
      alert('Passwords do not match.');
      return;
    }

    try {
      const result = await registerUser(email, password, 'Owner', fullName, storeName);
      if (result.success) {
        alert('User registered! Please login.');
        navigate('/');
      } else {
        alert(result.error);
      }
    } catch (err) {
      console.error('Registration error:', err);
      alert('Something went wrong. Please try again.');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.icon}>🛒</div>

      <h2 style={styles.title}>Create your account</h2>
      <p style={styles.subtitle}>
        Start managing your business with our POS system
      </p>

      <input
        type="text"
        placeholder="Full Name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        style={styles.input}
      />
      <input
        type="text"
        placeholder="Name of the Store"
        value={storeName}
        onChange={(e) => setStoreName(e.target.value)}
        style={styles.input}
      />
      <input
        type="email"
        placeholder="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={styles.input}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={styles.input}
      />
      <input
        type="password"
        placeholder="Confirm Password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        style={styles.input}
      />

      <button style={styles.button} onClick={handleRegister}>
        Create account
      </button>

      <p style={styles.footer}>
        Already have an account?{' '}
        <span style={styles.link} onClick={() => navigate('/login')}>
          Sign in here
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
  title: {
    fontSize: '22px',
    fontWeight: '600',
    marginBottom: '4px',
    color: '#111827',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: '14px',
    color: '#6B7280',
    marginBottom: '24px',
    textAlign: 'center',
  },
  input: {
    width: '100%',
    padding: '12px',
    marginBottom: '15px',
    borderRadius: '8px',
    border: '1px solid #D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  button: {
    width: '100%',
    padding: '14px',
    backgroundColor: '#3B82F6',
    color: '#fff',
    fontWeight: '600',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '24px',
  },
  footer: {
    marginTop: '20px',
    fontSize: '14px',
    color: '#6B7280',
    textAlign: 'center',
  },
  link: { color: '#3B82F6', fontWeight: '500', cursor: 'pointer' },
};
