import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storageKeys';
import localDatabase from '../services/localDatabase';
import { ORDER_STATUS } from '../utils/orderUtils';
import { onOrderSync } from '../services/orderSyncService';

export const DELIVERY_TYPE = {
  DINE_IN: 0,
  DELIVERY: 1,
  PICKUP: 2,
};

export interface Order {
  _id: string;
  id?: string;
  customOrderId?: string;
  orderStatusId?: number;
  orderDetails: {
    orderDeliveryTypeId: number;
    tableNo?: number;
    tableArea?: any;
    orderStatusId?: number;
    orderTotal: number;
    isPaid?: number;
  };
  createdAt?: string;
}

/**
 * Hook for fetching and managing orders from local database
 */
export const useOrdersData = () => {
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [dineInTables, setDineInTables] = useState<Order[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<Order[]>([]);
  const [pickupOrders, setPickupOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncRefreshToken, setSyncRefreshToken] = useState(0);

  const toNumber = (value: unknown, fallback = 0): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
  };

  const hasRemainingItems = (order: Order): boolean => {
    const items = (order as any)?.orderDetails?.orderItem;
    if (!Array.isArray(items)) return false;
    return items.some((item: any) => toNumber(item?.quantity, 0) > 0);
  };

  const isOrderActive = (order: Order): boolean => {
    const rootStatusId = (order as any)?.orderStatusId;
    const detailStatusId = (order as any)?.orderDetails?.orderStatusId;
    const isPaidFlag = (order as any)?.orderDetails?.isPaid === 1;
    const isSplitOrder = (order as any)?.orderDetails?.isSplitOrder === true;

    const isDeliveredBoth =
      rootStatusId === ORDER_STATUS.DELIVERED &&
      detailStatusId === ORDER_STATUS.DELIVERED;

    const isPendingRoot = rootStatusId === ORDER_STATUS.PENDING;

    // POS partial split can mark orderDetails as DELIVERED while root stays PENDING.
    // Treat such orders as active if they still have remaining items and are not paid.
    const isActiveSplitRemainder =
      isPendingRoot &&
      detailStatusId === ORDER_STATUS.DELIVERED &&
      isSplitOrder &&
      !isPaidFlag &&
      hasRemainingItems(order);

    if (isPaidFlag) return false;
    if (isActiveSplitRemainder) return true;
    if (isDeliveredBoth) return false;

    return true;
  };

  /**
   * Fetch all orders from local database
   */
  const fetchOrders = async () => {
    try {
      setLoading(true);

      // Get user info from AsyncStorage to retrieve companyId
      const userDataStr = await AsyncStorage.getItem(STORAGE_KEYS.authUser);
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      const companyId = userData?.companyId;

      // Fetch orders from 'order' collection with companyId filter
      const orders = await localDatabase.select('order', {
        where: {
          ...(companyId ? { companyId } : {}),
          orderStatusId: 1,
        },
      });

      if (orders && Array.isArray(orders)) {
        const activeOrders = orders.filter((o: Order) => isOrderActive(o));

        setAllOrders(activeOrders);

        // Separate orders by delivery type
        const dineIn = activeOrders.filter(
          (o: Order) => o.orderDetails?.orderDeliveryTypeId === DELIVERY_TYPE.DINE_IN
        );
        const delivery = activeOrders.filter(
          (o: Order) => o.orderDetails?.orderDeliveryTypeId === DELIVERY_TYPE.DELIVERY
        );
        const pickup = activeOrders.filter(
          (o: Order) => o.orderDetails?.orderDeliveryTypeId === DELIVERY_TYPE.PICKUP
        );

        setDineInTables(dineIn);
        setDeliveryOrders(delivery);
        setPickupOrders(pickup);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    const unsubscribe = onOrderSync((event) => {
      const type = (event?.eventType || 'ORDER_SYNC').toUpperCase();
      if (type.endsWith('LOCK') || type === 'UNLOCK') return;
      setSyncRefreshToken((current) => current + 1);
    });
    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    if (syncRefreshToken > 0) {
      const timeoutId = setTimeout(() => {
        void fetchOrders();
      }, 300);

      void fetchOrders();

      return () => clearTimeout(timeoutId);
    }
  }, [syncRefreshToken]);

  return {
    allOrders,
    dineInTables,
    deliveryOrders,
    pickupOrders,
    loading,
    fetchOrders,
  };
};
