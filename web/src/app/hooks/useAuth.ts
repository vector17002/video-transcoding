"use client";

import { useState, useEffect, useCallback } from "react";

const TOKEN_KEY = "token";

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;

  // Check localStorage
  const lsToken = localStorage.getItem(TOKEN_KEY);
  if (lsToken) return lsToken;

  // Check cookies
  const cookie = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${TOKEN_KEY}=`));
  return cookie ? cookie.trim().split("=")[1] : null;
}

function persistToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=3600`;
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${TOKEN_KEY}=; Max-Age=0; path=/;`;
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    setToken(getStoredToken());
    setIsChecking(false);
  }, []);

  const login = useCallback((newToken: string) => {
    persistToken(newToken);
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setToken(null);
  }, []);

  return {
    token,
    isLoggedIn: !!token,
    isChecking,
    login,
    logout,
  };
}
