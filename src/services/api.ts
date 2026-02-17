import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVER_BASE_URL } from '../config/env';

const api = axios.create({ timeout: 5000, baseURL: SERVER_BASE_URL });

const KEY = 'SERVER_BASE_URL';

export const setServerBaseUrlFromStorage = async () => {
  const base = await AsyncStorage.getItem(KEY);
  if (base) api.defaults.baseURL = base;
};

export const setServerBaseUrl = async (base: string) => {
  api.defaults.baseURL = base;
  await AsyncStorage.setItem(KEY, base);
};

export default api;
