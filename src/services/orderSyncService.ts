import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSocket } from './socket';

type OrderSyncEvent = {
  eventType?: string;
  orderData?: any;
  posId?: string;
  timestamp?: string;
  companyId?: number;
};

type LockInfo = {
  sourceId: string;
  updatedAt: number;
};

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

const tableLocks = new Map<number, LockInfo>();
const orderLocks = new Map<string, LockInfo>();
const listeners = new Set<(event: OrderSyncEvent) => void>();

const deviceId = (() => {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 9);
  return `waiter_${ts}_${rand}`;
})();

let cachedCompanyId: number | null = null;

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const pruneLocks = () => {
  const now = Date.now();
  for (const [key, lock] of tableLocks.entries()) {
    if (now - lock.updatedAt > LOCK_TTL_MS) {
      tableLocks.delete(key);
    }
  }
  for (const [key, lock] of orderLocks.entries()) {
    if (now - lock.updatedAt > LOCK_TTL_MS) {
      orderLocks.delete(key);
    }
  }
};

const extractOrderInfo = (orderData: any) =>
  orderData?.orderInfo || orderData?.orderDetails || orderData || {};

const getOrderKey = (orderInfo: any): string | null => {
  const key =
    orderInfo?.orderNumber ||
    orderInfo?.customOrderId ||
    orderInfo?._id ||
    orderInfo?.orderId ||
    null;
  return key ? String(key) : null;
};

const applyLocks = (eventType: string, orderInfo: any, sourceId: string) => {
  const tableNo = orderInfo?.tableNo;
  const orderKey = getOrderKey(orderInfo);
  const now = Date.now();

  const lockTable = () => {
    if (tableNo) {
      tableLocks.set(Number(tableNo), { sourceId, updatedAt: now });
    }
  };
  const lockOrder = () => {
    if (orderKey) {
      orderLocks.set(String(orderKey), { sourceId, updatedAt: now });
    }
  };
  const unlockAll = () => {
    if (tableNo) tableLocks.delete(Number(tableNo));
    if (orderKey) orderLocks.delete(String(orderKey));
  };

  if (eventType === 'TABLE_LOCK') {
    lockTable();
  } else if (eventType === 'ORDER_LOCK' || eventType === 'PAY_LOCK') {
    lockOrder();
    lockTable();
  } else if (
    eventType === 'UNLOCK' ||
    eventType === 'ORDER_PLACED' ||
    eventType === 'ORDER_UPDATED' ||
    eventType === 'ORDER_PAID' ||
    eventType === 'ORDER_CANCELLED'
  ) {
    unlockAll();
  }

  pruneLocks();
};

const resolveCompanyId = async (): Promise<number> => {
  if (cachedCompanyId) return cachedCompanyId;
  const userDataStr = await AsyncStorage.getItem('userData');
  const userData = userDataStr ? JSON.parse(userDataStr) : null;
  const companyId = toNumber(userData?.companyId, 0);
  cachedCompanyId = companyId || null;
  return companyId;
};

export const initOrderSync = () => {
  const socket = getSocket();
  if (!socket) return;

  socket.off('pos-order-sync');
  socket.on('pos-order-sync', (payload: OrderSyncEvent) => {
    if (!payload) return;
    if (payload.posId === deviceId) return;
    const eventType = payload.eventType || 'ORDER_SYNC';
    const orderInfo = extractOrderInfo(payload.orderData);
    applyLocks(eventType, orderInfo, payload.posId || 'unknown');
    listeners.forEach((listener) => listener(payload));
  });
};

export const onOrderSync = (listener: (event: OrderSyncEvent) => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const emitOrderSync = async (
  eventType: string,
  orderInfo: any,
  orderData?: any
) => {
  const socket = getSocket();
  if (!socket) return;
  const companyId = await resolveCompanyId();
  const payload: OrderSyncEvent = {
    companyId,
    orderData: orderData || { orderInfo },
    eventType,
    timestamp: new Date().toISOString(),
    posId: deviceId,
  };

  applyLocks(eventType, orderInfo, deviceId);
  socket.emit('pos-order-sync', payload);
};

export const emitPosPrint = (orderInfo: any, paymentMethod?: number) => {
  const socket = getSocket();
  if (!socket) return;
  const payload = {
    isFinal: true,
    isPrint: true,
    paymentMethod: paymentMethod ?? orderInfo?.orderPaymentSummary?.paymentProcessorId ?? 0,
    isCorporate: orderInfo?.isCorporate ?? false,
    orderInfo,
  };
  socket.emit('new-order', payload);
};

export const emitPosKotPrint = (printOrder: any) => {
  const socket = getSocket();
  if (!socket) return;
  socket.emit('new-order', {
    ...printOrder,
    isPrint: true,
  });
};

export const isTableLocked = (tableNo: number): boolean => {
  if (!tableNo) return false;
  pruneLocks();
  const lock = tableLocks.get(Number(tableNo));
  if (!lock) return false;
  return lock.sourceId !== deviceId;
};

export const isOrderLocked = (orderOrId: any): boolean => {
  pruneLocks();
  const orderInfo = typeof orderOrId === 'object' ? orderOrId : { orderNumber: orderOrId };
  const key = getOrderKey(orderInfo);
  if (!key) return false;
  const lock = orderLocks.get(String(key));
  if (!lock) return false;
  return lock.sourceId !== deviceId;
};

export const lockTable = async (tableNo: number) => {
  if (!tableNo) return;
  await emitOrderSync('TABLE_LOCK', { tableNo });
};

export const unlockTable = async (tableNo: number) => {
  if (!tableNo) return;
  await emitOrderSync('UNLOCK', { tableNo });
};

export const lockOrder = async (order: any, eventType: string = 'ORDER_LOCK') => {
  if (!order) return;
  const orderInfo = order.orderDetails || order;
  const payload = {
    tableNo: orderInfo?.tableNo,
    orderNumber:
      order?.customOrderId ||
      orderInfo?.customOrderId ||
      orderInfo?.orderNumber ||
      order?._id ||
      order?.id,
  };
  await emitOrderSync(eventType, payload);
};

export const unlockOrder = async (order: any) => {
  if (!order) return;
  const orderInfo = order.orderDetails || order;
  const payload = {
    tableNo: orderInfo?.tableNo,
    orderNumber:
      order?.customOrderId ||
      orderInfo?.customOrderId ||
      orderInfo?.orderNumber ||
      order?._id ||
      order?.id,
  };
  await emitOrderSync('UNLOCK', payload);
};

export const lockPayment = async (order: any) => lockOrder(order, 'PAY_LOCK');
