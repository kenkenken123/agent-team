import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const request = axios.create({
  baseURL: 'http://localhost:5501/api/saas',
  timeout: 30000,
});

request.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

request.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      useAuthStore.getState().logout();
    }
    const errorMsg = error.response?.data?.error || error.message || '请求失败';
    return Promise.reject(new Error(errorMsg));
  }
);

export default request;
