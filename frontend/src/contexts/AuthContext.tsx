'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AuthUser } from '@/types';
import { login as apiLogin, register as apiRegister, fetchMe, setAuthToken } from '@/lib/api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (credential: string, password: string, method?: 'email' | 'phone') => Promise<void>;
  register: (email: string, password: string, vendorId: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = 'kasi_token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from stored token on mount
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);

    if (!token) {
      setLoading(false); // eslint-disable-line react-hooks/set-state-in-effect -- required for auth init
      return;
    }

    setAuthToken(token);
    let cancelled = false;

    fetchMe()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setAuthToken(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credential: string, password: string, method: 'email' | 'phone' = 'email') => {
    const { token, user: u } = await apiLogin(credential, password, method);
    localStorage.setItem(TOKEN_KEY, token);
    setAuthToken(token);
    setUser(u);
  }, []);

  const register = useCallback(
    async (email: string, password: string, vendorId: string, name?: string) => {
      const { token, user: u } = await apiRegister(email, password, vendorId, name);
      localStorage.setItem(TOKEN_KEY, token);
      setAuthToken(token);
      setUser(u);
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
