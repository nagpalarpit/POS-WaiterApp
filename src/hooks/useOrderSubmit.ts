import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storageKeys';
import orderService, { PlaceOrderItemPayload } from '../services/orderService';
import cartService, { Cart, CartItem, AttributeValue } from '../services/cartService';
import posIdService from '../services/posIdService';
import tscService from '../services/tscService';
import {
  getAttributeValueName,
  getAttributeValuePrice,
  getAttributeValueQuantity,
  getCartItemQuantity,
  getCartSubtotal,
  getDiscountAmount,
} from '../utils/cartCalculations';
import {
  buildPosOrderCustomer,
  buildPosOrderCustomerFields,
} from '../utils/customerData';
import { OrderServiceTiming } from '../types/orderFlow';

const ORDER_STATUS_PENDING = 1;
const TSC_OFFLINE_MESSAGE = 'Active TSS not found for the given POS and company.';

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
};

/**
 * Convert delivery type to order type string
 */
const getOrderType = (deliveryType: number): string => {
  if (deliveryType === 1) return 'delivery';
  if (deliveryType === 2) return 'pickup';
  if (deliveryType === 3) return 'kiosk';
  return 'table';
};

/**
 * Convert discount type from cart format to POS_V2 format
 */
const getPosV2DiscountType = (discountType?: string): number => {
  return discountType === 'PERCENTAGE' || discountType === 'CUSTOM' ? 1 : 0;
};

/**
 * Hook for managing order submission and calculations
 */
