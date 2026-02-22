import localDatabase from './localDatabase';
import api from './api';
import { API_ENDPOINTS } from '../config/apiEndpoints';

export interface PlaceOrderItemPayload {
  companyId: number;
  discountId?: number | null;
  categoryId: number;
  cartId?: string;
  categoryName: string;
  menuItemId: number;
  itemName: string;
  quantity: number;
  unitPrice: string;
  orderItemNote?: string;
  groupType: number;
  groupLabel?: string;
  customId?: number;
  tax?: any;
  discountItems?: any[];
  splitPaidQuantity?: number;
  extraCategory?: number;
  orderItemVariant?: any;
}

export interface PlaceOrderDetailsPayload {
  companyId: number;
  customerId?: number | null;
  userEmail?: string;
  userFirstName?: string;
  userLastName?: string;
  userMobile?: string | null;
  addresses?: any[];
  isCallerId?: boolean;
  customerCompanyName?: string;
  steuerId?: string;
  isDebitor?: boolean;
  currency?: string;
  isPickup: boolean;
  pickupDateTime: string | null;
  familyName?: string;
  orderType: string;
  isSandbox: boolean;
  isPriceIncludingTax: boolean;
  orderTaxTotal: number;
  orderCartTaxAndChargesTotal: number;
  orderDeliveryTypeId: number;
  orderPromoCodeDiscountTotal: number;
  countryCode: string;
  customerAddressId?: number | null;
  orderNotes?: string;
  orderDiscountTotal: number;
  orderItem: PlaceOrderItemPayload[];
  orderStatusId: number;
  orderSubTotal: number;
  orderTotal: number;
  createdAt: string;
  count: number;
  discountId?: number | null;
  discount?: any;
  user?: any;
  addedBy?: number | null;
  posId?: string;
  onHold?: boolean;
  holdingName?: string;
  tableNo?: number;
  tableArea?: any;
}

export interface CreateOrderPayload {
  orderStatusId: number;
  orderDetails: PlaceOrderDetailsPayload;
  companyId: number;
  settleInfo: any;
}

class OrderService {
  /**
   * Create a new order payload (POS_V2 local /api/v1/order/create shape)
   */
  async createOrder(orderData: CreateOrderPayload) {
    try {
      const result = await localDatabase.insert('order', orderData);
      return result;
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  }

  /**
   * Get all orders
   */
  async getAllOrders() {
    try {
      const orders = await localDatabase.select('order', { where: {} });
      return orders || [];
    } catch (error) {
      console.error('Error fetching orders:', error);
      return [];
    }
  }

  /**
   * Get orders by delivery type
   */
  async getOrdersByDeliveryType(deliveryType: number) {
    try {
      const orders = await localDatabase.select('order', { where: {} });
      return (orders || []).filter(
        (o: any) => o.orderDetails?.orderDeliveryTypeId === deliveryType
      );
    } catch (error) {
      console.error('Error fetching orders by type:', error);
      return [];
    }
  }

  /**
   * Get order by table number
   */
  async getOrderByTableNo(tableNo: number) {
    try {
      const orders = await localDatabase.select('order', { where: {} });
      return (orders || []).find(
        (o: any) => o.orderDetails?.tableNo === tableNo
      );
    } catch (error) {
      console.error('Error fetching order by table:', error);
      return null;
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: string, status: number) {
    try {
      const result = await localDatabase.update(
        'order',
        {
          orderStatusId: status,
          'orderDetails.orderStatusId': status,
          updatedAt: new Date().toISOString(),
        },
        { where: { _id: orderId } }
      );
      return result;
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  }

  /**
   * Update order total
   */
  async updateOrderTotal(orderId: string, total: number) {
    try {
      const result = await localDatabase.update(
        'order',
        {
          'orderDetails.orderTotal': total,
          updatedAt: new Date().toISOString(),
        },
        { where: { _id: orderId } }
      );
      return result;
    } catch (error) {
      console.error('Error updating order total:', error);
      throw error;
    }
  }

  /**
   * Mark order as paid
   */
  async markOrderAsPaid(orderId: string, paymentSummary?: any) {
    try {
      const updatePayload: any = {
        'orderDetails.isPaid': true,
        updatedAt: new Date().toISOString(),
      };

      if (paymentSummary) {
        updatePayload['orderDetails.orderPaymentSummary'] = paymentSummary;
        // keep existing orderStatus untouched; callers may set it separately if needed
      }

      const result = await localDatabase.update('order', updatePayload, {
        where: { _id: orderId },
      });

      return result;
    } catch (error) {
      console.error('Error marking order as paid:', error);
      throw error;
    }
  }

  /**
   * Call remote settle endpoint and persist server response to local DB.
   * Falls back to local-only mark if network call fails.
   */
  async settleOrder(orderId: string, settlePayload: any) {
    try {
      // POST to remote settle endpoint
      const res = await api.post(API_ENDPOINTS.order.SETTLE, settlePayload);

      // Expect server to return orderPaymentSummary and orderPaymentDetails
      const data = res?.data || {};
      const orderPaymentSummary = data.orderPaymentSummary ?? data.data?.orderPaymentSummary ?? data.dataValues?.orderPaymentSummary;
      const orderPaymentDetails = data.orderPaymentDetails ?? data.data?.orderPaymentDetails ?? data.dataValues?.orderPaymentDetails;
      const paidAt = data.paidAt ?? data.data?.paidAt ?? data.dataValues?.paidAt ?? new Date().toISOString();
      const tsc = data.tsc ?? data.data?.tsc ?? data.dataValues?.tsc;
      const invoiceNumber = data.invoiceNumber ?? data.data?.invoiceNumber ?? data.dataValues?.invoiceNumber;

      const updatePayload: any = {
        'orderDetails.isPaid': true,
        updatedAt: new Date().toISOString(),
        'orderDetails.orderPaymentSummary': orderPaymentSummary || settlePayload.orderPaymentSummary || settlePayload.paymentSummary,
      };

      if (orderPaymentDetails) updatePayload['orderDetails.orderPaymentDetails'] = orderPaymentDetails;
      if (paidAt) updatePayload['orderDetails.paidAt'] = paidAt;
      if (tsc) updatePayload['orderDetails.tsc'] = tsc;
      if (invoiceNumber) updatePayload['orderDetails.invoiceNumber'] = invoiceNumber;

      // Persist to local DB
      const result = await localDatabase.update('order', updatePayload, { where: { _id: orderId } });
      return { remote: true, result, data };
    } catch (error) {
      console.warn('Remote settle failed, falling back to local mark as paid:', error);
      // fallback: mark locally as paid with provided payment summary if available
      const paymentSummary = settlePayload?.orderPaymentSummary || settlePayload?.paymentSummary || settlePayload;
      const result = await this.markOrderAsPaid(orderId, paymentSummary);
      return { remote: false, result, error };
    }
  }

  /**
   * Delete order
   */
  async deleteOrder(orderId: string) {
    try {
      const result = await localDatabase.delete(
        'order',
        { where: { _id: orderId } }
      );
      return result;
    } catch (error) {
      console.error('Error deleting order:', error);
      throw error;
    }
  }
}

export default new OrderService();
