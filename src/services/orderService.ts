import localDatabase from "./localDatabase";
import api from "./api";
import { API_ENDPOINTS } from "../config/apiEndpoints";

export interface PlaceOrderItemPayload {
  companyId: number;
  discountId?: number | string | null;
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
  deliveryCharge?: number;
  createdAt: string;
  count: number;
  discountId?: number | string | null;
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
  private static readonly ORDER_STATUS_DELIVERED = 5;
  private readonly omittedOrderCalculationKeys = new Set([
    'orderTaxTotal',
    'orderCartTaxAndChargesTotal',
  ]);

  private isNetworkError(error: any): boolean {
    const code = `${error?.code || ''}`.toUpperCase();
    const message = `${error?.message || ''}`.toLowerCase();
    const hasNoResponse = !error?.response;
    return (
      code === 'ECONNABORTED' ||
      code === 'ETIMEDOUT' ||
      code === 'ERR_NETWORK' ||
      message.includes('network') ||
      message.includes('timeout') ||
      hasNoResponse
    );
  }

  private isNotFoundError(error: any): boolean {
    return (
      error?.response?.status === 404 ||
      `${error?.message || ''}`.toLowerCase().includes('not found')
    );
  }

  private pushIdCandidate(target: Array<number | string>, value: any): void {
    if (value === undefined || value === null || value === '') return;

    const normalized =
      typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value)
        : value;

