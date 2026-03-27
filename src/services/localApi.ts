import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storageKeys';
import posIdService from './posIdService';
import { ensureTokenLicenseIsValid } from './tokenService';

const localApi: AxiosInstance = axios.create({
  timeout: 15000,
  baseURL: 'http://localhost:3000', // Default, will be set dynamically
});

// Set up request interceptor to add auth token and POS ID (same as POS_V2)
localApi.interceptors.request.use(
  async (config) => {
    const headers: any = config.headers || {};
    const skipAuth = headers['x-skip-auth'];
    if (skipAuth) {
      delete headers['x-skip-auth'];
      config.headers = headers;
      return config;
    }

    const token = await AsyncStorage.getItem(STORAGE_KEYS.localAuthToken);
    if (token) {
      await ensureTokenLicenseIsValid(token);
      headers.Authorization = `Bearer ${token}`;
    }

    let posId = posIdService.getPosId();
    if (!posId) {
      // Try to load from storage
      posId = await posIdService.loadPosId();
      if (!posId) {
        console.warn('Local API interceptor: PosId missing - requests may fail');
      }
    }
    if (posId) {
      headers['PosId'] = posId;
    }

    headers['TimeZone'] = Intl.DateTimeFormat().resolvedOptions().timeZone;
    headers['type'] = 'POS';
    config.headers = headers;
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
      AsyncStorage.removeItem(STORAGE_KEYS.localAuthToken).catch(console.error);
    }
    return Promise.reject(error);
  }
);

export const setLocalBaseUrlFromStorage = async () => {
  const base = await AsyncStorage.getItem(STORAGE_KEYS.localBaseUrl);
  if (base) localApi.defaults.baseURL = base;
};

export const setLocalBaseUrl = async (base: string) => {
  localApi.defaults.baseURL = base;
  await AsyncStorage.setItem(STORAGE_KEYS.localBaseUrl, base);
};

export const setLocalAuthToken = async (token: string) => {
  await AsyncStorage.setItem(STORAGE_KEYS.localAuthToken, token);
  localApi.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

export const clearLocalAuthToken = async () => {
  await AsyncStorage.removeItem(STORAGE_KEYS.localAuthToken);
  delete localApi.defaults.headers.common['Authorization'];
};

export default localApi;
