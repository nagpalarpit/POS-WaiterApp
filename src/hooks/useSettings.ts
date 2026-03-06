import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import localDatabase from '../services/localDatabase';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/apiEndpoints';

export interface Settings {
  totalTables?: number;
  enableDelivery?: boolean;
  enablePickup?: boolean;
  companyId?: string | number;
  companyName?: string;
  isKiosk?: boolean;
  tableAreas?: any[];
}

const DEFAULT_SETTINGS: Settings = {
  totalTables: 20,
  enableDelivery: true,
  enablePickup: true,
};

const normalizeSettingsRecord = (record: any): Settings | null => {
  if (!record) return null;
  const settingInfo = record.settingInfo ?? record;
  if (!settingInfo) return null;
  return settingInfo as Settings;
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
  const loadSettings = async () => {
    try {
      setLoadingSettings(true);

      const userDataStr = await AsyncStorage.getItem('userData');
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      const companyId = userData?.companyId ?? userData?.company?.id;
      const companyName = userData?.company?.name || userData?.companyName;

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
        ...(companyName ? { companyName } : {}),
      };

      setSettings(merged);
      console.log('Settings loaded:', merged);
      return merged;
    } catch (error) {
      console.error('Error loading settings:', error);
      const fallback: Settings = { ...DEFAULT_SETTINGS };
      setSettings(fallback);
      return fallback;
    } finally {
      setLoadingSettings(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  return {
    settings,
    loadingSettings,
    loadSettings,
    setSettings,
  };
};
