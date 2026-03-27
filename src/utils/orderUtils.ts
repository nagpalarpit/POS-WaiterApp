import { AppLanguage, translate } from '../i18n/translations';

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

export function getOrderStatusLabel(orderOrId: any, language: AppLanguage = 'en'): string {
  const statusId = typeof orderOrId === 'number' ? orderOrId : (orderOrId?.orderDetails?.orderStatusId ?? orderOrId?.orderStatusId);

  if (statusId === ORDER_STATUS.PENDING) return translate(language, 'orderStatusPending');
  if (statusId === ORDER_STATUS.CONFIRMED) return translate(language, 'orderStatusConfirmed');
  if (statusId === ORDER_STATUS.AWAITING_PICKUP) return translate(language, 'orderStatusAwaitingPickup');
  if (statusId === ORDER_STATUS.IN_TRANSIT) return translate(language, 'orderStatusInTransit');
  if (statusId === ORDER_STATUS.DELIVERED) return translate(language, 'orderStatusDelivered');
  if (statusId === ORDER_STATUS.CANCELED) return translate(language, 'orderStatusCanceled');
  if (statusId === ORDER_STATUS.REJECTED) return translate(language, 'orderStatusRejected');
  if (statusId === ORDER_STATUS.REFUNDED) return translate(language, 'orderStatusRefunded');
  if (statusId === ORDER_STATUS.TSC_CANCELED) return translate(language, 'orderStatusTscCanceled');

  return translate(language, 'orderStatusUnknown');
}

export default {
  ORDER_STATUS,
  getOrderStatusLabel,
};
