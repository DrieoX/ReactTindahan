// UserService.js
import { dataService } from '../services/DataService';
import CryptoJS from 'crypto-js';

// Hash password using SHA256
const hashPassword = (password) => CryptoJS.SHA256(password).toString();

export const registerUser = async (username, password, role, fullName, storeName = '') => {
  try {
    // Check if username already exists
    const existingUser = await dataService.checkUserExists(username);
    if (existingUser) {
      return { success: false, error: 'Username already exists. Please choose another one.' };
    }

    const password_hash = hashPassword(password);
    const userData = {
      username,
      password_hash,
      role,
      full_name: fullName,
      store_name: storeName,
      created_at: new Date().toISOString()
    };
    
    // Add user through dataService (handles SQLite/API automatically)
    const result = await dataService.add('users', userData);
    
    if (result) {
      return { 
        success: true, 
        user_id: result.user_id || result.id,
        user: {
          user_id: result.user_id || result.id,
          username: result.username,
          role: result.role,
          full_name: result.full_name,
          store_name: result.store_name
        }
      };
    } else {
      return { success: false, error: 'Failed to create user.' };
    }
  } catch (err) {
    console.error('Registration error:', err);
    return { 
      success: false, 
      error: err.message || 'Registration failed. Please try again.' 
    };
  }
};

export const loginUser = async (username, password) => {
  try {
    const password_hash = hashPassword(password);
    
    // Get user by username through dataService
    const user = await dataService.getUserByUsername(username);
    
    if (!user) {
      return { success: false, error: 'Username not found.' };
    }
    
    if (user.password_hash === password_hash) {
      // Return user data (excluding password hash)
      return { 
        success: true, 
        user: {
          user_id: user.user_id || user.id,
          username: user.username,
          role: user.role,
          full_name: user.full_name,
          store_name: user.store_name,
          created_at: user.created_at
        }
      };
    } else {
      return { success: false, error: 'Invalid password.' };
    }
  } catch (err) {
    console.error('Login error:', err);
    
    // If there's a network error, try to check local SQLite if in owner mode
    if (window.dataService && window.dataService.isOwner) {
      try {
        // Try getting user from local SQLite
        const localUser = await window.dataService.getUserByUsername(username);
        if (localUser) {
          const password_hash = hashPassword(password);
          if (localUser.password_hash === password_hash) {
            return { 
              success: true, 
              user: {
                user_id: localUser.user_id || localUser.id,
                username: localUser.username,
                role: localUser.role,
                full_name: localUser.full_name,
                store_name: localUser.store_name,
                created_at: localUser.created_at
              }
            };
          }
        }
      } catch (localError) {
        console.error('Local login fallback failed:', localError);
      }
    }
    
    return { 
      success: false, 
      error: err.message || 'Login failed. Please check your connection and try again.' 
    };
  }
};

export const logoutUser = () => {
  // Clear local storage
  localStorage.removeItem('user');
  localStorage.removeItem('userMode');
  
  // Clear any session data
  sessionStorage.clear();
  
  // Redirect to login page
  window.location.href = '/';
};

export const getCurrentUser = () => {
  try {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
};

export const isAuthenticated = () => {
  return !!getCurrentUser();
};

export const getUserRole = () => {
  const user = getCurrentUser();
  return user ? user.role : null;
};

export const updateUserProfile = async (userId, updates) => {
  try {
    // Don't allow updating password here - use separate password change function
    const safeUpdates = { ...updates };
    delete safeUpdates.password_hash;
    delete safeUpdates.password;
    
    const result = await dataService.update('users', userId, safeUpdates);
    if (result) {
      // Update local storage if current user is being updated
      const currentUser = getCurrentUser();
      if (currentUser && currentUser.user_id === userId) {
        const updatedUser = { ...currentUser, ...safeUpdates };
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }
      return { success: true, user: result };
    }
    return { success: false, error: 'Failed to update profile.' };
  } catch (error) {
    console.error('Update profile error:', error);
    return { success: false, error: error.message };
  }
};

export const changePassword = async (userId, currentPassword, newPassword) => {
  try {
    // Get user to verify current password
    const user = await dataService.getById('users', userId);
    if (!user) {
      return { success: false, error: 'User not found.' };
    }
    
    const currentPasswordHash = hashPassword(currentPassword);
    if (user.password_hash !== currentPasswordHash) {
      return { success: false, error: 'Current password is incorrect.' };
    }
    
    // Update password
    const newPasswordHash = hashPassword(newPassword);
    const result = await dataService.update('users', userId, { 
      password_hash: newPasswordHash,
      updated_at: new Date().toISOString()
    });
    
    return { success: !!result };
  } catch (error) {
    console.error('Change password error:', error);
    return { success: false, error: error.message };
  }
};

// Helper to check if user is owner
export const isUserOwner = () => {
  const user = getCurrentUser();
  return user && user.role === 'Owner';
};

// Helper to check if user is staff
export const isUserStaff = () => {
  const user = getCurrentUser();
  return user && user.role === 'Staff';
};

// Get all users (admin only)
export const getAllUsers = async () => {
  try {
    const users = await dataService.getAll('users');
    // Remove password hashes from response for security
    return users.map(user => ({
      user_id: user.user_id || user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      store_name: user.store_name,
      created_at: user.created_at
    }));
  } catch (error) {
    console.error('Get all users error:', error);
    return [];
  }
};

// Delete user (admin only)
export const deleteUser = async (userId) => {
  try {
    // Don't allow deleting current user
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.user_id === userId) {
      return { success: false, error: 'Cannot delete your own account.' };
    }
    
    const result = await dataService.delete('users', userId);
    return { success: result };
  } catch (error) {
    console.error('Delete user error:', error);
    return { success: false, error: error.message };
  }
};