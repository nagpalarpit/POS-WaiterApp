import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeProvider';
import orderService, { PlaceOrderItemPayload } from '../services/orderService';
import cartService, { CartItem, AttributeValue } from '../services/cartService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import posIdService from '../services/posIdService';
import {
  getAttributeValueName,
  getAttributeValuePrice,
  getAttributeValueQuantity,
  getCartItemQuantity,
  getCartSubtotal,
  getDiscountAmount,
  getDiscountLabel,
  getDiscountTypeLabel,
  getItemLineTotal,
  getItemOptionsSummary,
  getItemUnitTotal,
} from '../utils/cartCalculations';

interface CheckoutScreenProps {
  navigation: any;
  route: any;
}

const ORDER_STATUS_PENDING = 1;

const getOrderType = (deliveryType: number): string => {
  if (deliveryType === 1) return 'delivery';
  if (deliveryType === 2) return 'pickup';
  if (deliveryType === 3) return 'kiosk';
  return 'table';
};

const getPosV2DiscountType = (discountType?: string): number => {
  return discountType === 'PERCENTAGE' ? 1 : 0;
};

export default function CheckoutScreen({ navigation, route }: CheckoutScreenProps) {
  const { colors } = useTheme();
  const { cart = { items: [] }, tableNo = null, deliveryType = 0 } = route.params || {};
  const orderNote = cart.orderNote || '';
  const appliedDiscount = cart.discount || null;

  // State
  const [loading, setLoading] = useState(false);
  const [tax, setTax] = useState(0);

  /**
   * Calculate subtotal including variants, attributes, and attribute values
   */
  const calculateSubtotal = (): number => {
    return getCartSubtotal(cart);
  };

  /**
   * Calculate tax (from first item's tax or 0%)
   */
  const calculateTax = (subtotal: number): number => {
    const firstItemTax = cart.items[0]?.tax;
    if (firstItemTax) {
      if (firstItemTax.percentage) {
        return (subtotal * firstItemTax.percentage) / 100;
      } else if (firstItemTax.flatAmount) {
        return firstItemTax.flatAmount;
      }
    }
    return 0;
  };

  const calculateDiscount = (): number => {
    return getDiscountAmount(calculateSubtotal(), appliedDiscount);
  };

  /**
   * Calculate total
   */
  const calculateTotal = (): number => {
    const subtotal = calculateSubtotal();
    const taxAmount = calculateTax(subtotal);
    return subtotal + taxAmount - calculateDiscount();
  };

  useEffect(() => {
    const subtotal = calculateSubtotal();
    setTax(calculateTax(subtotal));
  }, [cart]);

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
   * Place order
   */
  const placeOrder = async () => {
    try {
      if (!cart.items?.length) {
        Alert.alert('Error', 'Please add items before placing order');
        return;
      }

      if (deliveryType === 0 && !tableNo) {
        Alert.alert('Error', 'Please select table');
        return;
      }

      setLoading(true);

      const userDataStr = await AsyncStorage.getItem('userData');
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      const companyId = Number(userData?.companyId || 0);

      if (!companyId) {
        Alert.alert('Error', 'Company ID missing. Please login again.');
        return;
      }

      const subtotal = calculateSubtotal();
      const taxAmount = tax;
      const discountAmount = calculateDiscount();
      const total = calculateTotal();
      const normalizedDiscount = appliedDiscount
        ? {
            ...appliedDiscount,
            discountType: getPosV2DiscountType(appliedDiscount.discountType),
          }
        : undefined;
      const now = new Date().toISOString();
      const orderItems = prepareOrderItems(companyId);

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
        orderTaxTotal: taxAmount,
        orderCartTaxAndChargesTotal: 0,
        orderDeliveryTypeId: deliveryType, // 0=dine-in, 1=delivery, 2=pickup
        orderPromoCodeDiscountTotal: 0,
        countryCode: 'IN',
        customerAddressId: userData?.customerAddressId || null,
        orderNotes: orderNote || '',
        orderDiscountTotal: discountAmount,
        orderItem: orderItems,
        orderStatusId: ORDER_STATUS_PENDING,
        orderSubTotal: subtotal,
        orderTotal: total,
        createdAt: now,
        count: 1,
        discountId: normalizedDiscount?.id,
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

        Alert.alert('Success', 'Order placed successfully', [
          {
            text: 'OK',
            onPress: () => {
              // Navigate back to dashboard
              navigation.navigate('Dashboard');
            },
          },
        ]);
      } else {
        Alert.alert('Error', 'Failed to place order');
      }
    } catch (error) {
      console.error('Error placing order:', error);
      const message =
        (error as any)?.response?.data?.message ||
        (error as any)?.message ||
        'Failed to place order';
      Alert.alert('Error', `Failed to place order: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Render order item
   */
  const renderOrderItem = (item: CartItem) => {
    const quantity = getCartItemQuantity(item);
    const itemUnitTotal = getItemUnitTotal(item);
    const itemLineTotal = getItemLineTotal(item);
    const optionsSummary = getItemOptionsSummary(item);

    return (
      <View
        key={item.cartId}
        className="py-3 border-b flex-row justify-between"
        style={{ borderColor: colors.border }}
      >
        <View className="flex-1 pr-3">
          <Text className="font-semibold text-sm" style={{ color: colors.text }}>
            {item.customId ? `${item.customId}. ` : ''}{item.itemName}
          </Text>

          {!!optionsSummary && (
            <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>
              {optionsSummary}
            </Text>
          )}

          {item.attributeValues && item.attributeValues.length > 0 && (
            <View className="mt-1">
              {item.attributeValues.map((attributeValue: AttributeValue, idx: number) => {
                const name = getAttributeValueName(attributeValue);
                const valueQuantity = getAttributeValueQuantity(attributeValue);
                const valuePrice = getAttributeValuePrice(attributeValue);
                if (!name) return null;

                return (
                  <Text key={idx} className="text-xs" style={{ color: colors.textSecondary }}>
                    • {valueQuantity} x @{name}
                    {valuePrice > 0 ? ` (+₹${valuePrice.toFixed(2)})` : ''}
                  </Text>
                );
              })}
            </View>
          )}

          <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>
            ₹{itemUnitTotal.toFixed(2)} × {quantity}
          </Text>

          {item.orderItemNote ? (
            <Text className="text-xs mt-1 italic" style={{ color: colors.textSecondary }}>
              Note: {item.orderItemNote}
            </Text>
          ) : null}
        </View>

        <Text className="font-semibold text-sm" style={{ color: colors.text }}>
          ₹{itemLineTotal.toFixed(2)}
        </Text>
      </View>
    );
  };

  const subtotal = calculateSubtotal();
  const total = calculateTotal();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Content */}
      <ScrollView className="flex-1 px-4 py-4">
        {/* Order Info */}
        {tableNo && (
          <View
            className="bg-surface rounded-lg p-3 mb-4 border"
            style={{ borderColor: colors.border }}
          >
            <Text className="text-sm" style={{ color: colors.textSecondary }}>
              Table Number
            </Text>
            <Text className="text-2xl font-bold mt-1" style={{ color: colors.primary }}>
              {tableNo}
            </Text>
          </View>
        )}

        {/* Order Items Header */}
        <Text className="text-base font-bold mt-4 mb-2" style={{ color: colors.text }}>
          Items ({cart.items.length})
        </Text>

        {/* Order Items */}
        <View
          className="bg-surface rounded-lg p-4 mb-4 border"
          style={{ borderColor: colors.border }}
        >
          {cart.items.map((item: CartItem) => renderOrderItem(item))}
        </View>
      </ScrollView>

      {/* Footer - Summary */}
      <View
        className="px-4 py-4 border-t"
        style={{ borderColor: colors.border }}
      >
        {/* Summary */}
        <View className="mb-4">
          {orderNote ? (
            <View className="mb-2">
              <Text style={{ color: colors.textSecondary }}>Cart Note</Text>
              <Text className="text-xs mt-1" style={{ color: colors.text }}>
                {orderNote}
              </Text>
            </View>
          ) : null}
          <View className="flex-row justify-between mb-2">
            <Text style={{ color: colors.textSecondary }}>Subtotal</Text>
            <Text className="font-semibold" style={{ color: colors.text }}>
              ₹{subtotal.toFixed(2)}
            </Text>
          </View>

          {tax > 0 && (
            <View className="flex-row justify-between mb-2">
              <Text style={{ color: colors.textSecondary }}>Tax</Text>
              <Text className="font-semibold" style={{ color: colors.text }}>
                ₹{tax.toFixed(2)}
              </Text>
            </View>
          )}

          {calculateDiscount() > 0 && (
            <View className="flex-row justify-between mb-2">
              <Text style={{ color: colors.textSecondary }}>
                Discount
                {appliedDiscount ? ` (${getDiscountTypeLabel(appliedDiscount.discountType)} ${getDiscountLabel(appliedDiscount)})` : ''}
              </Text>
              <Text className="font-semibold" style={{ color: colors.error }}>
                -₹{calculateDiscount().toFixed(2)}
              </Text>
            </View>
          )}

          {/* Total */}
          <View
            className="mt-3 pt-3 border-t flex-row justify-between"
            style={{ borderColor: colors.border }}
          >
            <Text className="font-bold text-base" style={{ color: colors.text }}>
              Total
            </Text>
            <Text
              className="font-bold text-lg"
              style={{ color: colors.primary }}
            >
              ₹{total.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="flex-1 border rounded-lg py-3"
            style={{ borderColor: colors.border }}
          >
            <Text
              className="text-center font-semibold"
              style={{ color: colors.text }}
            >
              Edit Order
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={placeOrder}
            disabled={loading}
            className="flex-1 bg-primary rounded-lg py-3"
          >
            {loading ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text
                className="text-center font-bold"
                style={{ color: colors.textInverse }}
              >
                Place Order
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
