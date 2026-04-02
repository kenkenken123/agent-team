import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5501',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

export default api;

export const WS_BASE = 'ws://localhost:5501';
