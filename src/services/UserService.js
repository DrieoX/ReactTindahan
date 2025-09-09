import { getDBConnection, db, addUser, getUserByUsername } from '../db';
import CryptoJS from 'crypto-js';

const hashPassword = (password) => CryptoJS.SHA256(password).toString();

export const registerUser = async (username, password, role, fullName, storeName) => {
  try {
    const password_hash = hashPassword(password);
    const user = {
      username,
      password_hash,
      role,
      full_name: fullName,
      store_name: storeName,
    };
    const user_id = await addUser(user);
    return { success: true, user_id };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const loginUser = async (username, password) => {
  try {
    const password_hash = hashPassword(password);
    const user = await getUserByUsername(username);
    if (user && user.password_hash === password_hash) {
      return { success: true, user };
    } else {
      return { success: false, error: 'Invalid username or password' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
};
