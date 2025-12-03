import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerUser } from '../services/UserService';

export default function SignupScreen() {
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('Staff'); // Default to Staff
  const [isOwnerSignup, setIsOwnerSignup] = useState(false);

  const handleRoleChange = (selectedRole) => {
    setRole(selectedRole);
    setIsOwnerSignup(selectedRole === 'Owner');
  };

  const handleRegister = async () => {
    // Basic validation
    if (!username || !fullName || !password || !confirmPassword) {
      alert('Please fill out all required fields.');
      return;
    }

    // If owner, store name is required
    if (role === 'Owner' && !storeName) {
      alert('Store name is required for owners.');
      return;
    }

    if (password !== confirmPassword) {
      alert('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      alert('Password must be at least 6 characters long.');
      return;
    }

    try {
      const result = await registerUser(username, password, role, fullName, role === 'Owner' ? storeName : '');
      if (result.success) {
        alert(`Account created successfully! You are registered as ${role}. Please login.`);
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

      {/* Role Selection */}
      <div style={styles.roleContainer}>
        <button
          style={{
            ...styles.roleButton,
            ...(role === 'Owner' ? styles.activeRoleButton : {})
          }}
          onClick={() => handleRoleChange('Owner')}
        >
          Register as Owner
        </button>
        <button
          style={{
            ...styles.roleButton,
            ...(role === 'Staff' ? styles.activeRoleButton : {})
          }}
          onClick={() => handleRoleChange('Staff')}
        >
          Register as Staff
        </button>
      </div>

      <div style={styles.roleInfo}>
        {role === 'Owner' ? 
          "As an owner, you'll have full access to manage your store, inventory, and staff." : 
          "As staff, you'll have limited access to process sales and view assigned tasks."}
      </div>

      <input
        type="text"
        placeholder="Username *"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        style={styles.input}
      />
      
      <input
        type="text"
        placeholder="Full Name *"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        style={styles.input}
      />
      
      {isOwnerSignup && (
        <input
          type="text"
          placeholder="Store Name *"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          style={styles.input}
        />
      )}
      
      <input
        type="password"
        placeholder="Password (min. 6 characters) *"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={styles.input}
      />
      
      <input
        type="password"
        placeholder="Confirm Password *"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        style={styles.input}
      />

      <button style={styles.button} onClick={handleRegister}>
        Create {role} Account
      </button>

      <p style={styles.footer}>
        Already have an account?{' '}
        <span style={styles.link} onClick={() => navigate('/')}>
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
  roleContainer: {
    display: 'flex',
    gap: '10px',
    marginBottom: '15px'
  },
  roleButton: {
    flex: 1,
    padding: '10px',
    border: '2px solid #ddd',
    backgroundColor: '#f5f5f5',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  },
  activeRoleButton: {
    backgroundColor: '#4CAF50',
    color: 'white',
    borderColor: '#4CAF50'
  },
  roleInfo: {
    padding: '10px',
    backgroundColor: '#f0f8ff',
    borderRadius: '6px',
    marginBottom: '20px',
    fontSize: '14px',
    color: '#333'
  },
};
