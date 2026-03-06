import { useState, useEffect } from 'react';
import { Order } from './useOrdersData';
import { Settings } from './useSettings';

const getActiveTableNumbers = (settings: Settings | null): number[] => {
  const tableAreas = settings?.tableAreas;

  if (Array.isArray(tableAreas) && tableAreas.length > 0) {
    const tableNos = tableAreas.flatMap((area: any) =>
      Array.isArray(area?.tableAreaMappings)
        ? area.tableAreaMappings
            .filter((mapping: any) => mapping?.isActive !== false)
            .map((mapping: any) => Number(mapping.tableNo))
        : []
    );

    const unique = Array.from(
      new Set(tableNos.filter((value: number) => Number.isFinite(value)))
    );

    return unique.sort((a, b) => a - b);
  }

  const totalTables = Number(settings?.totalTables ?? 0) || 0;
  if (totalTables > 0) {
    return Array.from({ length: totalTables }, (_, i) => i + 1);
  }

  return [];
};

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
    const activeTables = getActiveTableNumbers(settingsData);
    const activeTableSet = new Set(activeTables);

    const scopedOrders = activeTables.length > 0
      ? dineInTableOrders.filter((order) =>
          activeTableSet.has(Number(order.orderDetails?.tableNo))
        )
      : dineInTableOrders;

    const occupiedTableNumbers = new Set(
      scopedOrders
        .map((o) => Number(o.orderDetails?.tableNo))
        .filter((value) => Number.isFinite(value))
    );

    // Booked: tables with active orders
    // Semi-paid: tables with partially paid orders
    // Available: remaining tables
    let booked = 0;
    let semiPaid = 0;

    scopedOrders.forEach((order) => {
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

    const totalTables = activeTables.length > 0
      ? activeTables.length
      : settingsData.totalTables || 20;
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
