import './src/styles/tailwind.css';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { setServerBaseUrlFromStorage } from './src/services/api';
import { setLocalBaseUrlFromStorage } from './src/services/localApi';
import { ThemeProvider } from './src/theme/ThemeProvider';

export default function App() {
  useEffect(() => {
    // Load server and local base URLs from storage so services can use them
    setServerBaseUrlFromStorage();
    setLocalBaseUrlFromStorage();
  }, []);

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <AppNavigator />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

