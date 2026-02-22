import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import posIdService from './posIdService';

const localApi: AxiosInstance = axios.create({
  timeout: 5000,
  baseURL: 'http://localhost:3000', // Default, will be set dynamically
});

const KEY = 'LOCAL_BASE_URL';
const TOKEN_KEY = 'local_token';

// Set up request interceptor to add auth token and POS ID (same as POS_V2)
localApi.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Append POS ID to request headers for local API calls (same header name as POS_V2)
    const posId = posIdService.getPosId();
    if (posId) {
      config.headers['PosId'] = posId;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Set up response interceptor for error handling
localApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - clear token
      AsyncStorage.removeItem(TOKEN_KEY).catch(console.error);
    }
    return Promise.reject(error);
  }
);

export const setLocalBaseUrlFromStorage = async () => {
  const base = await AsyncStorage.getItem(KEY);
  if (base) localApi.defaults.baseURL = base;
};

export const setLocalBaseUrl = async (base: string) => {
  localApi.defaults.baseURL = base;
  await AsyncStorage.setItem(KEY, base);
};

export const setLocalAuthToken = async (token: string) => {
  await AsyncStorage.setItem(TOKEN_KEY, token);
  localApi.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

export const clearLocalAuthToken = async () => {
  await AsyncStorage.removeItem(TOKEN_KEY);
  delete localApi.defaults.headers.common['Authorization'];
};

export default localApi;
