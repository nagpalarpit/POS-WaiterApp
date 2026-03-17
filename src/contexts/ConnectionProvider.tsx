import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import serverConnection from '../services/serverConnection';
import {
  connectLocalSocket,
  disconnectSocket,
  initCloudStatusSocket,
  onCloudSocketStatusChange,
  onLocalSocketStatusChange,
  pauseLocalSocketReconnect,
  resumeLocalSocketReconnect,
} from '../services/socket';

type ConnectionContextValue = {
  isInternetReachable: boolean;
  isLocalServerReachable: boolean;
  localServerBaseUrl: string | null;
  isCheckingLocal: boolean;
  lastLocalCheck: number | null;
  canModifyOrders: boolean;
  reconnectLocalServer: () => Promise<boolean>;
  refreshLocalServerStatus: () => Promise<boolean>;
  pauseLocalServerRetry: () => void;
  resumeLocalServerRetry: () => Promise<boolean>;
};

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [isInternetReachable, setIsInternetReachable] = useState(true);
  const [isLocalServerReachable, setIsLocalServerReachable] = useState(serverConnection.isConnected());
  const [localServerBaseUrl, setLocalServerBaseUrl] = useState<string | null>(serverConnection.getServerUrl());
  const [isCheckingLocal, setIsCheckingLocal] = useState(false);
  const [lastLocalCheck, setLastLocalCheck] = useState<number | null>(null);
  const checkingRef = useRef(false);
  const pendingCheckRef = useRef<Promise<boolean> | null>(null);
  const networkConnectedRef = useRef(true);

  const updateInternetState = useCallback((state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
    const connected = state.isConnected === true;
    networkConnectedRef.current = connected;

    if (!connected) {
      setIsInternetReachable(false);
      return;
    }

    if (state.isInternetReachable === false) {
      setIsInternetReachable(false);
      return;
    }

    setIsInternetReachable(true);
  }, []);

  const refreshInternetStatus = useCallback(async () => {
    try {
      const state = await NetInfo.fetch();
      updateInternetState({
        isConnected: state.isConnected ?? null,
        isInternetReachable: state.isInternetReachable ?? null,
      });
      if (state.isConnected === true) {
        await initCloudStatusSocket();
      }
    } catch (_) { }
  }, [updateInternetState]);

  const refreshLocalServerStatus = useCallback(async (): Promise<boolean> => {
    if (pendingCheckRef.current) {
      return pendingCheckRef.current;
    }

    const runCheck = async (): Promise<boolean> => {
      const baseUrl = serverConnection.getServerUrl() || (await serverConnection.hydrateStoredConnection());

      if (!baseUrl) {
        disconnectSocket();
        setIsLocalServerReachable(false);
        setLocalServerBaseUrl(null);
        setLastLocalCheck(Date.now());
        setIsCheckingLocal(false);
        return false;
      }

      checkingRef.current = true;
      setIsCheckingLocal(true);
      setLocalServerBaseUrl(baseUrl);

      try {
        const connected = await connectLocalSocket();
        setIsLocalServerReachable(connected);
        setLastLocalCheck(Date.now());
        return connected;
      } catch (_) {
        setIsLocalServerReachable(false);
        setLastLocalCheck(Date.now());
        return false;
      } finally {
        checkingRef.current = false;
        setIsCheckingLocal(false);
      }
    };

    pendingCheckRef.current = runCheck().finally(() => {
      pendingCheckRef.current = null;
    });

    return pendingCheckRef.current;
  }, []);

  const reconnectLocalServer = useCallback(async (): Promise<boolean> => {
    return refreshLocalServerStatus();
  }, [refreshLocalServerStatus]);

  const pauseLocalServerRetry = useCallback(() => {
    pendingCheckRef.current = null;
    checkingRef.current = false;
    setIsCheckingLocal(false);
    pauseLocalSocketReconnect();
    setIsLocalServerReachable(false);
    setLastLocalCheck(Date.now());
  }, []);

  const resumeLocalServerRetry = useCallback(async (): Promise<boolean> => {
    resumeLocalSocketReconnect();
    return refreshLocalServerStatus();
  }, [refreshLocalServerStatus]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      updateInternetState({
        isConnected: state.isConnected ?? null,
        isInternetReachable: state.isInternetReachable ?? null,
      });

      if (state.isConnected === true) {
        void initCloudStatusSocket();
      }
    });

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshInternetStatus();
      }
    });

    void refreshInternetStatus();

    return () => {
      unsubscribe();
      appStateSubscription.remove();
    };
  }, [refreshInternetStatus, updateInternetState]);

  useEffect(() => {
    const unsubscribe = onLocalSocketStatusChange((connected) => {
      setIsLocalServerReachable(connected);
      setLocalServerBaseUrl(serverConnection.getServerUrl());
      setLastLocalCheck(Date.now());
      checkingRef.current = false;
      pendingCheckRef.current = null;
      setIsCheckingLocal(false);
    });

    refreshLocalServerStatus();

    return unsubscribe;
  }, [refreshLocalServerStatus]);

  useEffect(() => {
    const unsubscribe = onCloudSocketStatusChange((connected) => {
      if (!networkConnectedRef.current) {
        setIsInternetReachable(false);
        return;
      }

      if (connected) {
        setIsInternetReachable(true);
      }
    });

    void initCloudStatusSocket();

    return unsubscribe;
  }, []);

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
      pauseLocalServerRetry,
      resumeLocalServerRetry,
    }),
    [
      isInternetReachable,
      isLocalServerReachable,
      localServerBaseUrl,
      isCheckingLocal,
      lastLocalCheck,
      reconnectLocalServer,
      refreshLocalServerStatus,
      pauseLocalServerRetry,
      resumeLocalServerRetry,
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
