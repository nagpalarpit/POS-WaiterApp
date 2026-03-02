import { useState, useEffect } from 'react';
import localDatabase from '../services/localDatabase';
import { getOrderStatusLabel } from '../utils/orderUtils';

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

      // Fetch all orders from 'order' collection
      const orders = await localDatabase.select('order', { where: {} });

      if (orders && Array.isArray(orders)) {
        setAllOrders(orders);

        // Separate orders by delivery type
        const dineIn = orders.filter(
          (o: Order) => o.orderDetails?.orderDeliveryTypeId === DELIVERY_TYPE.DINE_IN
        );
        const delivery = orders.filter(
          (o: Order) => o.orderDetails?.orderDeliveryTypeId === DELIVERY_TYPE.DELIVERY
        );
        const pickup = orders.filter(
          (o: Order) => o.orderDetails?.orderDeliveryTypeId === DELIVERY_TYPE.PICKUP
        );

        setDineInTables(dineIn);
        setDeliveryOrders(delivery);
        setPickupOrders(pickup);

        console.log('Orders fetched:', { 
          total: orders.length, 
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

  return {
    allOrders,
    dineInTables,
    deliveryOrders,
    pickupOrders,
    loading,
    fetchOrders,
  };
};
