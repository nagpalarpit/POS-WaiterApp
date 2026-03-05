import React, { useMemo, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, TouchableOpacity, ScrollView, Alert, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeProvider';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Card from '../components/Card';
import orderService from '../services/orderService';
import commonFunctionService from '../services/commonFunctionService';
import { getOrderStatusLabel, ORDER_STATUS } from '../utils/orderUtils';
import {
  getAttributeValueName,
  getAttributeValuePrice,
  getAttributeValueQuantity,
  getCartItemQuantity,
  getItemLineTotal,
  getItemOptionsSummary,
  getItemUnitTotal,
} from '../utils/cartCalculations';
import PaymentModal from '../components/PaymentModal';

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

const normalizeAttributeValues = (values: any[] = []) => {
  return values
    .filter(Boolean)
    .map((value: any) => ({
      attributeValueId:
        value.menuItemVariantAttributeValueId ??
        value.attributeValueId ??
        value.id,
      attributeValueName:
        value.menuItemVariantAttributeValue?.name ??
        value.attributeValueName ??
        value.name ??
        '',
      attributeValuePrice: toNumber(
        value.unitPrice ??
          value.attributeValuePrice ??
          value.price ??
          value.menuItemVariantAttributeValue?.price,
        0
      ),
      attributeValueQuantity: Math.max(
        toNumber(value.quantity ?? value.attributeValueQuantity, 1),
        1
      ),
    }));
};

const extractFromVariants = (variants: any[] = []) => {
  const variantNames = new Set<string>();
  let variantPrice = 0;
  const attributeNames = new Set<string>();
  const attributeValues: any[] = [];

  variants.forEach((variant: any) => {
    const variantName =
      variant?.menuItemVariant?.name ||
      variant?.name ||
      variant?.variantName ||
      '';
    if (variantName) variantNames.add(variantName);

    variantPrice += toNumber(
      variant?.unitPrice ??
        variant?.price ??
        variant?.variantPrice ??
        variant?.menuItemVariant?.price,
      0
    );

    const variantAttributes = Array.isArray(variant?.orderItemVariantAttributes)
      ? variant.orderItemVariantAttributes
      : Array.isArray(variant?.menuItemVariantAttributes)
        ? variant.menuItemVariantAttributes
        : [];

    variantAttributes.forEach((attribute: any) => {
      const attributeName =
        attribute?.menuItemVariantAttribute?.name ||
        attribute?.attributeName ||
        attribute?.name ||
        '';
      if (attributeName) attributeNames.add(attributeName);

      const values = Array.isArray(attribute?.orderItemVariantAttributeValues)
        ? attribute.orderItemVariantAttributeValues
        : Array.isArray(attribute?.menuItemVariantAttributeValues)
          ? attribute.menuItemVariantAttributeValues
          : Array.isArray(attribute?.attributeValues)
            ? attribute.attributeValues
            : [];
      attributeValues.push(...normalizeAttributeValues(values));
    });
  });

  return {
    variantName: Array.from(variantNames).join(', '),
    variantPrice,
    attributeName: attributeNames.size === 1 ? Array.from(attributeNames)[0] : undefined,
    attributeValues,
  };
};

const normalizeOrderItem = (item: any, index: number) => {
  const variantCandidates = Array.isArray(item?.orderItemVariants)
    ? item.orderItemVariants
    : item?.orderItemVariant
      ? [item.orderItemVariant]
      : [];

  const variantDetails = extractFromVariants(variantCandidates);
  const directAttributeValues = normalizeAttributeValues(item?.attributeValues || []);
  const quantity = Math.max(toNumber(item?.quantity, 1), 1);

  return {
    ...item,
    cartId:
      item?.cartId ||
      item?._id ||
      `order-item-${item?.menuItemId || item?.itemId || item?.customId || index}-${index}`,
    quantity,
    itemName: item?.itemName || item?.name || '',
    itemPrice: toNumber(item?.itemPrice ?? item?.unitPrice ?? item?.price, 0),
    variantName:
      item?.variantName ||
      item?.orderItemVariant?.name ||
      variantDetails.variantName,
    variantPrice: toNumber(
      item?.variantPrice ??
        item?.orderItemVariant?.variantPrice ??
        item?.orderItemVariant?.price ??
        item?.orderItemVariant?.unitPrice,
      variantDetails.variantPrice
    ),
    attributeName: item?.attributeName || variantDetails.attributeName,
    attributeValues:
      directAttributeValues.length > 0
        ? directAttributeValues
        : variantDetails.attributeValues,
    orderItemNote: item?.orderItemNote || item?.note || '',
  };
};

const getOrderTypeLabel = (deliveryType: number, tableNo?: number) => {
  if (tableNo) return `Table ${tableNo}`;
  if (deliveryType === 1) return 'Delivery';
  if (deliveryType === 2) return 'Pickup';
  return 'Dine In';
};

const getStatusTone = (statusLabel: string, colors: any) => {
  const normalized = statusLabel.toLowerCase();
  if (normalized.includes('pending')) return { fg: colors.warning, bg: colors.warning + '20' };
  if (normalized.includes('confirm') || normalized.includes('transit')) {
    return { fg: colors.info || colors.primary, bg: (colors.info || colors.primary) + '20' };
  }
  if (normalized.includes('deliver') || normalized.includes('paid')) {
    return { fg: colors.success, bg: colors.success + '20' };
  }
  if (normalized.includes('cancel') || normalized.includes('reject')) {
    return { fg: colors.error, bg: colors.error + '20' };
  }
  return { fg: colors.textSecondary, bg: colors.surfaceHover || colors.background };
};

const formatTimestamp = (timestamp?: string) => {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

export default function OrderDetailsScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeSection, setActiveSection] = useState<'items' | 'notes' | 'payment'>('items');
  const order = route.params?.order;
  const [marking, setMarking] = useState(false);

  const PAYMENT_METHOD_LABELS: Record<number, string> = {
    0: 'Cash',
    1: 'Card',
    2: 'Cash + Card',
    3: 'Split Payment',
    4: 'Gift Card',
    5: 'Debitor',
    6: 'Liefernado',
    7: 'Uber',
    8: 'Wolt',
    9: 'Bolt',
    10: 'Schlemmerblock',
  };

  if (!order) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary }}>No order provided</Text>
        </View>
      </SafeAreaView>
    );
  }

  const rawItems = order.orderDetails?.orderItem || [];
  const items = useMemo(
    () => rawItems.map((item: any, index: number) => normalizeOrderItem(item, index)),
    [rawItems]
  );

  const totals = useMemo(() => {
    const od = order.orderDetails || {};
    const subtotal = Number(od.orderSubTotal ?? od.orderCartSubTotal ?? 0) || 0;
    const discount = Number(od.orderDiscountTotal ?? 0) || 0;
    const tax = Number(od.orderTaxTotal ?? od.orderCartTaxAndChargesTotal ?? 0) || 0;
    const total = Number(od.orderTotal ?? subtotal - discount + tax) || 0;
    return { subtotal, discount, tax, total };
  }, [order]);

  const paymentProcessorId = order.orderDetails?.orderPaymentSummary?.paymentProcessorId;
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(
    paymentProcessorId ?? null
  );
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [pendingSettle, setPendingSettle] = useState(false);

  const paymentLabel =
    PAYMENT_METHOD_LABELS[selectedPaymentId ?? paymentProcessorId] || 'Not set';
  const orderStatusLabel = getOrderStatusLabel(order);
  const statusTone = getStatusTone(orderStatusLabel, colors);
  const isPaid = order.orderDetails?.isPaid === 1;

  const onEdit = () => {
    navigation.navigate('Menu', {
      tableNo: order.orderDetails?.tableNo,
      deliveryType: order.orderDetails?.orderDeliveryTypeId ?? 0,
      existingOrder: order,
    });
  };

  const settleOrderWithPayment = async (option: any) => {
    try {
      setMarking(true);
      const now = new Date().toISOString();
      const userDataStr = await AsyncStorage.getItem('userData');
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      const paidBy = Number(userData?.id || userData?.userId || 0) || null;
      const companyId =
        Number(order.companyId || order.orderDetails?.companyId || userData?.companyId || 0) ||
        0;
      const invoiceNumber = await commonFunctionService.generateInvoice(companyId);
      const tip = toNumber((option as any).tip, 0);
      const giftCard = (option as any).giftCard;
      const giftCardTotal = toNumber(giftCard?.amount, 0);
      const deliveryCharge = toNumber(order.orderDetails?.deliveryCharge, 0);
      const currency = order.orderDetails?.currency || 'INR';
      const amount = totals.total + tip + deliveryCharge - giftCardTotal;
      const cashProvided = toNumber((option as any).cashProvided, 0);
      const moneyBack = option.id === 0 ? cashProvided - amount : 0;

      const orderPaymentSummary: any = {
        paymentProcessorId: option.id,
        paymentMethodLabel: PAYMENT_METHOD_LABELS[option.id] || option.label,
        amount,
        paidAt: now,
        tip,
      };

      if (giftCard) {
        orderPaymentSummary.giftCard = giftCard;
      }

      const localOrderId = order._id || order.id || order.orderId;
      const tsc = order.orderDetails?.tsc;

      const orderInfo: any = {
        ...(order.orderDetails || {}),
        orderStatusId: ORDER_STATUS.DELIVERED,
        updatedAt: now,
        paidAt: now,
        isFinalBillPrint: !!option.print,
        orderPaymentSummary,
        tip,
        deliveryCharge,
        paidBy: paidBy || undefined,
        invoiceNumber,
        localOrderId,
      };

      if (tsc) {
        orderInfo.tsc = tsc;
      }

      if (giftCard) {
        orderInfo.giftCard = giftCard;
        orderInfo.appliedGiftCard = giftCard;
        orderInfo.giftCardTotal = giftCardTotal;
        orderInfo.isfullPaidWithGiftCard =
          giftCardTotal > 0 && Math.abs(totals.total - giftCardTotal) < 0.01;
      }

      const settlePayload: any = {
        id: localOrderId,
        currency,
        paymentMethod: option.id,
        amount,
        moneyBack,
        tip,
        deliveryCharge,
        isEditPayment: false,
        orderInfo,
        orderPaymentSummary,
      };

      if (tsc) {
        settlePayload.tsc = tsc;
      }

      await orderService.settleOrder(order._id || order.id || order.orderId, settlePayload);
      setMarking(false);
      navigation.goBack();
    } catch (err) {
      setMarking(false);
      console.error('Error settling order after payment selection:', err);
      Alert.alert('Error', 'Unable to complete payment');
    }
  };

  const footerHeight = 212;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
        <Card rounded={14} style={{ padding: 12, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Order ID</Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17, marginTop: 2 }}>
                {order.customOrderId || order._id}
              </Text>
            </View>

            <View
              style={{
                backgroundColor: statusTone.bg,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 5,
              }}
            >
              <Text style={{ color: statusTone.fg, fontSize: 11, fontWeight: '700' }}>
                {isPaid ? 'Paid' : orderStatusLabel}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
            <View
              style={[
                styles.metaChip,
                { borderColor: colors.border, backgroundColor: colors.surfaceHover || colors.background },
              ]}
            >
              <MaterialCommunityIcons name="silverware-fork-knife" size={14} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginLeft: 4 }}>
                {getOrderTypeLabel(order.orderDetails?.orderDeliveryTypeId ?? 0, order.orderDetails?.tableNo)}
              </Text>
            </View>
            <View
              style={[
                styles.metaChip,
                { borderColor: colors.border, backgroundColor: colors.surfaceHover || colors.background },
              ]}
            >
              <MaterialCommunityIcons name="clock-outline" size={14} color={colors.textSecondary} />
              <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 11, marginLeft: 4 }}>
                {formatTimestamp(order.createdAt || order.orderDetails?.createdAt)}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center' }}>
            <MaterialCommunityIcons name="credit-card-outline" size={15} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 6 }}>
              Payment: <Text style={{ color: colors.text, fontWeight: '700' }}>{paymentLabel}</Text>
            </Text>
          </View>

          <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
            {(['items', 'notes', 'payment'] as const).map((section) => {
              const selected = activeSection === section;
              return (
                <TouchableOpacity
                  key={section}
                  onPress={() => setActiveSection(section)}
                  style={[
                    styles.sectionTab,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.primary + '15' : colors.surface,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selected ? colors.primary : colors.textSecondary,
                      fontWeight: '700',
                      fontSize: 12,
                    }}
                  >
                    {section === 'items' ? 'Items' : section === 'notes' ? 'Notes' : 'Payment'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 12, marginTop: 12 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + footerHeight }}
        showsVerticalScrollIndicator={false}
      >
        {items.length === 0 ? (
          <Card style={{ padding: 14 }}>
            <Text style={{ color: colors.textSecondary }}>No items in this order</Text>
          </Card>
        ) : activeSection === 'items' ? (
          items.map((it: any) => {
            const quantity = getCartItemQuantity(it);
            const itemUnitTotal = getItemUnitTotal(it);
            const itemLineTotal = getItemLineTotal(it);
            const optionsSummary = getItemOptionsSummary(it);

            return (
              <Card
                key={it.cartId}
                style={{
                  marginBottom: 10,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                }}
              >
                <View style={styles.itemRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={[styles.itemName, { color: colors.text }]}>
                      {it.customId ? `${it.customId}. ` : ''}
                      {it.itemName}
                    </Text>

                    {!!optionsSummary && (
                      <Text style={[styles.optionText, { color: colors.textSecondary }]}>
                        {optionsSummary}
                      </Text>
                    )}

                    {Array.isArray(it.attributeValues) && it.attributeValues.length > 0 && (
                      <View style={{ marginTop: 6 }}>
                        {it.attributeValues.map((attributeValue: any, valueIndex: number) => {
                          const name = getAttributeValueName(attributeValue);
                          const valueQuantity = getAttributeValueQuantity(attributeValue);
                          const valuePrice = getAttributeValuePrice(attributeValue);
                          if (!name) return null;

                          return (
                            <Text
                              key={`${it.cartId}-value-${valueIndex}`}
                              style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}
                            >
                              • {valueQuantity} x {name}
                              {valuePrice > 0 ? ` (+₹${valuePrice.toFixed(2)})` : ''}
                            </Text>
                          );
                        })}
                      </View>
                    )}

                    {it.orderItemNote ? (
                      <Text style={{ color: colors.textSecondary, marginTop: 7, fontStyle: 'italic', fontSize: 12 }}>
                        Note: {it.orderItemNote}
                      </Text>
                    ) : null}
                  </View>

                  <View style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <View
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        backgroundColor: colors.primary + '18',
                      }}
                    >
                      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 11 }}>x{quantity}</Text>
                    </View>

                    <View style={{ alignItems: 'flex-end', marginTop: 20 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                        ₹{itemUnitTotal.toFixed(2)} each
                      </Text>
                      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginTop: 2 }}>
                        ₹{itemLineTotal.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </View>
              </Card>
            );
          })
        ) : activeSection === 'notes' ? (
          <Card style={{ padding: 12, borderColor: colors.border }}>
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Order Note</Text>
            <Text style={{ color: colors.textSecondary }}>
              {order.orderDetails?.orderNotes || 'No order note added.'}
            </Text>

            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
              <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Item Notes</Text>
              {items.some((it: any) => !!it.orderItemNote) ? (
                items
                  .filter((it: any) => !!it.orderItemNote)
                  .map((it: any) => (
                    <View key={`${it.cartId}-note`} style={{ marginBottom: 8 }}>
                      <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{it.itemName}</Text>
                      <Text style={{ color: colors.textSecondary, marginTop: 2, fontSize: 12 }}>{it.orderItemNote}</Text>
                    </View>
                  ))
              ) : (
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>No item-level notes.</Text>
              )}
            </View>
          </Card>
        ) : (
          <Card style={{ padding: 12, borderColor: colors.border }}>
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Payment Summary</Text>
            <View style={styles.paymentRow}>
              <Text style={{ color: colors.textSecondary }}>Current Method</Text>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{paymentLabel}</Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={{ color: colors.textSecondary }}>Total Amount</Text>
              <Text style={{ color: colors.text, fontWeight: '700' }}>₹{totals.total.toFixed(2)}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setPaymentModalVisible(true)}
              style={[
                styles.changePaymentBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceHover || colors.background,
                },
              ]}
            >
              <MaterialCommunityIcons name="credit-card-edit-outline" size={16} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: '700', marginLeft: 6, fontSize: 12 }}>
                Change Payment Method
              </Text>
            </TouchableOpacity>
          </Card>
        )}
      </ScrollView>

      <PaymentModal
        visible={paymentModalVisible}
        onClose={() => {
          setPaymentModalVisible(false);
          setPendingSettle(false);
        }}
        onSelect={async (option: any) => {
          setSelectedPaymentId(option.id);
          setPaymentModalVisible(false);

          if (!pendingSettle) return;
          setPendingSettle(false);
          await settleOrderWithPayment(option);
        }}
        orderTotal={totals.total}
      />

      <View
        style={[
          styles.footer,
          {
            borderTopColor: colors.border,
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + 10,
          },
        ]}
      >
        <View
          style={[
            styles.footerSummaryCard,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
        >
          <View style={styles.summaryRow}>
            <Text style={{ color: colors.textSecondary }}>Subtotal</Text>
            <Text style={{ color: colors.text, fontWeight: '700' }}>₹{totals.subtotal.toFixed(2)}</Text>
          </View>
          {totals.tax > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={{ color: colors.textSecondary }}>Tax</Text>
              <Text style={{ color: colors.text, fontWeight: '700' }}>₹{totals.tax.toFixed(2)}</Text>
            </View>
          ) : null}
          {totals.discount > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={{ color: colors.textSecondary }}>Discount</Text>
              <Text style={{ color: colors.error, fontWeight: '700' }}>-₹{totals.discount.toFixed(2)}</Text>
            </View>
          ) : null}
          <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }]}>
            <Text style={{ color: colors.text, fontWeight: '800' }}>Total</Text>
            <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 17 }}>₹{totals.total.toFixed(2)}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TouchableOpacity
            onPress={onEdit}
            style={[
              styles.footerBtn,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.text} />
            <Text style={{ color: colors.text, marginLeft: 6, fontWeight: '700', fontSize: 12 }}>
              Edit Order
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              if (isPaid) return;
              setPendingSettle(true);
              setPaymentModalVisible(true);
            }}
            disabled={marking || isPaid}
            style={[
              styles.footerBtnPrimary,
              {
                backgroundColor: marking || isPaid ? colors.border : colors.primary,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={isPaid ? 'check-circle-outline' : 'cash-check'}
              size={17}
              color={colors.textInverse || '#fff'}
            />
            <Text style={{ color: colors.textInverse || '#fff', marginLeft: 6, fontWeight: '800', fontSize: 12 }}>
              {marking ? 'Processing...' : isPaid ? 'Already Paid' : 'Mark as Paid'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  metaChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
  },
  sectionTab: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemName: {
    fontWeight: '700',
    fontSize: 15,
  },
  optionText: {
    marginTop: 4,
    fontSize: 12,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  changePaymentBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  footerSummaryCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  footerBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnPrimary: {
    flex: 1.3,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
