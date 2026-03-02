import { useState, useEffect } from 'react';
import { Order, DELIVERY_TYPE } from './useOrdersData';
import { Settings } from './useSettings';

/**
 * Hook for calculating table statistics for dine-in orders
 */
export const useTableStatistics = (dineInOrders: Order[], settings: Settings | null) => {
  const [availableTablesCount, setAvailableTablesCount] = useState(0);
  const [bookedTablesCount, setBookedTablesCount] = useState(0);
  const [semiPaidTablesCount, setSemiPaidTablesCount] = useState(0);

  /**
   * Calculate table statuses: available, booked, semi-paid
   */
  const calculateTableStatuses = (dineInTableOrders: Order[]) => {
    const settingsData = settings || { totalTables: 20 };
    const totalTables = settingsData.totalTables || 20;
    const occupiedTableNumbers = new Set(
      dineInTableOrders.map((o) => o.orderDetails?.tableNo).filter(Boolean)
    );

    // Booked: tables with active orders
    // Semi-paid: tables with partially paid orders
    // Available: remaining tables
    let booked = 0;
    let semiPaid = 0;

    dineInTableOrders.forEach((order) => {
      const total = Number(order.orderDetails?.orderTotal ?? 0) || 0;
      const paymentDetails = Array.isArray((order as any).orderDetails?.orderPaymentDetails)
        ? (order as any).orderDetails.orderPaymentDetails
        : [];

      const paidSum = paymentDetails.reduce(
        (s: number, p: any) => s + (Number(p.paymentTotal) || 0),
        0
      );

      if (paidSum > 0 && paidSum < total) {
        semiPaid++;
      } else {
        booked++;
      }
    });

    const available = totalTables - occupiedTableNumbers.size;

    setAvailableTablesCount(Math.max(0, available));
    setBookedTablesCount(Math.max(0, booked));
    setSemiPaidTablesCount(Math.max(0, semiPaid));

    console.log('Table statistics:', { available, booked, semiPaid });
  };

  useEffect(() => {
    calculateTableStatuses(dineInOrders);
  }, [dineInOrders, settings]);

  return {
    availableTablesCount,
    bookedTablesCount,
    semiPaidTablesCount,
    calculateTableStatuses,
  };
};