export const useOrderSubmit = (
  cart: Cart,
  tableNo: number | null,
  deliveryType: number,
  tableArea?: any,
  existingOrder?: any,
  serviceTiming?: OrderServiceTiming | null
) => {
  const [loading, setLoading] = useState(false);

  /**
   * Prepare order items from cart
   */
  const prepareOrderItems = (
    companyId: number,
    itemsOverride?: CartItem[],
  ): PlaceOrderItemPayload[] => {
    const discountId = cart.discount?.discountId ?? null;
    const sourceItems = itemsOverride ?? cart.items;
    return sourceItems.map((item: CartItem) => {
      const orderItem: PlaceOrderItemPayload = {
        companyId,
        discountId,
        categoryId: item.categoryId,
        cartId: item.cartId,
        categoryName: item.categoryName,
        menuItemId: item.itemId,
        itemName: item.itemName,
        quantity: item.quantity,
        unitPrice: `${item.itemPrice || 0}`,
        orderItemNote: item.orderItemNote || '',
        groupType: item.groupType,
        groupLabel: item.groupLabel,
        customId: item.customId,
        tax: item.tax,
        discountItems: item.discountItems,
        splitPaidQuantity: 0,
      };
      if (item.extraCategory !== undefined && item.extraCategory !== null) {
        orderItem.extraCategory = item.extraCategory;
      }

      if (item.variantId) {
        orderItem.orderItemVariant = {
          menuItemVariantId: item.variantId,
          description: '',
          name: item.variantName || '',
          quantity: 1,
          unitPrice: `${item.variantPrice || 0}`,
          discountedPrice: 0,
          discountId: null,
        };

        if (item.attributeId) {
          orderItem.orderItemVariant.orderItemVariantAttributes = [
            {
              menuItemVariantAttributeId: item.attributeId,
              description: '',
              name: item.attributeName || '',
              quantity: 1,
              unitPrice: `${item.attributePrice || 0}`,
              discountedPrice: 0,
              discountId: null,
              orderItemVariantAttributeValues: (item.attributeValues || []).map(
                (attributeValue: any) => ({
                  description: attributeValue.attributeValueDescription || '',
                  menuItemVariantAttributeId: item.attributeId,
                  menuItemVariantAttributeValueId:
                    attributeValue.attributeValueId || attributeValue.id || null,
                  name:
                    attributeValue.attributeValueName ||
                    attributeValue.name ||
                    '',
                  quantity:
                    attributeValue.attributeValueQuantity ||
                    attributeValue.quantity ||
                    1,
                  unitPrice: `${
                    attributeValue.attributeValuePrice ||
                    attributeValue.price ||
                    attributeValue.unitPrice ||
                    0
                  }`,
                  discountedPrice: 0,
                  discountId: null,
                })
              ),
            },
          ];
        }
      }

      return orderItem;
    });
  };

  /**
   * Submit order to server
   */
  const submitOrder = async (tax: number): Promise<{ success: boolean; order?: any }> => {
    try {
      void tax;
      if (!cart.items?.length) {
        throw new Error('No items in cart');
      }

      if (deliveryType === 0 && !tableNo) {
        throw new Error('Please select table');
      }

      setLoading(true);

      const userDataStr = await AsyncStorage.getItem(STORAGE_KEYS.authUser);
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      const companyId = Number(
        existingOrder?.companyId ||
          existingOrder?.orderDetails?.companyId ||
          userData?.companyId ||
          0
      );

      if (!companyId) {
        throw new Error('Company ID missing. Please login again.');
      }

      const subtotal = getCartSubtotal(cart);
      const discount = getDiscountAmount(subtotal, cart.discount);
      const orderNote = cart.orderNote || '';
      const appliedDiscount = cart.discount || null;
      const normalizedDiscount = appliedDiscount
        ? {
            ...appliedDiscount,
            discountType: getPosV2DiscountType(appliedDiscount.discountType),
          }
        : undefined;
      const selectedCustomer = cart.currentUser ?? null;
      const customerFields = buildPosOrderCustomerFields(selectedCustomer);
      const orderCustomer = buildPosOrderCustomer(selectedCustomer);
      const now = new Date().toISOString();
      const orderItems = prepareOrderItems(companyId);
      const total = subtotal - discount;
      const existingOrderId =
        existingOrder?._id || existingOrder?.id || existingOrder?.orderId || null;
      const addedBy =
        existingOrder?.orderDetails?.addedBy != null
          ? existingOrder.orderDetails.addedBy
          : Number(userData?.id || 0) || null;
      const posId =
        existingOrder?.orderDetails?.posId != null
          ? existingOrder.orderDetails.posId
          : posIdService.getPosId() || '';

      if (existingOrder && !existingOrderId) {
        throw new Error('Order ID missing. Unable to update order.');
      }

      if (existingOrderId) {
        const existingDetails = existingOrder?.orderDetails || {};
        const nextCount = toNumber(existingDetails?.count, 1) + 1;
        const baseStatusId =
          existingDetails?.orderStatusId ??
          existingOrder?.orderStatusId ??
          ORDER_STATUS_PENDING;

        const orderDetails: any = {
          ...existingDetails,
          companyId,
          ...customerFields,
          currency: existingDetails?.currency ?? userData?.currency ?? 'EUR',
          isPickup: deliveryType === 2,
          pickupDateTime:
            serviceTiming !== undefined && serviceTiming !== null
              ? serviceTiming.pickupDateTime ?? null
              : existingDetails?.pickupDateTime ?? null,
          familyName:
            serviceTiming !== undefined && serviceTiming !== null
              ? serviceTiming.familyName ?? ''
              : existingDetails?.familyName ?? '',
          orderType: getOrderType(deliveryType),
          isSandbox: existingDetails?.isSandbox ?? false,
          isPriceIncludingTax: existingDetails?.isPriceIncludingTax ?? false,
          orderDeliveryTypeId: deliveryType,
          orderPromoCodeDiscountTotal:
            existingDetails?.orderPromoCodeDiscountTotal ?? 0,
          countryCode: existingDetails?.countryCode ?? userData?.countryCode ?? 'IN',
          orderNotes: orderNote,
          orderDiscountTotal: discount,
          orderItem: orderItems,
          orderStatusId: baseStatusId,
          orderSubTotal: subtotal,
          orderTotal: total,
          createdAt: existingDetails?.createdAt ?? existingOrder?.createdAt ?? now,
          count: nextCount,
          discountId: appliedDiscount?.discountId ?? null,
          discount: normalizedDiscount ?? null,
          customer: orderCustomer ?? null,
          user: existingDetails?.user ?? userData ?? null,
          addedBy,
          posId,
          onHold: existingDetails?.onHold ?? false,
          holdingName: existingDetails?.holdingName ?? '',
          tableNo:
            deliveryType === 0
              ? tableNo
              : null,
          tableArea:
            deliveryType === 0
              ? tableArea ?? null
              : null,
          updatedAt: now,
        };
        if (existingDetails?.isSplitOrder) {
          orderDetails.isSplitOrder = true;
        }

        const settleInfo: any = {
          ...orderDetails,
          orderStatusId: baseStatusId,
          orderDetails,
          companyId,
          updatedAt: now,
          localOrderId: existingOrderId,
        };

        if (!orderDetails.isSplitOrder && !orderDetails.isTscOffline) {
          const tscArray = Array.isArray(orderDetails.tsc) ? orderDetails.tsc : [];
          let maxRevision = 0;
          let tscGuid: string | undefined;
          const orderNumber =
            existingOrder?.customOrderId ??
            existingOrder?.orderDetails?.customOrderId ??
            existingOrder?.orderDetails?.orderNumber ??
            '';

          tscArray.forEach((item: any) => {
            if (item?.success === true) {
              maxRevision = Math.max(maxRevision, toNumber(item?.data?.revision, 0));
              if (item?.data?._id) {
                tscGuid = item.data._id;
              }
            }
          });

          try {
            const tscRes = await tscService.updateTransaction({
              _id: existingOrderId,
              customOrderId: orderNumber,
              orderDetails,
              companyId,
              revision: maxRevision + 1 || 1,
              guid: tscGuid,
              state: 'ACTIVE',
            });
            const tscData =
              tscRes?.data?.data ??
              tscRes?.data ??
              [];
            const tscEntries = Array.isArray(tscData)
              ? tscData
              : [tscData].filter(Boolean);
            const lastObj = tscEntries[tscEntries.length - 1];

            if (!lastObj?.success) {
              orderDetails.isTscOffline = true;
              if (lastObj?.data === TSC_OFFLINE_MESSAGE) {
                console.warn('TSC offline:', lastObj?.data);
              }
            } else {
              orderDetails.tsc = [...tscArray, ...tscEntries];
              settleInfo.tsc = orderDetails.tsc;
            }
          } catch (error) {
            console.error('Error updating TSC transaction:', error);
            orderDetails.isTscOffline = true;
          }
        }

        const updatedOrderData = {
          orderStatusId: baseStatusId,
          orderDetails,
          companyId,
          settleInfo,
          updatedAt: now,
        };

        await orderService.updateOrder(existingOrderId, updatedOrderData);
        await cartService.clearCart();
        return {
          success: true,
          order: {
            ...updatedOrderData,
            _id: existingOrderId,
            customOrderId:
              existingOrder?.customOrderId ??
              existingOrder?.orderDetails?.customOrderId ??
              existingOrder?.orderDetails?.orderNumber ??
              undefined,
          },
        };
      }

      const orderDetails: any = {
        companyId,
        ...customerFields,
        currency: userData?.currency || 'EUR',
        isPickup: deliveryType === 2,
        pickupDateTime: serviceTiming?.pickupDateTime ?? null,
        familyName: serviceTiming?.familyName ?? '',
        orderType: getOrderType(deliveryType),
        isSandbox: false,
        isPriceIncludingTax: false,
        orderDeliveryTypeId: deliveryType, // 0=dine-in, 1=delivery, 2=pickup
        orderPromoCodeDiscountTotal: 0,
        countryCode: 'IN',
        orderNotes: orderNote,
        orderDiscountTotal: discount,
        orderItem: orderItems,
        orderStatusId: ORDER_STATUS_PENDING,
        orderSubTotal: subtotal,
        orderTotal: total,
        createdAt: now,
        count: 1,
        discountId: appliedDiscount?.discountId ?? null,
        discount: normalizedDiscount,
        customer: orderCustomer ?? null,
        user: userData || null,
        addedBy: Number(userData?.id || 0) || null,
        posId: posIdService.getPosId() || '',
        onHold: false,
        holdingName: '',
      };

      if (deliveryType === 0) {
        orderDetails.tableNo = tableNo;
        orderDetails.tableArea = tableArea || null;
      }

      const settleInfo = {
        ...orderDetails,
        orderStatusId: ORDER_STATUS_PENDING,
        orderDetails,
        companyId,
      };

      const orderData = {
        orderStatusId: ORDER_STATUS_PENDING,
        orderDetails,
        companyId,
        settleInfo,
      };

      // TSC transaction (match POS flow: startTransaction on place order)
      try {
        const tscRes = await tscService.startTransaction({
          ...orderData,
          revision: 1,
        });
        const tscData =
          tscRes?.data?.data ??
          tscRes?.data ??
          [];
        const tscArray = Array.isArray(tscData) ? tscData : [tscData].filter(Boolean);
        const lastObj = tscArray[tscArray.length - 1];

        if (!lastObj?.success) {
          orderData.orderDetails.isTscOffline = true;
          if (lastObj?.data === TSC_OFFLINE_MESSAGE) {
            console.warn('TSC offline:', lastObj?.data);
          }
        } else {
          orderData.orderDetails.tsc = tscArray;
          orderData.settleInfo.tsc = tscArray;
        }
      } catch (error) {
        console.error('Error starting TSC transaction:', error);
        orderData.orderDetails.isTscOffline = true;
      }

      // Create order using OrderService
      const result = await orderService.createOrder(orderData);

      if (result) {
        // Clear cart after successful order
        await cartService.clearCart();
        return { success: true, order: result };
      } else {
        throw new Error('Failed to create order');
      }
    } catch (error) {
      console.error('Error submitting order:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    setLoading,
    submitOrder,
    prepareOrderItems,
  };
};
