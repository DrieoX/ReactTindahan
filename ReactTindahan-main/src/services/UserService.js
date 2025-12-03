import { addUser, getUserByUsername } from '../db';
import CryptoJS from 'crypto-js';

const hashPassword = (password) => CryptoJS.SHA256(password).toString();

export const registerUser = async (username, password, role, fullName, storeName = '') => {
  try {
    // Check if username already exists
    const existingUser = await getUserByUsername(username);
    if (existingUser) {
      return { success: false, error: 'Username already exists. Please choose another one.' };
    }

    const password_hash = hashPassword(password);
    const user = {
      username,
      password_hash,
      role,
      full_name: fullName,
      store_name: storeName,
      created_at: new Date().toISOString()
    };
    
    const user_id = await addUser(user);
    return { success: true, user_id, user };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const loginUser = async (username, password) => {
  try {
    const password_hash = hashPassword(password);
    const user = await getUserByUsername(username);
    
    if (!user) {
      return { success: false, error: 'Username not found.' };
    }
    
    if (user.password_hash === password_hash) {
      // Owners can login as either mode (server/client), Staff can only login as client
      return { 
        success: true, 
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          full_name: user.full_name,
          store_name: user.store_name
        }
      };
    } else {
      return { success: false, error: 'Invalid password.' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
};