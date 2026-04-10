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

const PRINT_TTL_MS = 5 * 60 * 1000;

const listeners = new Set<(event: OrderSyncEvent) => void>();
let connectionListenersAttached = false;
const pendingPrintRequests = new Map<string, number>();
const handledPrintResults = new Map<string, number>();
let activeOpenContext: {
  tableNo: number | null;
  orderNumber: string | null;
  eventType: string | null;
  updatedAt: number;
} | null = null;
const pendingOpenChecks = new Map<
  string,
  {
    resolve: (value: { hasConflict: boolean; conflictType: 'table' | 'order' | null }) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

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

const resetLockState = () => {
  activeOpenContext = null;
  for (const [requestId, pending] of pendingOpenChecks.entries()) {
    clearTimeout(pending.timer);
    pending.resolve({ hasConflict: false, conflictType: null });
    pendingOpenChecks.delete(requestId);
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

const normalizeTableNo = (value: any): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeOpenContext = (orderInfo: any): {
  tableNo: number | null;
  orderNumber: string | null;
} => ({
  tableNo: normalizeTableNo(orderInfo?.tableNo),
  orderNumber: getOrderKey(orderInfo),
});

const hasContextValue = (context: {
  tableNo: number | null;
  orderNumber: string | null;
}): boolean => context.tableNo !== null || context.orderNumber !== null;

const syncLocalOpenContext = (eventType: string, orderInfo: any) => {
  const context = normalizeOpenContext(orderInfo);

  if (eventType === 'TABLE_LOCK' || eventType === 'ORDER_LOCK' || eventType === 'PAY_LOCK') {
    if (!hasContextValue(context)) return;
    activeOpenContext = {
      ...context,
      eventType,
      updatedAt: Date.now(),
    };
    return;
  }

  if (
    eventType === 'UNLOCK' ||
    eventType === 'ORDER_PLACED' ||
    eventType === 'ORDER_UPDATED' ||
    eventType === 'ORDER_PAID' ||
    eventType === 'ORDER_CANCELLED'
  ) {
    if (!activeOpenContext) return;
    if (!hasContextValue(context)) {
      activeOpenContext = null;
      return;
    }

    const sameTable =
      context.tableNo !== null &&
      activeOpenContext.tableNo !== null &&
      context.tableNo === activeOpenContext.tableNo;
    const sameOrder =
      !!context.orderNumber &&
      !!activeOpenContext.orderNumber &&
      context.orderNumber === activeOpenContext.orderNumber;

    if (sameTable || sameOrder) {
      activeOpenContext = null;
    }
  }
};

const findOpenConflict = (orderInfo: any): 'table' | 'order' | null => {
  if (!activeOpenContext) return null;

  const context = normalizeOpenContext(orderInfo);

  if (
    context.tableNo !== null &&
    activeOpenContext.tableNo !== null &&
    context.tableNo === activeOpenContext.tableNo
  ) {
    return 'table';
  }

  if (
    context.orderNumber &&
    activeOpenContext.orderNumber &&
    context.orderNumber === activeOpenContext.orderNumber
  ) {
    return 'order';
  }

  return null;
};

const buildOpenCheckRequestId = () => {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 9);
  return `open_check_${ts}_${rand}`;
};

const handleOpenCheckRequest = (payload: OrderSyncEvent) => {
  if (!payload) return;
  if (payload.posId === deviceId) return;

  const requestId =
    (payload?.orderData as any)?.requestId ||
    (payload as any)?.requestId ||
    null;
  if (!requestId) return;

  const orderInfo = extractOrderInfo(payload.orderData);
  const conflictType = findOpenConflict(orderInfo);
  if (!conflictType) return;

  const socket = getSocket();
  if (!socket) return;

  socket.emit('pos-order-sync', {
    companyId: payload.companyId ?? cachedCompanyId ?? undefined,
    orderData: {
      requestId,
      conflictType,
      orderInfo: normalizeOpenContext(orderInfo),
    },
    eventType: 'OPEN_CHECK_CONFLICT',
    timestamp: new Date().toISOString(),
    posId: deviceId,
  });
};

const handleOpenCheckConflict = (payload: OrderSyncEvent) => {
  const requestId =
    (payload?.orderData as any)?.requestId ||
    (payload as any)?.requestId ||
    null;
  if (!requestId) return;

  const pending = pendingOpenChecks.get(String(requestId));
  if (!pending) return;

  clearTimeout(pending.timer);
  pendingOpenChecks.delete(String(requestId));
  pending.resolve({
    hasConflict: true,
    conflictType:
      ((payload?.orderData as any)?.conflictType as 'table' | 'order' | null) ||
      null,
  });
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
    if (eventType === 'OPEN_CHECK_REQUEST') {
      handleOpenCheckRequest(payload);
      return;
    }
    if (eventType === 'OPEN_CHECK_CONFLICT') {
      handleOpenCheckConflict(payload);
      return;
    }
    if (eventType === 'PRINT_SUCCESS' || eventType === 'PRINT_ERROR') {
      const requestId = extractPrintRequestId(payload);
      if (!shouldHandlePrintResult(requestId)) return;
    }
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

export const isLocalOrderSyncEvent = (event?: OrderSyncEvent | null): boolean => {
  if (!event?.posId) return false;
  return event.posId === deviceId;
};

export const isRemoteOrderSyncEvent = (event?: OrderSyncEvent | null): boolean => {
  if (!event?.posId) return false;
  return event.posId !== deviceId;
};

export const emitOrderSync = async (
  eventType: string,
  orderInfo: any,
  orderData?: any
) => {
  const socket = getSocket();
  syncLocalOpenContext(eventType, orderInfo);

  if (
    eventType === 'TABLE_LOCK' ||
    eventType === 'ORDER_LOCK' ||
    eventType === 'PAY_LOCK' ||
    eventType === 'UNLOCK'
  ) {
    return;
  }

  if (!socket) return;
  const companyId = await resolveCompanyId();
  const payload: OrderSyncEvent = {
    companyId,
    orderData: orderData || { orderInfo },
    eventType,
    timestamp: new Date().toISOString(),
    posId: deviceId,
  };

  socket.emit('pos-order-sync', payload);
};

export const emitOrderCompletionStarted = async (
  actionType: 'PLACE' | 'PAY',
  orderInfo: any,
) => {
  const context = normalizeOpenContext(orderInfo);
  if (!hasContextValue(context)) return;

  await emitOrderSync('ORDER_COMPLETION_STARTED', context, {
    orderInfo: context,
    actionType,
  });
};

export const hasActiveOrderSyncConflict = (orderInfo: any): boolean => {
  return findOpenConflict(orderInfo) !== null;
};

export const clearActiveOrderSyncContext = (): void => {
  activeOpenContext = null;
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
  return false;
};

export const isOrderLocked = (orderOrId: any): boolean => {
  return false;
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
  return false;
};

export const lockPayment = async (order: any) => lockOrder(order, 'PAY_LOCK');

export const checkRemoteOpenConflict = async (
  orderInfo: any,
  timeoutMs = 450,
): Promise<{ hasConflict: boolean; conflictType: 'table' | 'order' | null }> => {
  const socket = getSocket();
  if (!socket || !socket.connected) {
    return { hasConflict: false, conflictType: null };
  }

  const context = normalizeOpenContext(orderInfo);
  if (!hasContextValue(context)) {
    return { hasConflict: false, conflictType: null };
  }

  const companyId = await resolveCompanyId();
  const requestId = buildOpenCheckRequestId();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingOpenChecks.delete(requestId);
      resolve({ hasConflict: false, conflictType: null });
    }, timeoutMs);

    pendingOpenChecks.set(requestId, { resolve, timer });

    socket.emit('pos-order-sync', {
      companyId,
      orderData: {
        requestId,
        orderInfo: context,
      },
      eventType: 'OPEN_CHECK_REQUEST',
      timestamp: new Date().toISOString(),
      posId: deviceId,
    });
  });
};
