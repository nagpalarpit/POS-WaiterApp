import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVER_BASE_URL } from '../config/env';
import serverConnection from './serverConnection';
import posIdService from './posIdService';

let socket: Socket | null = null;
const CLOUD_BASE_URL_KEY = 'SERVER_BASE_URL';

const getCloudBaseUrl = async (): Promise<string> => {
  const stored = await AsyncStorage.getItem(CLOUD_BASE_URL_KEY);
  const base = stored || SERVER_BASE_URL || '';
  return base.trim();
};

/**
 * Initialize socket connection for local server
 * Connects to the local POS server with waiter namespace
 * POS ID is optional - will be added if available
 */
export const initLocalSocket = async () => {
  try {
    // If socket already exists, disconnect first
    if (socket) {
      socket.disconnect();
      socket = null;
    }

    const baseUrl = serverConnection.getServerUrl();

    if (!baseUrl) {
      console.log('No local server URL configured');
      return null;
    }

    // Convert http URL to ws URL
    const wsUrl = baseUrl.replace(/^http/, 'ws');

    // Create socket connection with optional POS ID
    const queryObj: any = { type: 'waiter' };
    const posId = posIdService.getPosId();
    if (posId) {
      queryObj.posId = posId;
    }

    socket = io(wsUrl, {
      transports: ['websocket'],
      query: queryObj,
    });

    socket.on('connect', () => {
      console.log('Local Socket connected');
      const posId = posIdService.getPosId();
      if (posId) {
        console.log('  with POS ID:', posId);
      }
    });

    socket.on('disconnect', () => {
      console.log('Local Socket disconnected');
    });

    socket.on('error', (error) => {
      console.log('Local Socket error:', error);
    });

    return socket;
  } catch (error) {
    console.log('Error initializing local socket:', error);
    return null;
  }
};

/**
 * Initialize socket connection for cloud server
 * Connects to the cloud server with POS ID if available
 */
export const initCloudSocket = async () => {
  try {
    // If socket already exists, disconnect first
    if (socket) {
      socket.disconnect();
      socket = null;
    }

    const cloudBaseUrl = await getCloudBaseUrl();

    if (!cloudBaseUrl) {
      console.log('No cloud server URL configured');
      return null;
    }

    // Convert http URL to ws URL
    const wsUrl = cloudBaseUrl.replace(/^http/, 'ws');

    // Create socket connection with optional POS ID
    const queryObj: any = { type: 'waiter' };
    const posId = posIdService.getPosId();
    if (posId) {
      queryObj.posId = posId;
    }

    socket = io(wsUrl, {
      transports: ['websocket'],
      query: queryObj,
    });

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

/**
 * Disconnect socket
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
