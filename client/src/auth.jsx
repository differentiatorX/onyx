// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, request, getToken, setToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [merchant, setMerchant] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api
      .get('/me')
      .then(setMerchant)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onSignedOut = () => setMerchant(null);
    window.addEventListener('onyx:signed-out', onSignedOut);
    return () => window.removeEventListener('onyx:signed-out', onSignedOut);
  }, []);

  const signIn = useCallback(async (email, password) => {
    const res = await request('/dashboard/auth/login', { method: 'POST', body: { email, password }, auth: false });
    setToken(res.token);
    setMerchant(res.merchant);
  }, []);

  const register = useCallback(async (name, email, password) => {
    const res = await request('/dashboard/auth/register', { method: 'POST', body: { name, email, password }, auth: false });
    setToken(res.token);
    return { merchant: res.merchant, apiKey: res.api_key };
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setMerchant(null);
  }, []);

  return <AuthContext.Provider value={{ merchant, setMerchant, loading, signIn, register, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
