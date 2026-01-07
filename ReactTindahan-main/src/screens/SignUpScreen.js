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
  const [role, setRole] = useState('Staff');
  const [isOwnerSignup, setIsOwnerSignup] = useState(false);
  const [loading, setLoading] = useState(false);

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

    // Validate username (alphanumeric only)
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
      alert('Username can only contain letters, numbers, and underscores.');
      return;
    }

    setLoading(true);
    try {
      const result = await registerUser(username, password, role, fullName, role === 'Owner' ? storeName : '');
      if (result.success) {
        alert(`Account created successfully! You are registered as ${role}. Please login.`);
        navigate('/');
      } else {
        alert(result.error || 'Registration failed. Please try again.');
      }
    } catch (err) {
      console.error('Registration error:', err);
      alert('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleRegister();
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
          disabled={loading}
        >
          Register as Owner
        </button>
        <button
          style={{
            ...styles.roleButton,
            ...(role === 'Staff' ? styles.activeRoleButton : {})
          }}
          onClick={() => handleRoleChange('Staff')}
          disabled={loading}
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
        onKeyPress={handleKeyPress}
        style={styles.input}
        disabled={loading}
      />
      
      <input
        type="text"
        placeholder="Full Name *"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        onKeyPress={handleKeyPress}
        style={styles.input}
        disabled={loading}
      />
      
      {isOwnerSignup && (
        <input
          type="text"
          placeholder="Store Name *"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          onKeyPress={handleKeyPress}
          style={styles.input}
          disabled={loading}
        />
      )}
      
      <input
        type="password"
        placeholder="Password (min. 6 characters) *"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyPress={handleKeyPress}
        style={styles.input}
        disabled={loading}
      />
      
      <input
        type="password"
        placeholder="Confirm Password *"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        onKeyPress={handleKeyPress}
        style={styles.input}
        disabled={loading}
      />

      <button 
        style={styles.button} 
        onClick={handleRegister}
        disabled={loading}
      >
        {loading ? 'Creating Account...' : `Create ${role} Account`}
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
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f8fafc',
    padding: '20px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: '480px',
    backgroundColor: 'white',
    borderRadius: '16px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
    padding: '40px 32px',
    border: '1px solid #e5e7eb',
  },
  icon: {
    fontSize: '48px',
    marginBottom: '20px',
    textAlign: 'center',
    color: '#10b981',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    marginBottom: '8px',
    color: '#111827',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: '15px',
    color: '#6b7280',
    marginBottom: '24px',
    textAlign: 'center',
  },
  roleContainer: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
  },
  roleButton: {
    flex: 1,
    padding: '14px',
    fontSize: '15px',
    fontWeight: '500',
    border: '2px solid #e5e7eb',
    backgroundColor: '#f9fafb',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    color: '#6b7280',
  },
  activeRoleButton: {
    backgroundColor: '#10b981',
    color: 'white',
    borderColor: '#10b981',
  },
  roleInfo: {
    padding: '16px',
    backgroundColor: '#f0f9ff',
    borderRadius: '10px',
    marginBottom: '24px',
    fontSize: '14px',
    color: '#0369a1',
    border: '1px solid #bae6fd',
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '15px',
    border: '1px solid #d1d5db',
    borderRadius: '10px',
    backgroundColor: '#f9fafb',
    transition: 'all 0.2s ease',
    boxSizing: 'border-box',
  },
  passwordWrapper: {
    position: 'relative',
    width: '100%',
  },
  passwordInput: {
    width: '100%',
    padding: '12px 48px 12px 16px',
    fontSize: '15px',
    border: '1px solid #d1d5db',
    borderRadius: '10px',
    backgroundColor: '#f9fafb',
    transition: 'all 0.2s ease',
    boxSizing: 'border-box',
  },
  passwordToggle: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '18px',
    color: '#6b7280',
    padding: '4px',
    borderRadius: '4px',
    transition: 'color 0.2s ease',
  },
  button: {
    width: '100%',
    padding: '16px',
    fontSize: '16px',
    fontWeight: '600',
    color: 'white',
    backgroundColor: '#10b981',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    marginTop: '16px',
    transition: 'background-color 0.2s ease',
  },
  footer: {
    marginTop: '24px',
    fontSize: '14px',
    color: '#6b7280',
    textAlign: 'center',
  },
  link: {
    color: '#10b981',
    fontWeight: '600',
    cursor: 'pointer',
    textDecoration: 'underline',
    transition: 'color 0.2s ease',
  },
};

// Add CSS for focus states
const signupStyleSheet = document.createElement('style');
signupStyleSheet.textContent = `
  input:focus {
    outline: none;
    border-color: #10b981;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
    background-color: white;
  }
  
  button:hover:not(:disabled) {
    opacity: 0.9;
  }
  
  .roleButton:hover {
    border-color: #10b981;
    color: #10b981;
  }
  
  .passwordToggle:hover {
    color: #10b981;
    background-color: #f3f4f6;
  }
`;
document.head.appendChild(signupStyleSheet);