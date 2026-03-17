import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Buffer } from 'buffer';
import { SECURE_STORAGE_KEYS, STORAGE_KEYS } from '../constants/storageKeys';

type DecodedToken = {
  licenseStartDate?: string;
  licenseExpiryDate?: string;
  [key: string]: any;
};

const normalizeBase64 = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = normalized.length % 4;
  if (padLength === 0) return normalized;
  return normalized.padEnd(normalized.length + (4 - padLength), '=');
};

export const decodeToken = (token: string): DecodedToken | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) {
      return null;
    }

    const decoded = Buffer.from(normalizeBase64(payload), 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Invalid token payload:', error);
    return null;
  }
};

export const getTokenLicenseError = (token: string | null | undefined): string | null => {
  if (!token) {
    return null;
  }

  const decoded = decodeToken(token);
  if (!decoded?.licenseStartDate || !decoded?.licenseExpiryDate) {
    return 'No license found. Please contact the admin.';
  }

  const currentDateInSeconds = Math.floor(Date.now() / 1000);
  const licenseStartInSeconds = Math.floor(new Date(decoded.licenseStartDate).getTime() / 1000);
  const licenseEndInSeconds = Math.floor(new Date(decoded.licenseExpiryDate).getTime() / 1000);

  if (!Number.isFinite(licenseStartInSeconds) || !Number.isFinite(licenseEndInSeconds)) {
    return 'No license found. Please contact the admin.';
  }

  if (currentDateInSeconds < licenseStartInSeconds) {
    return `Your license will be active from ${new Date(decoded.licenseStartDate).toLocaleString()}. Please try again later.`;
  }

  if (currentDateInSeconds >= licenseEndInSeconds) {
    return 'Your license has expired. To continue using the system, please renew your license by contacting the admin.';
  }

  return null;
};

export const clearStoredAuthSession = async () => {
  await SecureStore.deleteItemAsync(SECURE_STORAGE_KEYS.authToken);
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.authUser,
    STORAGE_KEYS.authLoginType,
    STORAGE_KEYS.cloudAuthToken,
    STORAGE_KEYS.legacyCloudAuthToken,
    STORAGE_KEYS.localAuthToken,
  ]);
};

export const ensureTokenLicenseIsValid = async (token: string | null | undefined) => {
  const error = getTokenLicenseError(token);
  if (!error) {
    return;
  }

  await clearStoredAuthSession();
  throw new Error(error);
};
