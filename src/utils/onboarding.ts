import { STORAGE_KEYS } from '../constants/storageKeys';
import { User } from '../types/auth';

const normalizeIdentifier = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_');

export const getOnboardingUserId = (user: User | null | undefined) => {
  const rawValue =
    user?.id ||
    user?.email ||
    String(user?.companyId || user?.company?.id || 'waiter');

  return normalizeIdentifier(String(rawValue));
};

export const getOnboardingSeenKey = (user: User | null | undefined) =>
  `${STORAGE_KEYS.onboardingSeenPrefix}:${getOnboardingUserId(user)}`;
