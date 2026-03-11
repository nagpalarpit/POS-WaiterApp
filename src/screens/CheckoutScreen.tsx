import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useOrderSubmit } from '../hooks/useOrderSubmit';
import { useCartNotes } from '../hooks/useCartNotes';
import cartService, { Cart, CartItem, AttributeValue } from '../services/cartService';
import CartNoteModal from '../components/CartNoteModal';
import { formatCurrency } from '../utils/currency';
import { emitOrderSync, emitPosKotPrint, unlockOrder, unlockTable } from '../services/orderSyncService';
import { useToast } from '../components/ToastProvider';
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

const getServiceTypeLabel = (deliveryType: number, tableNo: number | null) => {
  if (tableNo) return `Table ${tableNo}`;
  if (deliveryType === 1) return 'Delivery';
  if (deliveryType === 2) return 'Pickup';
  if (deliveryType === 3) return 'Kiosk';
  return 'Walk-in';
};

export default function CheckoutScreen({ navigation, route }: CheckoutScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const incomingCart = (route.params?.cart || { items: [], orderNote: '', discount: null }) as Cart;
  const tableNo = route.params?.tableNo ?? null;
  const deliveryType = route.params?.deliveryType ?? 0;
  const tableArea = route.params?.tableArea ?? null;
  const existingOrder = route.params?.existingOrder ?? null;

  const [checkoutCart, setCheckoutCart] = useState<Cart>(incomingCart);
  const { showToast } = useToast();

  const orderSubmit = useOrderSubmit(
    checkoutCart,
    tableNo,
    deliveryType,
    tableArea,
    existingOrder
  );
  const cartNotes = useCartNotes(
    checkoutCart,
    cartService.updateItemNote,
    cartService.updateDiscount
  );

  const placeAnim = useRef(new Animated.Value(1)).current;
  const toastNavTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCheckoutCart((route.params?.cart || { items: [], orderNote: '', discount: null }) as Cart);
  }, [route.params?.cart]);

  useEffect(() => {
    return () => {
      if (toastNavTimer.current) clearTimeout(toastNavTimer.current);
    };
  }, []);

  const subtotal = getCartSubtotal(checkoutCart);
  const discountAmount = getDiscountAmount(subtotal, checkoutCart.discount || null);
  const total = subtotal - discountAmount;
  const totalItems = checkoutCart.items.reduce(
    (sum, item) => sum + getCartItemQuantity(item),
    0
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: getServiceTypeLabel(deliveryType, tableNo),
      headerStyle: { backgroundColor: colors.background },
      headerTintColor: colors.text,
      headerTitleStyle: { fontWeight: '700' },
      headerRight: () => null,
    });
  }, [navigation, colors.background, colors.text]);

  const handleSaveCartNote = async (note: string, discount: any) => {
    try {
      await cartService.updateOrderNote(note || '');
      if (discount) {
        await cartService.updateDiscount(discount);
      } else {
        await cartService.updateDiscount(null);
      }

      const refreshedCart = await cartService.loadCart();
      setCheckoutCart(refreshedCart);
      cartNotes.setShowCartNoteModal(false);
    } catch (err) {
      showToast('Failed to save cart note', { type: 'error' });
    }
  };

  const handlePlaceOrder = async () => {
    try {
      if (!checkoutCart.items?.length) {
        showToast('Please add items before placing order', { type: 'error' });
        return;
      }

      if (deliveryType === 0 && !tableNo) {
        showToast('Please select table', { type: 'error' });
        return;
      }

      Animated.sequence([
        Animated.timing(placeAnim, { toValue: 0.96, duration: 90, useNativeDriver: true }),
        Animated.timing(placeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();

      const submitResult = await orderSubmit.submitOrder(0);
      const submittedOrder = submitResult?.order;
      const orderInfo = {
        tableNo,
        orderNumber:
          existingOrder?.customOrderId ||
          existingOrder?.orderDetails?.customOrderId ||
          existingOrder?.orderDetails?.orderNumber ||
          existingOrder?._id ||
          existingOrder?.id,
        orderDeliveryTypeId: deliveryType,
      };
      await emitOrderSync(
        existingOrder ? 'ORDER_UPDATED' : 'ORDER_PLACED',
        orderInfo,
      );
      if (submittedOrder) {
        const orderDetails = submittedOrder.orderDetails || submittedOrder;
        const items =
          orderDetails?.orderItem ||
          orderDetails?.orderItems ||
          [];
        if (Array.isArray(items) && items.length > 0) {
          emitPosKotPrint({
            items,
            isOrderDetails: true,
            currentUser: orderDetails?.user ?? submittedOrder?.user ?? null,
            orderInfo: {
              ...orderDetails,
              orderNumber:
                orderDetails?.customOrderId ||
                submittedOrder?.customOrderId ||
                submittedOrder?._id ||
                submittedOrder?.id,
            },
          });
        }
      }
      if (existingOrder) {
        await unlockOrder(existingOrder);
      } else if (tableNo) {
        await unlockTable(tableNo);
      }
      showToast(existingOrder ? 'Order updated successfully' : 'Order placed successfully', { type: 'success' });
      if (toastNavTimer.current) clearTimeout(toastNavTimer.current);
      toastNavTimer.current = setTimeout(() => {
        navigation.navigate('Dashboard');
      }, 800);
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message ||
        (error as any)?.message ||
        'Failed to place order';
      showToast(message, { type: 'error' });
      console.error('Error placing order:', error);
    }
  };

  const renderOrderItem = (item: CartItem, index: number) => {
    const quantity = getCartItemQuantity(item);
    const itemUnitTotal = getItemUnitTotal(item);
    const itemLineTotal = getItemLineTotal(item);
    const optionsSummary = getItemOptionsSummary(item);

    return (
      <View
        key={item.cartId || `${item.itemId}-${index}`}
        style={[
          styles.itemCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.itemHeaderRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.itemName, { color: colors.text }]}>
              {item.customId ? `${item.customId}. ` : ''}
              {item.itemName}
            </Text>
            {!!optionsSummary && (
              <Text style={[styles.optionText, { color: colors.textSecondary }]}>
                {optionsSummary}
              </Text>
            )}
          </View>

          <View
            style={[
              styles.qtyChip,
              {
                backgroundColor: colors.primary + '14',
                borderColor: colors.primary + '2a',
              },
            ]}
          >
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 11 }}>
              x{quantity}
            </Text>
          </View>
        </View>

        {item.attributeValues && item.attributeValues.length > 0 && (
          <View style={{ marginTop: 8 }}>
            {item.attributeValues.map((attributeValue: AttributeValue, valueIndex: number) => {
              const name = getAttributeValueName(attributeValue);
              const valueQuantity = getAttributeValueQuantity(attributeValue);
              const valuePrice = getAttributeValuePrice(attributeValue);
              if (!name) return null;

              return (
                <Text
                  key={`${item.cartId}-value-${valueIndex}`}
                  style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}
                >
                  • {valueQuantity} x {name}
                  {valuePrice > 0 ? ` (+${formatCurrency(valuePrice)})` : ''}
                </Text>
              );
            })}
          </View>
        )}

        {item.orderItemNote ? (
          <View
            style={[
              styles.noteWrap,
              {
                borderColor: colors.border,
                backgroundColor: colors.surfaceHover || colors.background,
              },
            ]}
          >
            <MaterialCommunityIcons name="note-text-outline" size={14} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, marginLeft: 6, flex: 1, fontSize: 12 }}>
              {item.orderItemNote}
            </Text>
          </View>
        ) : null}

        <View style={[styles.itemTotalRow, { borderTopColor: colors.border }]}>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {formatCurrency(itemUnitTotal)} × {quantity}
          </Text>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>
            {formatCurrency(itemLineTotal)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: insets.bottom + 214,
        }}
        showsVerticalScrollIndicator={false}
      >
        {checkoutCart.items.length > 0 ? (
          checkoutCart.items.map((item: CartItem, index: number) => renderOrderItem(item, index))
        ) : (
          <View
            style={[
              styles.emptyState,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <MaterialCommunityIcons name="cart-outline" size={34} color={colors.textSecondary} />
            <Text style={{ color: colors.text, fontWeight: '700', marginTop: 10 }}>Cart is empty</Text>
            <Text style={{ color: colors.textSecondary, marginTop: 4, textAlign: 'center', fontSize: 12 }}>
              Go back to menu and add items before checkout.
            </Text>
          </View>
        )}
      </ScrollView>

      <Animated.View
        style={[
          styles.footer,
          {
            transform: [{ scale: placeAnim }],
            borderTopColor: colors.border,
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        <View
          style={[
            styles.summaryCard,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
        >
          <View style={styles.summaryRow}>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Subtotal</Text>
            <Text style={{ color: colors.text, fontWeight: '700' }}>
              {formatCurrency(subtotal)}
            </Text>
          </View>

          {discountAmount > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Discount</Text>
              <Text style={{ color: colors.error, fontWeight: '700' }}>
                {formatCurrency(-discountAmount)}
              </Text>
            </View>
          ) : null}

          <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }]}>
            <Text style={{ color: colors.text, fontWeight: '800' }}>Total Payable</Text>
            <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 18 }}>
              {formatCurrency(total)}
            </Text>
          </View>
        </View>

        <View style={styles.footerActions}>
          <TouchableOpacity
            onPress={() => cartNotes.setShowCartNoteModal(true)}
            style={[
              styles.secondaryActionBtn,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <MaterialCommunityIcons name="ticket-percent-outline" size={17} color={colors.text} />
            <Text style={{ color: colors.text, marginLeft: 6, fontWeight: '700', fontSize: 12 }}>
              Note / Discount
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handlePlaceOrder}
            disabled={orderSubmit.loading || checkoutCart.items.length === 0}
            style={[
              styles.primaryActionBtn,
              {
                backgroundColor:
                  orderSubmit.loading || checkoutCart.items.length === 0
                    ? colors.border
                    : colors.primary,
              },
            ]}
          >
            {orderSubmit.loading ? (
              <ActivityIndicator color={colors.textInverse || '#fff'} />
            ) : (
              <>
                <MaterialCommunityIcons name="check-circle-outline" size={18} color={colors.textInverse || '#fff'} />
                <Text style={{ color: colors.textInverse || '#fff', marginLeft: 6, fontWeight: '800', fontSize: 13 }}>
                  Place Order
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>

      <CartNoteModal
        visible={cartNotes.showCartNoteModal}
        initialNote={checkoutCart.orderNote || ''}
        initialDiscount={checkoutCart.discount || null}
        onClose={() => cartNotes.setShowCartNoteModal(false)}
        onSave={handleSaveCartNote}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  contextCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  contextIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  contextActionBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  discountBanner: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  itemCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
  },
  optionText: {
    fontSize: 12,
    marginTop: 5,
  },
  qtyChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 34,
    alignItems: 'center',
  },
  noteWrap: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemTotalRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  footerActions: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  secondaryActionBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionBtn: {
    flex: 1.2,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
