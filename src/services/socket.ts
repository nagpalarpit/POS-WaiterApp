import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

let socket: Socket | null = null;

export const initSocket = async () => {
  if (socket) return socket;
  const base = (await AsyncStorage.getItem('BASE_URL')) || '';
  // If base is a http url, derive ws url
  const ws = base.replace(/^http/, 'ws');
  socket = io(ws, { transports: ['websocket'] });
  socket.on('connect', () => console.log('Socket connected'));
  socket.on('disconnect', () => console.log('Socket disconnected'));
  return socket;
};

export const getSocket = () => socket;
