'use client';

import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

export interface GitHubUser {
  login: string;
  avatarUrl: string;
}

export interface GitHubAuthState {
  user: GitHubUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

export function useGitHubAuth(): GitHubAuthState {
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check auth state on mount
  useEffect(() => {
    axios
      .get<GitHubUser>('/api/auth/me', { withCredentials: true })
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(() => {
    // Redirect to backend OAuth initiation endpoint
    window.location.href = '/api/auth/github';
  }, []);

  const logout = useCallback(async () => {
    await axios.get('/api/auth/logout', { withCredentials: true });
    setUser(null);
  }, []);

  return {
    user,
    isAuthenticated: user !== null,
    isLoading,
    login,
    logout,
  };
}
