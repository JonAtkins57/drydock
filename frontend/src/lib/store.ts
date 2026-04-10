import { create } from 'zustand';
import { endpoints } from './api';

interface User {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  permissions: string[];
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  loadUser: () => Promise<void>;
  init: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  token: localStorage.getItem('drydock_token'),
  refreshToken: localStorage.getItem('drydock_refresh'),
  user: null,
  loading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const res = await endpoints.login(email, password);
      localStorage.setItem('drydock_token', res.accessToken);
      localStorage.setItem('drydock_refresh', res.refreshToken);
      set({ token: res.accessToken, refreshToken: res.refreshToken, loading: false });
      await get().loadUser();
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      set({ loading: false, error: msg });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('drydock_token');
    localStorage.removeItem('drydock_refresh');
    set({ token: null, refreshToken: null, user: null });
  },

  loadUser: async () => {
    try {
      const user = await endpoints.me();
      set({ user });
    } catch {
      get().logout();
    }
  },

  init: async () => {
    const token = get().token;
    if (token) {
      set({ loading: true });
      await get().loadUser();
      set({ loading: false });
    }
  },
}));
