import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { getSocket } from './socket';
import {
  buildPosPrintCurrentUser,
  mergeOrderCustomerData,
  resolveOrderCustomer,
} from '../utils/customerData';

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

type PersistedActiveLock = {
  eventType: 'TABLE_LOCK' | 'ORDER_LOCK' | 'PAY_LOCK';
  tableNo?: number | null;
  orderNumber?: string | number | null;
  updatedAt: number;
};

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PRINT_TTL_MS = 5 * 60 * 1000;

const tableLocks = new Map<number, LockInfo>();
const orderLocks = new Map<string, LockInfo>();
const listeners = new Set<(event: OrderSyncEvent) => void>();
let connectionListenersAttached = false;
const pendingPrintRequests = new Map<string, number>();
const handledPrintResults = new Map<string, number>();
const ACTIVE_LOCK_STORAGE_KEY = STORAGE_KEYS.activeOrderSyncLock;

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

const resetLockState = () => {
  tableLocks.clear();
  orderLocks.clear();
};

const extractLockSnapshot = (orderInfo: any): PersistedActiveLock | null => {
  const tableNo = orderInfo?.tableNo ?? null;
  const orderNumber =
    orderInfo?.orderNumber ??
    orderInfo?.customOrderId ??
    orderInfo?._id ??
    orderInfo?.orderId ??
    null;

  if (tableNo == null && orderNumber == null) {
    return null;
  }

  return {
    eventType: 'TABLE_LOCK',
    tableNo,
    orderNumber,
    updatedAt: Date.now(),
  };
};

const persistActiveLockSnapshot = async (
  eventType: string,
  orderInfo: any,
): Promise<void> => {
  try {
    if (eventType === 'TABLE_LOCK' || eventType === 'ORDER_LOCK' || eventType === 'PAY_LOCK') {
      const snapshot = extractLockSnapshot(orderInfo);
      if (snapshot) {
        snapshot.eventType = eventType as PersistedActiveLock['eventType'];
        await AsyncStorage.setItem(ACTIVE_LOCK_STORAGE_KEY, JSON.stringify(snapshot));
      }
      return;
    }

    if (
      eventType === 'UNLOCK' ||
      eventType === 'ORDER_PLACED' ||
      eventType === 'ORDER_UPDATED' ||
      eventType === 'ORDER_PAID' ||
      eventType === 'ORDER_CANCELLED'
    ) {
      await AsyncStorage.removeItem(ACTIVE_LOCK_STORAGE_KEY);
    }
  } catch (error) {
    console.log('Failed to persist active lock snapshot:', error);
  }
};

const readActiveLockSnapshot = async (): Promise<PersistedActiveLock | null> => {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_LOCK_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PersistedActiveLock;
    if (!parsed) return null;

    const tableNo = parsed.tableNo != null ? Number(parsed.tableNo) : null;
    const orderNumber = parsed.orderNumber != null ? String(parsed.orderNumber) : null;

    if (tableNo == null && orderNumber == null) {
      return null;
    }

    return {
      eventType: parsed.eventType,
      tableNo,
      orderNumber,
      updatedAt: Number(parsed.updatedAt) || Date.now(),
    };
  } catch (error) {
    console.log('Failed to read active lock snapshot:', error);
    return null;
  }
};

const clearActiveLockSnapshot = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(ACTIVE_LOCK_STORAGE_KEY);
  } catch (error) {
    console.log('Failed to clear active lock snapshot:', error);
  }
};

const prunePrintRequests = () => {
  const now = Date.now();
  for (const [key, ts] of pendingPrintRequests.entries()) {
    if (now - ts > PRINT_TTL_MS) pendingPrintRequests.delete(key);
  }
  for (const [key, ts] of handledPrintResults.entries()) {
    if (now - ts > PRINT_TTL_MS) handledPrintResults.delete(key);
  }
};

const createPrintRequestId = () => {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 9);
  return `print_${ts}_${rand}`;
};

const registerPrintRequest = () => {
  const requestId = createPrintRequestId();
  pendingPrintRequests.set(requestId, Date.now());
  prunePrintRequests();
  return requestId;
};

const extractPrintRequestId = (payload: any): string | null => {
  const id =
    payload?.printRequestId ||
    payload?.orderData?.printRequestId ||
    payload?.orderData?.orderInfo?.printRequestId ||
    payload?.orderInfo?.printRequestId ||
    null;
  return id ? String(id) : null;
};