    if (!target.some((item) => item === normalized)) {
      target.push(normalized);
    }
  }

  private removeNullishDeep<T>(value: T): T {
    if (value === undefined || value === null) {
      return undefined as T;
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => this.removeNullishDeep(item))
        .filter((item) => item !== undefined) as T;
    }

    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'object') {
      const sanitized: Record<string, any> = {};

      Object.entries(value as Record<string, any>).forEach(([key, itemValue]) => {
        if (this.omittedOrderCalculationKeys.has(key)) return;
        if (itemValue === undefined || itemValue === null) return;

        const cleanedValue = this.removeNullishDeep(itemValue);
        if (cleanedValue !== undefined) {
          sanitized[key] = cleanedValue;
        }
      });

      return sanitized as T;
    }

    return value;
  }

  private pickDefinedFields(source: any, keys: string[]): Record<string, any> {
    const picked: Record<string, any> = {};

    keys.forEach((key) => {
      const value = source?.[key];
      if (value !== undefined && value !== null) {
        picked[key] = value;
      }
    });

    return picked;
  }

  private stripUndefinedDeep<T>(value: T): T {
    if (value === undefined) {
      return undefined as T;
    }

    if (value === null || typeof value !== 'object' || value instanceof Date) {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => this.stripUndefinedDeep(item))
        .filter((item) => item !== undefined) as T;
    }

    const sanitized: Record<string, any> = {};

    Object.entries(value as Record<string, any>).forEach(([key, itemValue]) => {
      if (itemValue === undefined) return;

      const cleanedValue = this.stripUndefinedDeep(itemValue);
      if (cleanedValue !== undefined) {
        sanitized[key] = cleanedValue;
      }
    });

    return sanitized as T;
  }

  private buildEditPaymentSettleOrderInfo(orderInfo: any): any {
    const merged = this.stripUndefinedDeep({ ...(orderInfo || {}) }) || {};

    delete merged.id;
    delete merged._id;
    delete merged.paymentMethod;
    delete merged.tip;
    delete merged.deliveryCharge;
    delete merged.orderPaymentSummary;
    delete merged.orderPaymentDetails;

    if (!Object.prototype.hasOwnProperty.call(merged, 'pickupDateTime')) {
      merged.pickupDateTime = null;
    }

    if (!Object.prototype.hasOwnProperty.call(merged, 'orderTaxTotal')) {
      merged.orderTaxTotal = 0;
    }

    if (!Object.prototype.hasOwnProperty.call(merged, 'orderCartTaxAndChargesTotal')) {
      merged.orderCartTaxAndChargesTotal = 0;
    }

    const resolvedCompany =
      merged.company ?? merged.user?.company ?? merged.tableArea?.company ?? undefined;

    if (resolvedCompany) {
      merged.company = resolvedCompany;

      if (merged.tableArea && !merged.tableArea.company) {
        merged.tableArea = {
          ...merged.tableArea,
          company: resolvedCompany,
        };
      }
    }

    if (Array.isArray(merged.orderItem)) {
      merged.orderItem = merged.orderItem.map((item: any) => {
        const nextItem = this.stripUndefinedDeep({ ...(item || {}) }) || {};

        if (!Object.prototype.hasOwnProperty.call(nextItem, 'atgOrderPayload')) {
          nextItem.atgOrderPayload = null;
        }

        if (Array.isArray(nextItem.discountItems) && nextItem.discountItems.length === 0) {
          delete nextItem.discountItems;
        }

        return nextItem;
      });
    }

    return merged;
  }

  private buildCompactSettleOrderInfo(orderInfo: any): any {
    return this.removeNullishDeep(
      this.pickDefinedFields(orderInfo, [
        'companyId',
        'currency',
        'orderStatusId',
        'localOrderId',
        'customOrderId',
        'updatedAt',
        'paidAt',
        'paymentMethod',
        'tip',
        'deliveryCharge',
        'discountId',
        'discount',
        'customDiscountValue',
        'paidBy',
        'invoiceNumber',
        'tsc',
        'isCorporate',
        'isFinalBillPrint',
        'canceledOrderPayment',
        'isfullPaidWithGiftCard',
        'giftCard',
        'appliedGiftCard',
        'giftCardTotal',
        'giftCardLogs',
        'orderPaymentSummary',
        'orderPaymentDetails',
        'orderCustomerDetails',
        'customerId',
        'userEmail',
        'userFirstName',
        'userLastName',
        'userMobile',
        'addresses',
        'isCallerId',
        'customerCompanyName',
        'steuerId',
        'isDebitor',
        'customerAddressId',
        'customer',
        'isTscOffline',
      ]),
    );
  }

  buildLocalSettleInfo(
    settlePayload: any,
    orderInfo?: any,
    extra: any = {},
  ): any {
    const extraOrderInfo = extra?.orderInfo || {};
    const mergedOrderInfo = this.buildEditPaymentSettleOrderInfo({
      ...(orderInfo ?? settlePayload?.orderInfo ?? {}),
      ...extraOrderInfo,
    });
    const extraFields = { ...(extra || {}) };
    delete extraFields.orderInfo;

    const sanitizedSettleInfo = this.removeNullishDeep({
      ...this.pickDefinedFields(settlePayload, [
        'currency',
        'amount',
        'tip',
        'deliveryCharge',
        'isEditPayment',
        'print',
        'splitLog',
        'isOrderPaid',
        'isTscOffline',
      ]),
      ...extraFields,
    });

    if (mergedOrderInfo && Object.keys(mergedOrderInfo).length > 0) {
      sanitizedSettleInfo.orderInfo = mergedOrderInfo;
    }

    return sanitizedSettleInfo;
  }

  private buildRemoteSettleOrderInfo(orderInfo: any): any {
    const sourceOrderInfo = this.stripUndefinedDeep({ ...(orderInfo || {}) }) || {};
    const normalizedOrderInfo = this.buildEditPaymentSettleOrderInfo(orderInfo);

    if (!normalizedOrderInfo || typeof normalizedOrderInfo !== 'object') {
      return normalizedOrderInfo;
    }

    const remoteOrderInfo = { ...normalizedOrderInfo };

    const remoteLocalOrderId =
      sourceOrderInfo.localOrderId ??
      sourceOrderInfo._id ??
      sourceOrderInfo.id;

    if (remoteLocalOrderId !== undefined && remoteLocalOrderId !== null && remoteLocalOrderId !== '') {
      remoteOrderInfo.localOrderId = remoteLocalOrderId;
    }

    delete remoteOrderInfo.id;
    delete remoteOrderInfo._id;
    delete remoteOrderInfo.settleInfo;
    delete remoteOrderInfo.orderDetails;

    return remoteOrderInfo;
  }

  private buildRemoteSettlePayload(settlePayload: any): any {
    const sanitizedRemotePayload =
      this.removeNullishDeep({
        ...this.pickDefinedFields(settlePayload, [
          'id',
          'currency',
          'paymentMethod',
          'amount',
          'moneyBack',
          'tip',
          'deliveryCharge',
          'isEditPayment',
          'print',
          'splitLog',
          'isOrderPaid',
          'isTscOffline',
        ]),
      }) || {};

    const remoteOrderInfo = this.buildRemoteSettleOrderInfo(
      settlePayload?.orderInfo || {},
    );

    if (remoteOrderInfo && Object.keys(remoteOrderInfo).length > 0) {
      sanitizedRemotePayload.orderInfo = remoteOrderInfo;
    }

    return sanitizedRemotePayload;
  }

  private async resolveOrderIdCandidates(
    orderId: string,
    orderInfo?: any,
  ): Promise<Array<number | string>> {
    const idCandidates: Array<number | string> = [];

    // Prefer explicit numeric/local ids first
    this.pushIdCandidate(idCandidates, orderInfo?.id);
    this.pushIdCandidate(idCandidates, orderInfo?.localOrderId);
    this.pushIdCandidate(idCandidates, orderInfo?.orderId);
    this.pushIdCandidate(idCandidates, orderId);

    // If caller passed Mongo `_id`, resolve the corresponding numeric `id` and use only `id` for update
    try {
      const byMongoId = await localDatabase.select('order', {
        where: { _id: orderId },
      });
      const found = Array.isArray(byMongoId) ? byMongoId[0] : null;
      this.pushIdCandidate(idCandidates, found?.id);
      this.pushIdCandidate(idCandidates, found?.localOrderId);
      this.pushIdCandidate(idCandidates, found?.orderDetails?.localOrderId);
    } catch (_) {}

    // Resolve explicit localOrderId when it is provided as Mongo _id string
    const localOrderId = orderInfo?.localOrderId;
    if (localOrderId !== undefined && localOrderId !== null && localOrderId !== '') {
      try {
        const byLocalMongoId = await localDatabase.select('order', {
          where: { _id: localOrderId },
        });
        const found = Array.isArray(byLocalMongoId) ? byLocalMongoId[0] : null;
        this.pushIdCandidate(idCandidates, found?.id);
        this.pushIdCandidate(idCandidates, found?.localOrderId);
      } catch (_) {}
    }

    // Optional fallback resolution by custom/order number
    const customOrderId =
      orderInfo?.customOrderId || orderInfo?.orderNumber || orderInfo?.customId;
    if (customOrderId !== undefined && customOrderId !== null && customOrderId !== '') {
      try {
        const byCustomId = await localDatabase.select('order', {
          where: { customOrderId },
        });
        const found = Array.isArray(byCustomId) ? byCustomId[0] : null;
        this.pushIdCandidate(idCandidates, found?.id);
        this.pushIdCandidate(idCandidates, found?.localOrderId);
        this.pushIdCandidate(idCandidates, found?.orderDetails?.localOrderId);
      } catch (_) {}
    }

    return idCandidates;
  }

  private async updateOrderWithFallback(
    orderId: string,
    updatePayload: any,
    orderInfo?: any,
  ): Promise<any> {
    const idCandidates = await this.resolveOrderIdCandidates(orderId, orderInfo);
    let lastError: any = null;

    for (const id of idCandidates) {
      try {
        return await localDatabase.update('order', updatePayload, {
          where: { id },
        });
      } catch (error: any) {
        lastError = error;
        // Continue trying alternative ids on 404/not-found only
        if (!this.isNotFoundError(error)) {
          throw error;
        }
      }
    }

    throw lastError || new Error('Unable to update local order by id');
  }

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

    let giftCardLogs =
      raw?.giftCardLogs ??
      dataLayer?.giftCardLogs ??
      inner?.giftCardLogs ??
      dataValues?.giftCardLogs;

    if (giftCardLogs && !Array.isArray(giftCardLogs)) {
      giftCardLogs = [giftCardLogs];
    }

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

  private buildSettleUpdatePayload(
    settlePayload: any,
    normalized: any,
    isSynced: boolean,
  ): any {
    const orderInfo = settlePayload?.orderInfo || {};
    const paidAt =
      normalized?.paidAt ||
      orderInfo?.paidAt ||
      new Date().toISOString();

    const orderDetails: any = {
      ...orderInfo,
      orderStatusId: OrderService.ORDER_STATUS_DELIVERED,
      updatedAt: paidAt,
      paidAt,
      orderPaymentSummary:
        normalized?.orderPaymentSummary ?? orderInfo?.orderPaymentSummary,
      orderPaymentDetails:
        normalized?.orderPaymentDetails ?? orderInfo?.orderPaymentDetails,
    };

    if (normalized?.tsc !== undefined) {
      orderDetails.tsc = normalized.tsc;
    }
    if (normalized?.invoiceNumber !== undefined) {
      orderDetails.invoiceNumber = normalized.invoiceNumber;
    }
    if (normalized?.giftCardLogs !== undefined) {
      orderDetails.giftCardLogs = normalized.giftCardLogs;
    }
    if (normalized?.orderCustomerDetails !== undefined) {
      orderDetails.orderCustomerDetails = normalized.orderCustomerDetails;
    }

    const settleInfo = this.buildLocalSettleInfo(settlePayload, orderDetails);

    // Match POS local update payload structure
    return this.removeNullishDeep({
      orderStatusId: OrderService.ORDER_STATUS_DELIVERED,
      isSynced,
      settleInfo,
      orderDetails,
    });
  }

  /**
   * Create a new order payload (POS_V2 local /api/v1/order/create shape)
   */
  async createOrder(orderData: CreateOrderPayload) {
    try {
      const sanitizedOrderData = this.removeNullishDeep(orderData);
      const result = await localDatabase.insert("order", sanitizedOrderData);
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
      const sanitizedData = this.removeNullishDeep(newData);
      const result = await this.updateOrderWithFallback(orderId, sanitizedData);
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
      const result = await this.updateOrderWithFallback(
        orderId,
        {
          orderStatusId: status,
          "orderDetails.orderStatusId": status,
          updatedAt: new Date().toISOString(),
        },
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
      const result = await this.updateOrderWithFallback(
        orderId,
        {
          "orderDetails.orderTotal": total,
          updatedAt: new Date().toISOString(),
        },
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
  async markOrderAsPaid(
    orderId: string,
    paymentSummary?: any,
    settlePayload?: any,
  ) {
    try {
      const sanitizedSettlePayload = this.removeNullishDeep(
        settlePayload || { orderInfo: {} },
      );
      const paidAt =
        paymentSummary?.paidAt ??
        paymentSummary?.createdAt ??
        new Date().toISOString();
      const updatePayload = this.buildSettleUpdatePayload(
        sanitizedSettlePayload,
        {
          orderPaymentSummary: paymentSummary,
          orderPaymentDetails: sanitizedSettlePayload?.orderInfo?.orderPaymentDetails,
          paidAt,
        },
        false,
      );
      updatePayload.orderDetails.isPaid = true;
      updatePayload.orderDetails.isDeleted =
        updatePayload.orderDetails?.isDeleted ?? false;

      const result = await this.updateOrderWithFallback(orderId, updatePayload);

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
  async settleOrder(orderId: string, settlePayload: any, allowOfflineFallback: boolean = false) {
    try {
      const sanitizedSettlePayload = this.removeNullishDeep(settlePayload);
      const remoteSettlePayload = this.buildRemoteSettlePayload(
        sanitizedSettlePayload,
      );

      // POST to remote settle endpoint
      const res = await api.post(API_ENDPOINTS.order.SETTLE, remoteSettlePayload);

      console.log("res===>", res);

      const data = res?.data || {};
      const normalized = this.normalizeSettleResponse(data, remoteSettlePayload);
      const updatePayload = this.buildSettleUpdatePayload(
        sanitizedSettlePayload,
        normalized,
        true,
      );
      updatePayload.orderDetails.isPaid = true;
      updatePayload.orderDetails.isDeleted =
        updatePayload.orderDetails?.isDeleted ?? false;

      // Persist to local DB
      const result = await this.updateOrderWithFallback(
        orderId,
        updatePayload,
        sanitizedSettlePayload?.orderInfo,
      );
      return { remote: true, result, data, normalized };
    } catch (error) {
      if (!this.isNetworkError(error) || !allowOfflineFallback) {
        throw error;
      }

      console.warn(
        "Remote settle failed (network), falling back to local mark as paid:",
        error,
      );
      // fallback: mark locally as paid with provided payment summary if available
      const sanitizedSettlePayload = this.removeNullishDeep(settlePayload);
      const normalized = this.normalizeSettleResponse({}, sanitizedSettlePayload);
      const fallbackPaymentSummary = {
        ...(normalized.orderPaymentSummary || {}),
        paidAt:
          normalized.paidAt ||
          normalized.orderPaymentSummary?.paidAt ||
          new Date().toISOString(),
      };
      const result = await this.markOrderAsPaid(
        orderId,
        fallbackPaymentSummary,
        sanitizedSettlePayload,
      );
      return {
        remote: false,
        result,
        error,
        normalized,
        isNetworkError: true,
      };
    }
  }

  /**
   * Call remote placeOrder endpoint (used for cancel/remove flow sync).
   */
  async placeOrder(orderPayload: any) {
    try {
      const sanitizedOrderPayload = this.removeNullishDeep(orderPayload);
      const res = await api.post(API_ENDPOINTS.order.CREATE, sanitizedOrderPayload);
      return res?.data ?? res;
    } catch (error) {
      console.error("Error placing order:", error);
      throw error;
    }
  }

  /**
   * Call remote bulk-settle endpoint for split-payment completion.
   * Local order persistence is handled by caller before/after remote call.
   */
  async settleBulkOrder(items: any[]) {
    try {
      const sanitizedItems = this.removeNullishDeep(items);
      const remoteItems = Array.isArray(sanitizedItems)
        ? sanitizedItems.map((item: any) => this.buildRemoteSettlePayload(item))
        : [];
      const res = await api.post(API_ENDPOINTS.order.SETTLE_BULK, remoteItems);
      return res?.data ?? res;
    } catch (error) {
      console.warn("Remote bulk settle failed:", error);
      throw error;
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
