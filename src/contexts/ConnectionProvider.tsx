import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import serverConnection from '../services/serverConnection';

type ConnectionContextValue = {
  isInternetReachable: boolean;
  isLocalServerReachable: boolean;
  localServerBaseUrl: string | null;
  isCheckingLocal: boolean;
  lastLocalCheck: number | null;
  canModifyOrders: boolean;
  reconnectLocalServer: () => Promise<boolean>;
  refreshLocalServerStatus: () => Promise<boolean>;
};

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

const LOCAL_CHECK_INTERVAL_MS = 15000;

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [isInternetReachable, setIsInternetReachable] = useState(true);
  const [isLocalServerReachable, setIsLocalServerReachable] = useState(serverConnection.isConnected());
  const [localServerBaseUrl, setLocalServerBaseUrl] = useState<string | null>(serverConnection.getServerUrl());
  const [isCheckingLocal, setIsCheckingLocal] = useState(false);
  const [lastLocalCheck, setLastLocalCheck] = useState<number | null>(null);
  const checkingRef = useRef(false);

  const updateInternetState = useCallback((state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
    if (state.isConnected === false) {
      setIsInternetReachable(false);
      return;
    }

    if (state.isInternetReachable === false) {
      setIsInternetReachable(false);
      return;
    }

    setIsInternetReachable(true);
  }, []);

  const refreshLocalServerStatus = useCallback(async (): Promise<boolean> => {
    if (checkingRef.current) return isLocalServerReachable;
    checkingRef.current = true;
    setIsCheckingLocal(true);
    try {
      const status = await serverConnection.refreshConnectionStatus();
      setIsLocalServerReachable(status.isConnected);
      setLocalServerBaseUrl(status.baseUrl);
      setLastLocalCheck(status.lastChecked || Date.now());
      return status.isConnected;
    } catch (_) {
      setIsLocalServerReachable(false);
      setLocalServerBaseUrl(serverConnection.getServerUrl());
      setLastLocalCheck(Date.now());
      return false;
    } finally {
      checkingRef.current = false;
      setIsCheckingLocal(false);
    }
  }, [isLocalServerReachable]);

  const reconnectLocalServer = useCallback(async (): Promise<boolean> => {
    return refreshLocalServerStatus();
  }, [refreshLocalServerStatus]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      updateInternetState({
        isConnected: state.isConnected ?? null,
        isInternetReachable: state.isInternetReachable ?? null,
      });
    });

    NetInfo.fetch()
      .then((state) => {
        updateInternetState({
          isConnected: state.isConnected ?? null,
          isInternetReachable: state.isInternetReachable ?? null,
        });
      })
      .catch(() => {});

    return unsubscribe;
  }, [updateInternetState]);

  useEffect(() => {
    refreshLocalServerStatus();
    const timer = setInterval(() => {
      refreshLocalServerStatus();
    }, LOCAL_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refreshLocalServerStatus]);

  const value = useMemo(
    () => ({
      isInternetReachable,
      isLocalServerReachable,
      localServerBaseUrl,
      isCheckingLocal,
      lastLocalCheck,
      canModifyOrders: isLocalServerReachable,
      reconnectLocalServer,
      refreshLocalServerStatus,
    }),
    [
      isInternetReachable,
      isLocalServerReachable,
      localServerBaseUrl,
      isCheckingLocal,
      lastLocalCheck,
      reconnectLocalServer,
      refreshLocalServerStatus,
    ]
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export const useConnection = (): ConnectionContextValue => {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }
  return context;
};
