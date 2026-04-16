import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';
import type React from 'react';

type SentryLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

type TerminalEventPayload = Record<string, any>;

const extra = ((Constants as any).expoConfig?.extra ||
  (Constants as any).manifest?.extra ||
  {}) as Record<string, any>;

const SENSITIVE_KEYS = [
  'password',
  'paymentTerminalPassword',
  'card',
  'cardNumber',
  'pan',
  'track',
  'cvv',
  'pin',
];

let sentryInitialized = false;

const toBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  return fallback;
};

const toNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const dsn = String(extra.SENTRY_DSN || '').trim();
const sentryEnabled = toBoolean(extra.SENTRY_ENABLED, !!dsn) && !!dsn;
const sendTerminalHex = toBoolean(extra.SENTRY_TERMINAL_DEBUG_HEX, false);

const sanitizeValue = (value: any, key = ''): any => {
  const normalizedKey = key.toLowerCase();
  if (SENSITIVE_KEYS.some((sensitiveKey) => normalizedKey.includes(sensitiveKey.toLowerCase()))) {
    return '[redacted]';
  }

  if (!sendTerminalHex && normalizedKey.includes('hex')) {
    return '[hex-redacted]';
  }

  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(-8).map((item) => sanitizeValue(item, key));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce<Record<string, any>>((acc, [childKey, childValue]) => {
      acc[childKey] = sanitizeValue(childValue, childKey);
      return acc;
    }, {});
  }

  return value;
};

export const sanitizeForSentry = (payload: TerminalEventPayload = {}) =>
  sanitizeValue(payload) as TerminalEventPayload;

export const initializeSentry = () => {
  if (sentryInitialized) return;
  sentryInitialized = true;

  if (!sentryEnabled) {
    console.log('[sentry] disabled - SENTRY_DSN is not configured');
    return;
  }

  Sentry.init({
    dsn,
    environment: String(extra.SENTRY_ENVIRONMENT || extra.API_ENV || 'production'),
    release: String(extra.SENTRY_RELEASE || Constants.expoConfig?.version || 'waiterapp'),
    dist: String(extra.SENTRY_DIST || Constants.expoConfig?.version || '1'),
    enabled: true,
    debug: toBoolean(extra.SENTRY_DEBUG, false),
    sendDefaultPii: toBoolean(extra.SENTRY_SEND_DEFAULT_PII, false),
    tracesSampleRate: toNumber(extra.SENTRY_TRACES_SAMPLE_RATE, 0),
    beforeSend(event) {
      if (event.extra) {
        event.extra = sanitizeForSentry(event.extra);
      }
      if (event.contexts?.payment_terminal) {
        event.contexts.payment_terminal = sanitizeForSentry(event.contexts.payment_terminal);
      }
      return event;
    },
  });

  Sentry.setTag('app', 'waiter-app');
  Sentry.setTag('runtime', 'react-native');
};

export const isSentryReady = () => sentryEnabled && sentryInitialized;

export const wrapWithSentry = <P extends Record<string, unknown>>(
  component: React.ComponentType<P>,
) => {
  if (!sentryEnabled) return component;
  return Sentry.wrap(component);
};

export const addSentryBreadcrumb = (
  message: string,
  data: TerminalEventPayload = {},
  level: SentryLevel = 'info',
) => {
  if (!isSentryReady()) return;
  Sentry.addBreadcrumb({
    category: 'payment_terminal',
    message,
    level,
    data: sanitizeForSentry(data),
  });
};

export const captureTerminalEvent = (
  eventName: string,
  payload: TerminalEventPayload = {},
  level: SentryLevel = 'info',
) => {
  const safePayload = sanitizeForSentry(payload);
  console.log(`[payment-terminal] ${eventName}`, safePayload);

  if (!isSentryReady()) return;

  Sentry.withScope((scope) => {
    scope.setTag('feature', 'payment_terminal');
    scope.setTag('terminal', String(safePayload.terminal || 'unknown'));
    scope.setTag('terminal_event', eventName);
    if (safePayload.decision) {
      scope.setTag('terminal_decision', String(safePayload.decision));
    }
    scope.setContext('payment_terminal', safePayload);
    Sentry.captureMessage(`payment_terminal.${eventName}`, level);
  });
};

export const captureTerminalError = (
  error: unknown,
  eventName: string,
  payload: TerminalEventPayload = {},
) => {
  const safePayload = sanitizeForSentry(payload);
  console.log(`[payment-terminal] ${eventName}`, {
    ...safePayload,
    error,
  });

  if (!isSentryReady()) return;

  const normalizedError =
    error instanceof Error ? error : new Error(String(error || 'Payment terminal error'));

  Sentry.withScope((scope) => {
    scope.setTag('feature', 'payment_terminal');
    scope.setTag('terminal', String(safePayload.terminal || 'unknown'));
    scope.setTag('terminal_event', eventName);
    scope.setContext('payment_terminal', safePayload);
    Sentry.captureException(normalizedError);
  });
};
