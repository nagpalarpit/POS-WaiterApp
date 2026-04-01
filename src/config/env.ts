import Constants from 'expo-constants';

const getExtra = (key: string) => {
  // Expo stores extra values in different places depending on SDK / runtime.
  const expoExtra = (Constants as any).expoConfig?.extra || (Constants as any).manifest?.extra;
  return typeof process !== 'undefined' && (process.env as any)[key]
    ? (process.env as any)[key]
    : expoExtra?.[key];
};

type ApiEnvironment = 'dev' | 'live';

const normalizeApiEnvironment = (value: unknown): ApiEnvironment => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'live' ? 'live' : 'dev';
};

const FALLBACK_SERVER_BASE_URLS: Record<ApiEnvironment, string> = {
  dev: 'http://146.190.9.120:3000/',
  live: 'https://live-api.atgpos.de/',
};

export const API_ENV: ApiEnvironment = normalizeApiEnvironment(
  getExtra('EXPO_PUBLIC_API_ENV') ?? getExtra('API_ENV'),
);

const configuredServerBaseUrls: Record<ApiEnvironment, string> = {
  dev:
    (getExtra('EXPO_PUBLIC_SERVER_BASE_URL_DEV') as string) ??
    (getExtra('SERVER_BASE_URL_DEV') as string) ??
    FALLBACK_SERVER_BASE_URLS.dev,
  live:
    (getExtra('EXPO_PUBLIC_SERVER_BASE_URL_LIVE') as string) ??
    (getExtra('SERVER_BASE_URL_LIVE') as string) ??
    FALLBACK_SERVER_BASE_URLS.live,
};

export const SERVER_BASE_URL: string =
  (getExtra('EXPO_PUBLIC_SERVER_BASE_URL') as string) ??
  (getExtra('SERVER_BASE_URL') as string) ??
  configuredServerBaseUrls[API_ENV];
export const LOCAL_BASE_URL: string | undefined =
  (getExtra('EXPO_PUBLIC_LOCAL_BASE_URL') as string) ??
  (getExtra('LOCAL_BASE_URL') as string) ??
  undefined;
