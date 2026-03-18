import './src/styles/tailwind.css';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { setServerBaseUrlFromStorage } from './src/services/api';
import { setLocalBaseUrlFromStorage } from './src/services/localApi';
import { Provider as PaperProvider } from 'react-native-paper';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { ToastProvider } from './src/components/ToastProvider';
import { ConnectionProvider } from './src/contexts/ConnectionProvider';
import { AuthProvider } from './src/contexts/AuthContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import StartupSplash from './src/components/StartupSplash';
export default function App() {
  const [showStartupSplash, setShowStartupSplash] = React.useState(true);

  useEffect(() => {
    // Load server and local base URLs from storage so services can use them
    setServerBaseUrlFromStorage();
    setLocalBaseUrlFromStorage();

    const timer = setTimeout(() => {
      setShowStartupSplash(false);
    }, 1700);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  return (
    <PaperProvider>
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
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </ThemeProvider>
    </PaperProvider>
  );
}