const shouldHandlePrintResult = (requestId?: string | null): boolean => {
  if (!requestId) return false;
  prunePrintRequests();
  if (!pendingPrintRequests.has(requestId)) return false;
  if (handledPrintResults.has(requestId)) return false;
  pendingPrintRequests.delete(requestId);
  handledPrintResults.set(requestId, Date.now());
  return true;
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
  const userDataStr = await AsyncStorage.getItem(STORAGE_KEYS.authUser);
  const userData = userDataStr ? JSON.parse(userDataStr) : null;
  const companyId = toNumber(userData?.companyId, 0);
  cachedCompanyId = companyId || null;
  return companyId;
};

const removeOrderCalculationTaxFields = <T>(value: T): T => {
  if (value === undefined || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => removeOrderCalculationTaxFields(item)) as T;
  }

  if (value instanceof Date || typeof value !== 'object') {
    return value;
  }

  const sanitized: Record<string, any> = {};
  Object.entries(value as Record<string, any>).forEach(([key, itemValue]) => {
    if (key === 'orderTaxTotal' || key === 'orderCartTaxAndChargesTotal') {
      return;
    }
    sanitized[key] = removeOrderCalculationTaxFields(itemValue);
  });

  return sanitized as T;
};

type PosOrderSnapshotOptions = {
  keepPrintFields?: boolean;
};

export const sanitizeOrderInfoForPos = <T extends Record<string, any>>(
  orderInfo: T,
  options: PosOrderSnapshotOptions = {},
): T => {
  if (!orderInfo || typeof orderInfo !== 'object') {
    return orderInfo;
  }

  const sanitized: Record<string, any> = {
    ...orderInfo,
  };

  delete sanitized.localOrderId;
  delete sanitized._id;
  delete sanitized.id;
  delete sanitized.parentLocalOrderId;
  delete sanitized.parentStornoLocalOrderId;
  delete sanitized.paymentMethod;
  delete sanitized.orderPaymentSummary;
  delete sanitized.orderPaymentDetails;
  delete sanitized.giftCardLogs;
  delete sanitized.appliedGiftCard;
  delete sanitized.isfullPaidWithGiftCard;

  if (!options.keepPrintFields) {
    delete sanitized.printObj;
  } else if (sanitized.printObj && typeof sanitized.printObj === 'object') {
    sanitized.printObj = {
      ...sanitized.printObj,
    };
    delete sanitized.printObj.localOrderId;
    delete sanitized.printObj._id;
    delete sanitized.printObj.id;
  }

  return sanitized as T;
};

export const initOrderSync = () => {
  const socket = getSocket();
  if (!socket) return;

  resetLockState();

  if (!connectionListenersAttached) {
    socket.on('connect', () => {
      resetLockState();
    });
    socket.on('disconnect', () => {
      resetLockState();
    });
    connectionListenersAttached = true;
  }

  socket.off('pos-order-sync');
  socket.on('pos-order-sync', (payload: OrderSyncEvent) => {
    if (!payload) return;
    if (payload.posId === deviceId) return;
    const eventType = payload.eventType || 'ORDER_SYNC';
    if (eventType === 'PRINT_SUCCESS' || eventType === 'PRINT_ERROR') {
      const requestId = extractPrintRequestId(payload);
      if (!shouldHandlePrintResult(requestId)) return;
    }
    const orderInfo = extractOrderInfo(payload.orderData);
    applyLocks(eventType, orderInfo, payload.posId || 'unknown');
    listeners.forEach((listener) => listener(payload));
  });

  socket.off('waiter-print-status');
  socket.on('waiter-print-status', (payload: any) => {
    if (!payload) return;
    if (payload.posId === deviceId) return;
    const requestId = extractPrintRequestId(payload);
    if (!shouldHandlePrintResult(requestId)) return;
    const eventType = payload?.success ? 'PRINT_SUCCESS' : 'PRINT_ERROR';
    const orderData = {
      orderInfo: payload?.orderInfo,
      printRequestId: requestId,
      printMessage: payload?.printMessage,
      message: payload?.printMessage,
    };
    listeners.forEach((listener) =>
      listener({
        eventType,
        orderData,
        posId: payload?.posId,
        timestamp: payload?.timestamp,
        companyId: payload?.companyId,
      }),
    );
  });
};

export const onOrderSync = (listener: (event: OrderSyncEvent) => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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

  await persistActiveLockSnapshot(eventType, orderInfo);
  applyLocks(eventType, orderInfo, deviceId);
  socket.emit('pos-order-sync', payload);
};

