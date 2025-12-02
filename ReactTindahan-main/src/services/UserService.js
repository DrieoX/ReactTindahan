// --- Register user ---
export const registerUser = async (username, password, role, fullName, storeName, serverIP) => {
  if (!serverIP) return { success: false, error: 'Desktop server IP not provided' };

  const API_BASE = `http://${serverIP}:5000/api`;

  try {
    const trimmedUsername = username.trim().toLowerCase();
    const res = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: trimmedUsername,
        password, // send raw password
        role,
        full_name: fullName.trim(),
        store_name: storeName.trim()
      }),
    });
    const user = await res.json();
    return { success: true, user };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// --- Login user ---
export const loginUser = async (username, password, serverIP) => {
  if (!serverIP) return { success: false, error: 'Desktop server IP not provided' };

  const API_BASE = `http://${serverIP}:5000/api`;
  const trimmedUsername = username.trim().toLowerCase();

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: trimmedUsername, password }) // send raw password
    });

    if (!res.ok) {
      const error = await res.json();
      return { success: false, error: error.error };
    }

    const user = await res.json();
    return { success: true, user };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
