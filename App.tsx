// Native terminal TCP payloads need Buffer in the React Native runtime.
import './src/polyfills';
import './src/styles/tailwind.css';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AppNavigator from './src/navigation/AppNavigator';
import { setServerBaseUrlFromStorage } from './src/services/api';
import { setLocalBaseUrlFromStorage } from './src/services/localApi';
import posIdService from './src/services/posIdService';
import { Provider as PaperProvider } from 'react-native-paper';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { ToastProvider } from './src/components/ToastProvider';
import { ConnectionProvider } from './src/contexts/ConnectionProvider';
import { AuthProvider } from './src/contexts/AuthContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

import StartupSplash from './src/components/StartupSplash';

function ThemedStatusBar() {
  const { name, colors } = useTheme();

  return (
    <StatusBar
      style={name === 'light' ? 'dark' : 'light'}
      backgroundColor={colors.background}
      translucent={false}
    />
  );
}

function App() {
  const [showStartupSplash, setShowStartupSplash] = React.useState(true);

  useEffect(() => {
    // Load server and local base URLs from storage so services can use them
    setServerBaseUrlFromStorage();
    setLocalBaseUrlFromStorage();
    // Load POS ID from storage
    posIdService.loadPosId().then((posId) => {
      console.log('App: Loaded POS ID from storage:', posId);
    });

    const timer = setTimeout(() => {
      setShowStartupSplash(false);
    }, 1700);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  return (
    <PaperProvider>
      <LanguageProvider>
        <ThemeProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
              <BottomSheetModalProvider>
                <ToastProvider>
                  <ConnectionProvider>
                    <AuthProvider>
                      <AppNavigator />
                    </AuthProvider>
                  </ConnectionProvider>
                </ToastProvider>
              </BottomSheetModalProvider>
              <StartupSplash visible={showStartupSplash} />
              <ThemedStatusBar />
            </SafeAreaProvider>
          </GestureHandlerRootView>
        </ThemeProvider>
      </LanguageProvider>
    </PaperProvider>
  );
}

export default App;