export const emitPosPrint = (orderInfo: any, paymentMethod?: number) => {
  const socket = getSocket();
  if (!socket) return;
  const printRequestId = registerPrintRequest();
  const normalizedOrderInfo = sanitizeOrderInfoForPos(
    mergeOrderCustomerData(orderInfo),
    { keepPrintFields: true },
  );
  const currentUser = buildPosPrintCurrentUser(
    resolveOrderCustomer(normalizedOrderInfo),
  );
  const orderInfoWithRequest = removeOrderCalculationTaxFields({
    ...normalizedOrderInfo,
    printRequestId,
  });
  const payload = {
    isFinal: true,
    isPrint: true,
    isWaiterApp: true,
    paymentMethod: paymentMethod ?? orderInfo?.orderPaymentSummary?.paymentProcessorId ?? 0,
    isCorporate: orderInfo?.isCorporate ?? false,
    currentUser: currentUser ?? undefined,
    orderInfo: orderInfoWithRequest,
    printRequestId,
  };
  socket.emit('new-order', payload);
};

export const emitPosPrintPreview = (orderInfo: any, paymentMethod?: number) => {
  const socket = getSocket();
  if (!socket) return;
  const printRequestId = registerPrintRequest();
  const normalizedOrderInfo = sanitizeOrderInfoForPos(
    mergeOrderCustomerData(orderInfo),
    { keepPrintFields: true },
  );
  const currentUser = buildPosPrintCurrentUser(
    resolveOrderCustomer(normalizedOrderInfo),
  );
  const orderInfoWithRequest = removeOrderCalculationTaxFields({
    ...normalizedOrderInfo,
    printRequestId,
  });
  const payload = {
    isFinal: true,
    isPrint: true,
    isWaiterApp: true,
    preview: true,
    paymentMethod: paymentMethod ?? orderInfo?.orderPaymentSummary?.paymentProcessorId ?? 0,
    isCorporate: orderInfo?.isCorporate ?? false,
    currentUser: currentUser ?? undefined,
    orderInfo: orderInfoWithRequest,
    printRequestId,
  };
  socket.emit('new-order', payload);
};

export const emitPosCancelPrint = (order: any) => {
  const socket = getSocket();
  if (!socket || !order) return;
  const printRequestId = registerPrintRequest();
  const orderDetails = order?.orderDetails || order;
  const orderItems = Array.isArray(orderDetails?.orderItem)
    ? orderDetails.orderItem
    : Array.isArray(orderDetails?.orderItems)
      ? orderDetails.orderItems
      : [];
  const normalizedDetails = mergeOrderCustomerData({
    ...orderDetails,
    orderItem: orderItems,
    printRequestId,
  });
  const payload = {
    ...order,
    orderDetails: removeOrderCalculationTaxFields(normalizedDetails),
    isCanceled: true,
    isPrint: true,
    isWaiterApp: true,
    printRequestId,
  };
  socket.emit('new-order', payload);
};

export const emitPosKotPrint = (printOrder: any) => {
  const socket = getSocket();
  if (!socket) return;
  const printRequestId = registerPrintRequest();
  const normalizedOrderInfo = mergeOrderCustomerData(
    printOrder?.orderInfo || {},
    printOrder?.currentUser,
  );
  const currentUser = buildPosPrintCurrentUser(
    resolveOrderCustomer(normalizedOrderInfo, printOrder?.currentUser),
  );
  const orderInfoWithRequest = removeOrderCalculationTaxFields({
    ...normalizedOrderInfo,
    printRequestId,
  });
  socket.emit('new-order', {
    ...printOrder,
    currentUser: currentUser ?? undefined,
    isPrint: true,
    isWaiterApp: true,
    printRequestId,
    orderInfo: orderInfoWithRequest,
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

export const releasePersistedActiveLock = async (): Promise<boolean> => {
  const snapshot = await readActiveLockSnapshot();
  if (!snapshot) return false;

  const socket = getSocket();
  if (!socket || !socket.connected) {
    return false;
  }

  const payload: Record<string, any> = {};
  if (snapshot.tableNo != null) {
    payload.tableNo = snapshot.tableNo;
  }
  if (snapshot.orderNumber != null) {
    payload.orderNumber = snapshot.orderNumber;
  }

  if (!Object.keys(payload).length) {
    await clearActiveLockSnapshot();
    return false;
  }

  await emitOrderSync('UNLOCK', payload);
  await clearActiveLockSnapshot();
  return true;
};

export const lockPayment = async (order: any) => lockOrder(order, 'PAY_LOCK');
