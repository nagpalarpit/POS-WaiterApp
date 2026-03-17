import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVER_BASE_URL } from '../config/env';
import { STORAGE_KEYS } from '../constants/storageKeys';
import posIdService from './posIdService';

const api: AxiosInstance = axios.create({
  timeout: 20000,
  baseURL: SERVER_BASE_URL,
});

// Set up request interceptor to add auth token and POS ID (same as POS_V2)
api.interceptors.request.use(
  async (config) => {
    const token =
      (await AsyncStorage.getItem(STORAGE_KEYS.cloudAuthToken)) ||
      (await AsyncStorage.getItem(STORAGE_KEYS.legacyCloudAuthToken));
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
      AsyncStorage.removeItem(STORAGE_KEYS.cloudAuthToken).catch(console.error);
      AsyncStorage.removeItem(STORAGE_KEYS.legacyCloudAuthToken).catch(console.error);
    }
    return Promise.reject(error);
  }
);

export const setServerBaseUrlFromStorage = async () => {
  const base = await AsyncStorage.getItem(STORAGE_KEYS.cloudBaseUrl);
  if (base) api.defaults.baseURL = base;
};

export const setServerBaseUrl = async (base: string) => {
  api.defaults.baseURL = base;
  await AsyncStorage.setItem(STORAGE_KEYS.cloudBaseUrl, base);
};

export const setAuthToken = async (token: string) => {
  await AsyncStorage.setItem(STORAGE_KEYS.cloudAuthToken, token);
  await AsyncStorage.setItem(STORAGE_KEYS.legacyCloudAuthToken, token);
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

export const clearAuthToken = async () => {
  await AsyncStorage.removeItem(STORAGE_KEYS.cloudAuthToken);
  await AsyncStorage.removeItem(STORAGE_KEYS.legacyCloudAuthToken);
  delete api.defaults.headers.common['Authorization'];
};

export default api;
