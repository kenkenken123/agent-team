import { create } from 'zustand';

interface User {
  id: string;
  username: string;
  createdAt: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAdmin: boolean;
  setAuth: (token: string, user: User | null, isAdmin?: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const storedToken = localStorage.getItem('saas_token');
  const storedUser = localStorage.getItem('saas_user');
  const storedIsAdmin = localStorage.getItem('saas_is_admin') === 'true';

  return {
    token: storedToken,
    user: storedUser ? JSON.parse(storedUser) : null,
    isAdmin: storedIsAdmin,
    setAuth: (token, user, isAdmin = false) => {
      localStorage.setItem('saas_token', token);
      localStorage.setItem('saas_user', user ? JSON.stringify(user) : '');
      localStorage.setItem('saas_is_admin', String(isAdmin));
      set({ token, user, isAdmin });
    },
    logout: () => {
      localStorage.removeItem('saas_token');
      localStorage.removeItem('saas_user');
      localStorage.removeItem('saas_is_admin');
      set({ token: null, user: null, isAdmin: false });
    },
  };
});

