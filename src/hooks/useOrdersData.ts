import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

  /**
   * Fetch all orders from local database
   */
  const fetchOrders = async () => {
    try {
      setLoading(true);

      // Get user info from AsyncStorage to retrieve companyId
      const userDataStr = await AsyncStorage.getItem('userData');
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      const companyId = userData?.companyId;

      console.log('OrdersData: User data retrieved:', { companyId });

      // Fetch orders from 'order' collection with companyId filter
      const orders = await localDatabase.select('order', {
        where: {
          ...(companyId ? { companyId } : {}),
          orderStatusId: 1,
        },
      });

      if (orders && Array.isArray(orders)) {
        const activeOrders = orders.filter((o: Order) => {
          const statusId = o.orderDetails?.orderStatusId ?? o.orderStatusId;
          const isPaid =
            statusId === ORDER_STATUS.DELIVERED ||
            o.orderDetails?.isPaid === 1;
          return !isPaid;
        });

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

        console.log('Orders fetched:', { 
          total: activeOrders.length, 
          dineIn: dineIn.length, 
          delivery: delivery.length, 
          pickup: pickup.length 
        });
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
      fetchOrders();
    });
    return () => { unsubscribe(); };
  }, []);

  return {
    allOrders,
    dineInTables,
    deliveryOrders,
    pickupOrders,
    loading,
    fetchOrders,
  };
};

