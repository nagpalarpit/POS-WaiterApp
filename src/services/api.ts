import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVER_BASE_URL } from '../config/env';
import posIdService from './posIdService';

const api: AxiosInstance = axios.create({
  timeout: 5000,
  baseURL: SERVER_BASE_URL,
});

const KEY = 'SERVER_BASE_URL';
const TOKEN_KEY = 'token';

// Set up request interceptor to add auth token and POS ID (same as POS_V2)
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Append POS ID to request headers if available (same header name as POS_V2)
    const posId = posIdService.getPosId();
    if (posId) {
      config.headers['PosId'] = posId;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Set up response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - clear token and redirect to login if needed
      AsyncStorage.removeItem(TOKEN_KEY).catch(console.error);
    }
    return Promise.reject(error);
  }
);

export const setServerBaseUrlFromStorage = async () => {
  const base = await AsyncStorage.getItem(KEY);
  if (base) api.defaults.baseURL = base;
};

export const setServerBaseUrl = async (base: string) => {
  api.defaults.baseURL = base;
  await AsyncStorage.setItem(KEY, base);
};

export const setAuthToken = async (token: string) => {
  await AsyncStorage.setItem(TOKEN_KEY, token);
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

export const clearAuthToken = async () => {
  await AsyncStorage.removeItem(TOKEN_KEY);
  delete api.defaults.headers.common['Authorization'];
};

export default api;
