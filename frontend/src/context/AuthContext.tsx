import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../features/auth/types/auth.types';
import { axiosClient, getAccessToken, setAccessToken } from '../api/axiosClient';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshProfile = async () => {
    try {
      let token = getAccessToken();

      // If we don't have an access token in-memory, perform a silent refresh first
      if (!token) {
        const refreshResponse = await axiosClient.post<{
          success: boolean;
          data: { accessToken: string };
        }>('/auth/refresh-token');
        token = refreshResponse.data.data.accessToken;
        setAccessToken(token);
      }

      // Fetch profile using the access token
      const response = await axiosClient.get<{ success: boolean; data: User }>('/auth/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success) {
        const userData = response.data.data;
        // Normalize MongoDB uuid.id structure to top-level id key
        if (!userData.id && (userData as any).uuid?.id) {
          userData.id = (userData as any).uuid.id;
        }
        setUser(userData);
      } else {
        setUser(null);
      }
    } catch (error) {
      setUser(null);
      setAccessToken('');
    }
  };

  const login = (token: string, userData: User) => {
    setAccessToken(token);
    setUser(userData);
  };

  const logout = () => {
    setUser(null);
    setAccessToken('');
  };

  useEffect(() => {
    // Initial silent refresh / profile load
    const initAuth = async () => {
      try {
        await refreshProfile();
      } catch (err) {
        // Suppress errors as it just means the user needs to sign in
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Listen for global 401 token refresh failure events
    const handleUnauthorized = () => {
      logout();
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
