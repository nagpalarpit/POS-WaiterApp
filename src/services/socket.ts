import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVER_BASE_URL } from '../config/env';
import { STORAGE_KEYS } from '../constants/storageKeys';
import serverConnection from './serverConnection';
import posIdService from './posIdService';

let socket: Socket | null = null;
let socketKind: 'local' | 'cloud' | null = null;
let socketUrl: string | null = null;
let localReconnectPaused = false;
const localSocketListeners = new Set<(connected: boolean) => void>();

const emitLocalSocketStatus = (connected: boolean) => {
  serverConnection.setConnectionState(connected);
  localSocketListeners.forEach((listener) => listener(connected));
};

const markSocketKind = (kind: 'local' | 'cloud' | null) => {
  const switchedAwayFromLocal = socketKind === 'local' && kind !== 'local';
  socketKind = kind;
  if (switchedAwayFromLocal) {
    emitLocalSocketStatus(false);
  }
};

const attachLocalSocketLifecycle = (target: Socket) => {
  target.on('connect', () => {
    console.log('Local Socket connected');
    const posId = posIdService.getPosId();
    if (posId) {
      console.log('  with POS ID:', posId);
    }
    emitLocalSocketStatus(true);
  });

  target.on('disconnect', () => {
    console.log('Local Socket disconnected');
    emitLocalSocketStatus(false);
  });

  target.on('connect_error', (error) => {
    console.log('Local Socket connect error:', error);
    emitLocalSocketStatus(false);
  });

  target.on('error', (error) => {
    console.log('Local Socket error:', error);
    emitLocalSocketStatus(false);
  });
};

const getCloudBaseUrl = async (): Promise<string> => {
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.cloudBaseUrl);
  const base = stored || SERVER_BASE_URL || '';
  return base.trim();
};

/**
 * Initialize socket connection for local server
 * Connects to the local POS server with waiter namespace
 * POS ID is optional - will be added if available
 */
export const initLocalSocket = async (options?: { force?: boolean }) => {
  try {
    if (localReconnectPaused && !options?.force) {
      return null;
    }

    const baseUrl = serverConnection.getServerUrl();

    if (!baseUrl) {
      console.log('No local server URL configured');
      markSocketKind(null);
      serverConnection.setConnectionState(false, null);
      emitLocalSocketStatus(false);
      return null;
    }

    // Convert http URL to ws URL
    const wsUrl = baseUrl.replace(/^http/, 'ws');

    if (socket && socketKind === 'local' && socketUrl === wsUrl) {
      if (!socket.connected && !socket.active) {
        socket.connect();
      }
      return socket;
    }

    // If socket already exists for some other endpoint/kind, disconnect first
    if (socket) {
      socket.disconnect();
      socket = null;
      socketUrl = null;
    }

    // Create socket connection with optional POS ID
    const queryObj: any = { type: 'waiter' };
    const posId = posIdService.getPosId();
    if (posId) {
      queryObj.posId = posId;
    }

    markSocketKind('local');

    socket = io(wsUrl, {
      transports: ['websocket'],
      query: queryObj,
    });
    socketUrl = wsUrl;

    attachLocalSocketLifecycle(socket);

    return socket;
  } catch (error) {
    console.log('Error initializing local socket:', error);
    markSocketKind(null);
    serverConnection.setConnectionState(false);
    emitLocalSocketStatus(false);
    return null;
  }
};

export const connectLocalSocket = async (timeoutMs = 4000, options?: { force?: boolean }): Promise<boolean> => {
  const localSocket = await initLocalSocket(options);

  if (!localSocket) {
    return false;
  }

  if (localSocket.connected) {
    emitLocalSocketStatus(true);
    return true;
  }

  return new Promise((resolve) => {
    let settled = false;

    const finalize = (connected: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      localSocket.off('connect', handleConnect);
      localSocket.off('connect_error', handleFailure);
      localSocket.off('disconnect', handleFailure);
      localSocket.off('error', handleFailure);
      resolve(connected);
    };

    const handleConnect = () => finalize(true);
    const handleFailure = () => finalize(false);

    const timeoutId = setTimeout(() => {
      finalize(localSocket.connected);
    }, timeoutMs);

    localSocket.once('connect', handleConnect);
    localSocket.once('connect_error', handleFailure);
    localSocket.once('disconnect', handleFailure);
    localSocket.once('error', handleFailure);
  });
};

/**
 * Initialize socket connection for cloud server
 * Connects to the cloud server with POS ID if available
 */
export const initCloudSocket = async () => {
  try {
    const cloudBaseUrl = await getCloudBaseUrl();

    if (!cloudBaseUrl) {
      console.log('No cloud server URL configured');
      markSocketKind(null);
      return null;
    }

    // Convert http URL to ws URL
    const wsUrl = cloudBaseUrl.replace(/^http/, 'ws');

    if (socket && socketKind === 'cloud' && socketUrl === wsUrl) {
      if (!socket.connected && !socket.active) {
        socket.connect();
      }
      return socket;
    }

    // If socket already exists for some other endpoint/kind, disconnect first
    if (socket) {
      socket.disconnect();
      socket = null;
      socketUrl = null;
    }

    // Create socket connection with optional POS ID
    const queryObj: any = { type: 'waiter' };
    const posId = posIdService.getPosId();
    if (posId) {
      queryObj.posId = posId;
    }

    markSocketKind('cloud');

    socket = io(wsUrl, {
      transports: ['websocket'],
      query: queryObj,
    });
    socketUrl = wsUrl;

    socket.on('connect', () => {
      console.log('Cloud Socket connected');
      const posId = posIdService.getPosId();
      if (posId) {
        console.log('  with POS ID:', posId);
      }
    });

    socket.on('disconnect', () => {
      console.log('Cloud Socket disconnected');
    });

    socket.on('error', (error) => {
      console.log('Cloud Socket error:', error);
    });

    return socket;
  } catch (error) {
    console.log('Error initializing cloud socket:', error);
    markSocketKind(null);
    return null;
  }
};

/**
 * Get current socket instance
 */
export const getSocket = () => socket;

/**
 * Check if socket is connected
 */
export const isSocketConnected = (): boolean => {
  return socket?.connected || false;
};

export const isLocalSocketConnected = (): boolean => {
  return socketKind === 'local' && (socket?.connected || false);
};

export const onLocalSocketStatusChange = (listener: (connected: boolean) => void) => {
  localSocketListeners.add(listener);
  listener(isLocalSocketConnected());
  return () => {
    localSocketListeners.delete(listener);
  };
};

export const pauseLocalSocketReconnect = () => {
  localReconnectPaused = true;

  if (socketKind !== 'local') {
    return;
  }

  if (socket) {
    socket.io.opts.reconnection = false;
    socket.disconnect();
    socket = null;
  }

  socketUrl = null;
  serverConnection.setConnectionState(false, serverConnection.getServerUrl());
  markSocketKind(null);
};

export const resumeLocalSocketReconnect = () => {
  localReconnectPaused = false;
};

/**
 * Disconnect socket
 */
export const disconnectSocket = () => {
  localReconnectPaused = false;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socketUrl = null;
  serverConnection.setConnectionState(false, socketKind === 'local' ? serverConnection.getServerUrl() : null);
  markSocketKind(null);
};
