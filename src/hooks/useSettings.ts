import { useState, useEffect } from 'react';

export interface Settings {
  totalTables?: number;
  enableDelivery?: boolean;
  enablePickup?: boolean;
  companyId?: string;
  isKiosk?: boolean;
}

/**
 * Hook for loading app settings
 */
export const useSettings = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  /**
   * Load settings from AsyncStorage or use defaults
   */
  const loadSettings = async () => {
    try {
      setLoadingSettings(true);

      // For now, use default settings
      const defaultSettings: Settings = {
        totalTables: 20,
        enableDelivery: true,
        enablePickup: true,
      };
      
      setSettings(defaultSettings);
      console.log('Settings loaded:', defaultSettings);
      return defaultSettings;
    } catch (error) {
      console.error('Error loading settings:', error);
      // Use defaults on error
      const defaultSettings: Settings = {
        totalTables: 20,
        enableDelivery: true,
        enablePickup: true,
      };
      setSettings(defaultSettings);
      return defaultSettings;
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
