export const STORAGE_KEYS = {
  cloudBaseUrl: 'SERVER_BASE_URL',
  localBaseUrl: 'LOCAL_BASE_URL',
  legacyBaseUrl: 'BASE_URL',
  cloudAuthToken: 'token',
  legacyCloudAuthToken: 'authToken',
  localAuthToken: 'local_token',
  authUser: 'user_data',
  authLoginType: 'login_type',
  posId: 'POS_ID',
  localServerConnected: 'LOCAL_SERVER_CONNECTED',
  activeOrderSyncLock: 'ACTIVE_ORDER_SYNC_LOCK',
  onboardingSeenPrefix: 'ONBOARDING_SEEN',
  pendingOnboardingUser: 'PENDING_ONBOARDING_USER',
} as const;

export const SECURE_STORAGE_KEYS = {
  authToken: 'auth_token',
} as const;
