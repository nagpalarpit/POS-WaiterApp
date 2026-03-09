import localDatabase from "./localDatabase";
import api from "./api";
import { API_ENDPOINTS } from "../config/apiEndpoints";

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
  private normalizeSettleResponse(data: any, settlePayload: any) {
    const raw = data ?? {};
    const dataLayer = raw?.data ?? null;
    const inner = dataLayer?.data ?? dataLayer ?? raw;
    const dataValues =
      inner?.dataValues ??
      dataLayer?.dataValues ??
      raw?.dataValues ??
      inner ??
      raw;

    const orderPaymentSummary =
      raw?.orderPaymentSummary ??
      dataLayer?.orderPaymentSummary ??
      dataLayer?.data?.orderPaymentSummary ??
      inner?.orderPaymentSummary ??
      dataValues?.orderPaymentSummary ??
      settlePayload?.orderInfo?.orderPaymentSummary;

    const orderPaymentDetails =
      raw?.orderPaymentDetails ??
      dataLayer?.orderPaymentDetails ??
      dataLayer?.data?.orderPaymentDetails ??
      inner?.orderPaymentDetails ??
      dataValues?.orderPaymentDetails;

    const paidAt =
      dataValues?.paidAt ??
      inner?.paidAt ??
      dataLayer?.paidAt ??
      raw?.paidAt ??
      settlePayload?.orderInfo?.paidAt ??
      new Date().toISOString();

    const tsc =
      dataValues?.tsc ??
      inner?.tsc ??
      dataLayer?.tsc ??
      raw?.tsc;
    const invoiceNumber =
      dataValues?.invoiceNumber ??
      inner?.invoiceNumber ??
      dataLayer?.invoiceNumber ??
      raw?.invoiceNumber ??
      settlePayload?.orderInfo?.invoiceNumber;

    const giftCardLogs =
      raw?.giftCardLogs ??
      dataLayer?.giftCardLogs ??
      inner?.giftCardLogs ??
      dataValues?.giftCardLogs;

    const orderCustomerDetails =
      raw?.orderCustomerDetails ??
      dataLayer?.orderCustomerDetails ??
      inner?.orderCustomerDetails ??
      dataValues?.orderCustomerDetails;

    const fallbackPaymentSummary = orderPaymentSummary ?? {
      paymentProcessorId: settlePayload?.paymentMethod,
      amount: settlePayload?.amount,
      tip: settlePayload?.tip,
      deliveryCharge: settlePayload?.deliveryCharge,
      paidAt,
    };

    const fallbackPaymentDetails =
      orderPaymentDetails ??
      (settlePayload?.paymentMethod != null
        ? [
            {
              paymentProcessorId: settlePayload?.paymentMethod,
              paymentTotal: settlePayload?.amount ?? 0,
            },
          ]
        : undefined);

    return {
      orderPaymentSummary: fallbackPaymentSummary,
      orderPaymentDetails: fallbackPaymentDetails,
      paidAt,
      tsc,
      invoiceNumber,
      giftCardLogs,
      orderCustomerDetails,
    };
  }

  /**
   * Create a new order payload (POS_V2 local /api/v1/order/create shape)
   */
  async createOrder(orderData: CreateOrderPayload) {
    try {
      const result = await localDatabase.insert("order", orderData);
      return result;
    } catch (error) {
      console.error("Error creating order:", error);
      throw error;
    }
  }

  /**
   * Update an existing order (POS_V2 update shape)
   */
  async updateOrder(orderId: string, newData: any) {
    try {
      const result = await localDatabase.update("order", newData, {
        where: { id: orderId },
      });
      return result;
    } catch (error) {
      console.error("Error updating order:", error);
      throw error;
    }
  }

  /**
   * Get all orders
   */
  async getAllOrders() {
    try {
      const orders = await localDatabase.select("order", { where: {} });
      return orders || [];
    } catch (error) {
      console.error("Error fetching orders:", error);
      return [];
    }
  }

  /**
   * Get orders by delivery type
   */
  async getOrdersByDeliveryType(deliveryType: number) {
    try {
      const orders = await localDatabase.select("order", { where: {} });
      return (orders || []).filter(
        (o: any) => o.orderDetails?.orderDeliveryTypeId === deliveryType,
      );
    } catch (error) {
      console.error("Error fetching orders by type:", error);
      return [];
    }
  }

  /**
   * Get order by table number
   */
  async getOrderByTableNo(tableNo: number) {
    try {
      const orders = await localDatabase.select("order", { where: {} });
      return (orders || []).find(
        (o: any) => o.orderDetails?.tableNo === tableNo,
      );
    } catch (error) {
      console.error("Error fetching order by table:", error);
      return null;
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: string, status: number) {
    try {
      const result = await localDatabase.update(
        "order",
        {
          orderStatusId: status,
          "orderDetails.orderStatusId": status,
          updatedAt: new Date().toISOString(),
        },
        { where: { _id: orderId } },
      );
      return result;
    } catch (error) {
      console.error("Error updating order status:", error);
      throw error;
    }
  }

  /**
   * Update order total
   */
  async updateOrderTotal(orderId: string, total: number) {
    try {
      const result = await localDatabase.update(
        "order",
        {
          "orderDetails.orderTotal": total,
          updatedAt: new Date().toISOString(),
        },
        { where: { _id: orderId } },
      );
      return result;
    } catch (error) {
      console.error("Error updating order total:", error);
      throw error;
    }
  }

  /**
   * Mark order as paid
   */
  async markOrderAsPaid(orderId: string, paymentSummary?: any) {
    try {
      const updatePayload: any = {
        "orderDetails.isPaid": true,
        updatedAt: new Date().toISOString(),
      };

      if (paymentSummary) {
        updatePayload["orderDetails.orderPaymentSummary"] = paymentSummary;
        // keep existing orderStatus untouched; callers may set it separately if needed
      }

      const result = await localDatabase.update("order", updatePayload, {
        where: { _id: orderId },
      });

      return result;
    } catch (error) {
      console.error("Error marking order as paid:", error);
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

      console.log("res===>", res);

      const data = res?.data || {};
      const normalized = this.normalizeSettleResponse(data, settlePayload);

      const updatePayload: any = {
        orderStatusId: 5,
        isSynced: true,
        settleInfo: settlePayload,
        "orderDetails.orderStatusId": 5,
        "orderDetails.isPaid": true,
        "orderDetails.orderPaymentSummary": normalized.orderPaymentSummary,
        "orderDetails.orderPaymentDetails": normalized.orderPaymentDetails,
        "orderDetails.paidAt": normalized.paidAt,
        updatedAt: normalized.paidAt,
      };
      if (normalized.tsc !== undefined) {
        updatePayload["orderDetails.tsc"] = normalized.tsc;
      }
      if (normalized.invoiceNumber !== undefined) {
        updatePayload["orderDetails.invoiceNumber"] = normalized.invoiceNumber;
      }
      if (normalized.giftCardLogs !== undefined) {
        updatePayload["orderDetails.giftCardLogs"] = normalized.giftCardLogs;
      }
      if (normalized.orderCustomerDetails !== undefined) {
        updatePayload["orderDetails.orderCustomerDetails"] =
          normalized.orderCustomerDetails;
      }

      // Persist to local DB
      const result = await localDatabase.update("order", updatePayload, {
        where: { id: orderId },
      });
      return { remote: true, result, data, normalized };
    } catch (error) {
      console.warn(
        "Remote settle failed, falling back to local mark as paid:",
        error,
      );
      // fallback: mark locally as paid with provided payment summary if available
      const normalized = this.normalizeSettleResponse({}, settlePayload);
      const result = await this.markOrderAsPaid(
        orderId,
        normalized.orderPaymentSummary,
      );
      return { remote: false, result, error, normalized };
    }
  }

  /**
   * Delete order
   */
  async deleteOrder(orderId: string) {
    try {
      const result = await localDatabase.delete("order", {
        where: { _id: orderId },
      });
      return result;
    } catch (error) {
      console.error("Error deleting order:", error);
      throw error;
    }
  }
}

export default new OrderService();
