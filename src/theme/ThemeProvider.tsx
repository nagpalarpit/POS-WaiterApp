import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES, ThemeName, DEFAULT_THEME } from './theme';

type ThemeContextValue = {
  name: ThemeName;
  colors: typeof THEMES[typeof DEFAULT_THEME];
  setTheme: (name: ThemeName) => Promise<void>;
};

const KEY = 'APP_THEME';
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<ThemeName>(DEFAULT_THEME);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(KEY);
      if (stored && (stored === 'light' || stored === 'dark' || stored === 'dim')) {
        setName(stored as ThemeName);
      }
    })();
  }, []);

  const setTheme = async (themeName: ThemeName) => {
    setName(themeName);
    await AsyncStorage.setItem(KEY, themeName);
  };

  const value: ThemeContextValue = {
    name,
    colors: THEMES[name],
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
