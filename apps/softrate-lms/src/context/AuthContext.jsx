import { createContext, useContext, useState, useEffect } from 'react';
import { loginWithPeopleSoft, verifyMfaCode, fetchCurrentUser } from '../services/authApi';

const AuthContext = createContext(null);

const TOKEN_KEY = 'lms_auth_token';
const USER_KEY = 'lms_auth_user';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || null);
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }, [user]);

  // Synchronize latest profile data & photo from PeopleSoft HRMS via middleware
  useEffect(() => {
    let isMounted = true;
    if (token) {
      fetchCurrentUser(token)
        .then((res) => {
          if (!isMounted) return;
          if (res && res.success && res.user) {
            setUser({
              ...res.user,
              role: res.role || res.user.role || 'user',
            });
          } else if (res && res.success === false) {
            // Token is invalid / expired on backend, clear session
            logout();
          }
        })
        .catch(() => {
          // Network issue
        });
    } else {
      setUser(null);
    }
    return () => {
      isMounted = false;
    };
  }, [token]);

  const login = async (identifier, password) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await loginWithPeopleSoft(identifier, password);

      if (!result.success) {
        throw new Error(result.message || 'Login failed. Please check credentials.');
      }

      // Handle MFA if enabled on PeopleSoft account
      if (result.mfaRequired || result.requiresMfa) {
        setIsLoading(false);
        return {
          requiresMfa: true,
          mfaRequired: true,
          tempToken: result.tempToken,
          message: result.message || 'Two-Factor Authentication required.',
        };
      }

      // Direct success
      const authToken = result.token || result.auth_token;
      const currentUser = result.user || result.employee || result.intern || {
        identifier,
        role: result.role || 'user',
      };

      setToken(authToken);
      setUser(currentUser);
      setIsLoading(false);

      return {
        success: true,
        user: currentUser,
      };
    } catch (err) {
      setIsLoading(false);
      setError(err.message || 'An unexpected error occurred during login');
      throw err;
    }
  };

  const completeMfa = async (tempToken, code) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await verifyMfaCode(tempToken, code);

      if (!result.success) {
        throw new Error(result.message || 'Invalid verification code');
      }

      const authToken = result.token || result.auth_token;
      const currentUser = result.user || { role: result.role || 'user' };

      setToken(authToken);
      setUser(currentUser);
      setIsLoading(false);

      return {
        success: true,
        user: currentUser,
      };
    } catch (err) {
      setIsLoading(false);
      setError(err.message || 'MFA Verification failed');
      throw err;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setError(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: Boolean(token && user),
        isLoading,
        error,
        setError,
        login,
        completeMfa,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
