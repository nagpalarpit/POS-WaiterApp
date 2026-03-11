import Constants from 'expo-constants';

const getExtra = (key: string) => {
  // Expo stores extra values in different places depending on SDK / runtime.
  const expoExtra = (Constants as any).expoConfig?.extra || (Constants as any).manifest?.extra;
  return typeof process !== 'undefined' && (process.env as any)[key]
    ? (process.env as any)[key]
    : expoExtra?.[key];
};

// Defaults fall back to the legacy config values to avoid breaking dev runs.
export const SERVER_BASE_URL: string =
  (getExtra('EXPO_PUBLIC_SERVER_BASE_URL') as string) ??
  (getExtra('SERVER_BASE_URL') as string) ??
  'http://146.190.9.120:3000/';
export const LOCAL_BASE_URL: string | undefined =
  (getExtra('EXPO_PUBLIC_LOCAL_BASE_URL') as string) ??
  (getExtra('LOCAL_BASE_URL') as string) ??
  undefined;
