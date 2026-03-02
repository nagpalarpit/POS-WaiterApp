import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import orderService, { PlaceOrderItemPayload } from '../services/orderService';
import cartService, { Cart, CartItem, AttributeValue } from '../services/cartService';
import posIdService from '../services/posIdService';
import {
  getAttributeValueName,
  getAttributeValuePrice,
  getAttributeValueQuantity,
  getCartItemQuantity,
  getCartSubtotal,
  getDiscountAmount,
} from '../utils/cartCalculations';

const ORDER_STATUS_PENDING = 1;

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
  return discountType === 'PERCENTAGE' ? 1 : 0;
};

/**
 * Hook for managing order submission and calculations
 */
export const useOrderSubmit = (cart: Cart, tableNo: number | null, deliveryType: number) => {
  const [loading, setLoading] = useState(false);

  /**
   * Prepare order items from cart
   */
  const prepareOrderItems = (companyId: number): PlaceOrderItemPayload[] => {
    return cart.items.map((item: CartItem) => {
      const orderItem: PlaceOrderItemPayload = {
        companyId,
        discountId: null,
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
        splitPaidQuantity: 0,
      };

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
  const submitOrder = async (tax: number): Promise<boolean> => {
    try {
      if (!cart.items?.length) {
        throw new Error('No items in cart');
      }

      if (deliveryType === 0 && !tableNo) {
        throw new Error('Please select table');
      }

      setLoading(true);

      const userDataStr = await AsyncStorage.getItem('userData');
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      const companyId = Number(userData?.companyId || 0);

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
      const now = new Date().toISOString();
      const orderItems = prepareOrderItems(companyId);
      const total = subtotal + tax - discount;

      const orderDetails: any = {
        companyId,
        customerId: userData?.customerId || null,
        userEmail: userData?.email || '',
        userFirstName: userData?.firstName || userData?.username || '',
        userLastName: userData?.lastName || '',
        userMobile: userData?.mobileNo || userData?.mobile || null,
        addresses: userData?.addresses || [],
        isCallerId: false,
        customerCompanyName: userData?.customerCompanyName,
        steuerId: userData?.steuerId,
        isDebitor: !!userData?.isDebitor,
        currency: userData?.currency || 'INR',
        isPickup: deliveryType === 2,
        pickupDateTime: null,
        familyName: '',
        orderType: getOrderType(deliveryType),
        isSandbox: false,
        isPriceIncludingTax: false,
        orderTaxTotal: tax,
        orderCartTaxAndChargesTotal: 0,
        orderDeliveryTypeId: deliveryType, // 0=dine-in, 1=delivery, 2=pickup
        orderPromoCodeDiscountTotal: 0,
        countryCode: 'IN',
        customerAddressId: userData?.customerAddressId || null,
        orderNotes: orderNote,
        orderDiscountTotal: discount,
        orderItem: orderItems,
        orderStatusId: ORDER_STATUS_PENDING,
        orderSubTotal: subtotal,
        orderTotal: total,
        createdAt: now,
        count: 1,
        discountId: null,
        discount: normalizedDiscount,
        user: userData || null,
        addedBy: Number(userData?.id || 0) || null,
        posId: posIdService.getPosId() || '',
        onHold: false,
        holdingName: '',
        isSplitOrder: false,
      };

      if (deliveryType === 0) {
        orderDetails.tableNo = tableNo;
        orderDetails.tableArea = null;
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

      // Create order using OrderService
      const result = await orderService.createOrder(orderData);

      if (result) {
        // Clear cart after successful order
        await cartService.clearCart();
        return true;
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
