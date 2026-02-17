import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOCAL_BASE_URL } from '../config/env';

const localApi = axios.create({ timeout: 5000, baseURL: LOCAL_BASE_URL });

const KEY = 'LOCAL_BASE_URL';

export const setLocalBaseUrlFromStorage = async () => {
  const base = await AsyncStorage.getItem(KEY);
  if (base) localApi.defaults.baseURL = base;
};

export const setLocalBaseUrl = async (base: string) => {
  localApi.defaults.baseURL = base;
  await AsyncStorage.setItem(KEY, base);
};

export default localApi;
