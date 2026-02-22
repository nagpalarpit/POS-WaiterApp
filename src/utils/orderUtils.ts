export const ORDER_STATUS = {
  PENDING: 1,
  CONFIRMED: 2,
  AWAITING_PICKUP: 3,
  IN_TRANSIT: 4,
  DELIVERED: 5,
  CANCELED: 6,
  REJECTED: 7,
  REFUNDED: 8,
  TSC_CANCELED: 9,
};

export function getOrderStatusLabel(orderOrId: any): string {
  const statusId = typeof orderOrId === 'number' ? orderOrId : (orderOrId?.orderDetails?.orderStatusId ?? orderOrId?.orderStatusId);

  if (statusId === ORDER_STATUS.PENDING) return 'Pending';
  if (statusId === ORDER_STATUS.CONFIRMED) return 'Confirmed';
  if (statusId === ORDER_STATUS.AWAITING_PICKUP) return 'Awaiting Pickup';
  if (statusId === ORDER_STATUS.IN_TRANSIT) return 'In Transit';
  if (statusId === ORDER_STATUS.DELIVERED) return 'Delivered';
  if (statusId === ORDER_STATUS.CANCELED) return 'Canceled';
  if (statusId === ORDER_STATUS.REJECTED) return 'Rejected';
  if (statusId === ORDER_STATUS.REFUNDED) return 'Refunded';
  if (statusId === ORDER_STATUS.TSC_CANCELED) return 'TSC Canceled';

  return 'Unknown';
}

export default {
  ORDER_STATUS,
  getOrderStatusLabel,
};
