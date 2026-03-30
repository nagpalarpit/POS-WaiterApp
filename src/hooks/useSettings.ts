import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storageKeys';
import localDatabase from '../services/localDatabase';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/apiEndpoints';
import { getSocket, onLocalSocketStatusChange } from '../services/socket';

export interface Settings {
  totalTables?: number;
  enableDelivery?: boolean;
  enablePickup?: boolean;
  enableGroupLabel?: boolean;
  deliveryCharge?: number | null;
  companyId?: string | number;
  companyName?: string;
  company?: {
    id?: string | number;
    name?: string;
  };
  isKiosk?: boolean;
  tableAreas?: any[];
}

const DEFAULT_SETTINGS: Settings = {
  totalTables: 20,
  enableDelivery: true,
  enablePickup: true,
};

const normalizeCompanyName = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const resolveCompanyName = (source: any): string | undefined =>
  normalizeCompanyName(source?.companyName) ||
  normalizeCompanyName(source?.name) ||
  normalizeCompanyName(source?.displayName);

const normalizeSettingsRecord = (record: any): Settings | null => {
  if (!record) return null;
  const settingInfo = record.settingInfo ?? record;
  if (!settingInfo) return null;

  const companyName =
    resolveCompanyName(settingInfo) ||
    resolveCompanyName(settingInfo?.company);

  const companyId =
    settingInfo?.companyId ??
    settingInfo?.company?.id;

  return {
    ...(settingInfo as Settings),
    ...(settingInfo?.deliveryCharge !== undefined && settingInfo?.deliveryCharge !== ''
      ? { deliveryCharge: Number(settingInfo.deliveryCharge) || 0 }
      : {}),
    ...(companyId !== undefined ? { companyId } : {}),
    ...(companyName ? { companyName } : {}),
    company: {
      ...(settingInfo?.company || {}),
      ...(companyId !== undefined ? { id: companyId } : {}),
      ...(companyName ? { name: companyName } : {}),
    },
  };
};

/**
 * Hook for loading app settings
 */
export const useSettings = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  /**
   * Load settings from local server or cloud fallback
   */
  const loadSettings = useCallback(async () => {
    try {
      setLoadingSettings(true);

      const userDataStr = await AsyncStorage.getItem(STORAGE_KEYS.authUser);
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      const companyId = userData?.companyId ?? userData?.company?.id;
      const companyName =
        resolveCompanyName(userData) ||
        resolveCompanyName(userData?.company);

      let resolved: Settings | null = null;

      try {
        const localRes = await localDatabase.select('settings', {
          where: companyId ? { companyId } : {},
        });
        const record = Array.isArray(localRes) ? localRes[0] : localRes;
        resolved = normalizeSettingsRecord(record);
      } catch (error) {
        console.warn('useSettings: Local settings load failed:', error);
      }

      if (!resolved && companyId) {
        try {
          const cloudRes = await api.post(API_ENDPOINTS.settings.GET_ALL, {
            companyId,
          });
          const raw = cloudRes?.data?.data ?? cloudRes?.data ?? cloudRes;
          const record = Array.isArray(raw) ? raw[0] : raw;
          resolved = normalizeSettingsRecord(record);
        } catch (error) {
          console.warn('useSettings: Cloud settings load failed:', error);
        }
      }

      const merged: Settings = {
        ...DEFAULT_SETTINGS,
        ...(resolved || {}),
        ...(companyId !== undefined ? { companyId } : {}),
        ...(companyName ? { companyName } : {}),
        company: {
          ...(resolved?.company || {}),
          ...(companyId !== undefined ? { id: companyId } : {}),
          ...(companyName ? { name: companyName } : {}),
        },
      };

      setSettings(merged);
      return merged;
    } catch (error) {
      console.error('Error loading settings:', error);
      const fallback: Settings = { ...DEFAULT_SETTINGS };
      setSettings(fallback);
      return fallback;
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    let detachSocketListener: (() => void) | null = null;

    const attachSettingsListener = () => {
      const socket = getSocket();
      if (!socket) {
        return;
      }

      const handleSyncSettings = (payload: any) => {
        const syncPayload =
          payload && typeof payload === 'object' ? payload : {};

        setSettings((current) => {
          const nextDeliveryCharge =
            syncPayload?.deliveryCharge !== undefined && syncPayload?.deliveryCharge !== ''
              ? Number(syncPayload.deliveryCharge) || 0
              : current?.deliveryCharge ?? null;

          return {
            ...DEFAULT_SETTINGS,
            ...(current || {}),
            ...syncPayload,
            deliveryCharge: nextDeliveryCharge,
            company: {
              ...(current?.company || {}),
            },
          };
        });

        void (async () => {
          if (Array.isArray(syncPayload?.tableAreas)) {
            try {
              const userDataStr = await AsyncStorage.getItem(STORAGE_KEYS.authUser);
              const userData = userDataStr ? JSON.parse(userDataStr) : null;
              const companyId =
                syncPayload?.companyId ??
                userData?.companyId ??
                userData?.company?.id;

              if (companyId !== undefined && companyId !== null) {
                await localDatabase.update(
                  'settings',
                  {
                    'settingInfo.tableAreas': syncPayload.tableAreas,
                    updateAll: true,
                  },
                  {
                    where: { companyId },
                  }
                );
              }
            } catch (error) {
              console.warn('useSettings: Failed to persist synced table areas:', error);
            }
          }

          await loadSettings();
        })();
      };

      socket.on('sync-settings', handleSyncSettings);
      detachSocketListener = () => {
        socket.off('sync-settings', handleSyncSettings);
      };
    };

    attachSettingsListener();

    const unsubscribeSocketStatus = onLocalSocketStatusChange((connected) => {
      detachSocketListener?.();
      detachSocketListener = null;

      if (connected) {
        attachSettingsListener();
        void loadSettings();
      }
    });

    return () => {
      detachSocketListener?.();
      unsubscribeSocketStatus();
    };
  }, [loadSettings]);

  return {
    settings,
    loadingSettings,
    loadSettings,
    setSettings,
  };
};
