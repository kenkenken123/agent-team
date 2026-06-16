import { create } from 'zustand';

interface User {
  id: string;
  username: string;
  createdAt: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const storedToken = localStorage.getItem('saas_token');
  const storedUser = localStorage.getItem('saas_user');

  return {
    token: storedToken,
    user: storedUser ? JSON.parse(storedUser) : null,
    setAuth: (token, user) => {
      localStorage.setItem('saas_token', token);
      localStorage.setItem('saas_user', JSON.stringify(user));
      set({ token, user });
    },
    logout: () => {
      localStorage.removeItem('saas_token');
      localStorage.removeItem('saas_user');
      set({ token: null, user: null });
    },
  };
});
