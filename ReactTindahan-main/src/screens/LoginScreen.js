import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser } from '../services/UserService';
import { dataService } from '../services/DataService'; // Import DataService

export default function LoginScreen({ handleLogin }) { // Changed from setUserMode to handleLogin
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!username || !password) {
      alert('Please enter both username and password.');
      return;
    }

    setLoading(true);
    try {
      const result = await loginUser(username, password);
      
      if (result.success) {
        const user = result.user;
        const userRole = user.role;
        
        alert(`Welcome ${user.full_name}! Logged in as ${userRole}`);
        
        // Save to localStorage
        localStorage.setItem("user", JSON.stringify(user));
        localStorage.setItem("userMode", userRole === 'Owner' ? 'server' : 'client');
        
        // Update DataService mode
        dataService.setUserMode(userRole === 'Owner' ? 'server' : 'client');
        
        // Call handleLogin with user object
        if (handleLogin) {
          handleLogin(user);
        }
        
        navigate('/dashboard', { replace: true });
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('An error occurred during login. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.icon}>🛒</div>
        <h2 style={styles.title}>Sign in to your account</h2>
        <p style={styles.subtitle}>Access your POS system</p>

        <div style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Username</label>
            <input
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={handleKeyPress}
              style={styles.input}
              disabled={loading}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <div style={styles.passwordWrapper}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                style={styles.passwordInput}
                disabled={loading}
              />
              <button
                type="button"
                onClick={togglePasswordVisibility}
                style={styles.passwordToggle}
                disabled={loading}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button 
            style={loading ? {...styles.button, ...styles.buttonLoading} : styles.button} 
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <>
                <span style={styles.spinner}></span>
                Signing in...
              </>
            ) : 'Sign in'}
          </button>

          <p style={styles.footer}>
            Don't have an account?{' '}
            <span
              style={styles.link}
              onClick={() => navigate('/signup')}
            >
              Sign up here
            </span>
          </p>
        </div>
      </div>
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
    maxWidth: '420px',
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
    color: '#3b82f6',
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
    marginBottom: '32px',
    textAlign: 'center',
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
    padding: '14px',
    fontSize: '16px',
    fontWeight: '600',
    color: 'white',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    marginTop: '8px',
    transition: 'background-color 0.2s ease',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '10px',
  },
  buttonLoading: {
    opacity: 0.8,
    cursor: 'not-allowed',
  },
  spinner: {
    width: '18px',
    height: '18px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTop: '2px solid white',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  footer: {
    marginTop: '24px',
    fontSize: '14px',
    color: '#6b7280',
    textAlign: 'center',
  },
  link: {
    color: '#3b82f6',
    fontWeight: '600',
    cursor: 'pointer',
    textDecoration: 'underline',
    transition: 'color 0.2s ease',
  },
};

// Add CSS animation for spinner
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    background-color: white;
  }
  
  button:hover:not(:disabled) {
    opacity: 0.9;
  }
  
  .passwordToggle:hover {
    color: #3b82f6;
    background-color: #f3f4f6;
  }
`;
document.head.appendChild(styleSheet);