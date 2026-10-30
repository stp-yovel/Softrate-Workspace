const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export async function loginWithPeopleSoft(identifier, password) {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
    body: JSON.stringify({
      identifier,
      password,
    }),
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));

  if (!response.ok && data.success !== false) {
    throw new Error(data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

export async function verifyMfaCode(tempToken, code) {
  const response = await fetch(`${API_BASE_URL}/api/auth/mfa/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
    body: JSON.stringify({
      tempToken,
      code,
    }),
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server',
  }));

  if (!response.ok && data.success !== false) {
    throw new Error(data.message || `MFA verification failed with status ${response.status}`);
  }

  return data;
}

export async function fetchCurrentUser(token) {
  if (!token) return null;
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
      cache: 'no-store',
    });
    return response.json();
  } catch (err) {
    console.warn('[authApi] Could not fetch current user from PeopleSoft:', err);
    return null;
  }
}
