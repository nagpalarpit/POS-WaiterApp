import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeProvider';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Card from '../components/Card';
import orderService from '../services/orderService';
import localDatabase from '../services/localDatabase';
import tscService from '../services/tscService';
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
import { formatCurrency } from '../utils/currency';
import { emitOrderSync, emitPosPrint, lockOrder, lockPayment, unlockOrder } from '../services/orderSyncService';
import { useToast } from '../components/ToastProvider';

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

const round2 = (value: number): number => Number(value.toFixed(2));

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
  const editingRef = useRef(false);
  const { showToast } = useToast();

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

  const [workingOrderDetails, setWorkingOrderDetails] = useState<any>(
    order?.orderDetails || {}
  );
  const displayedOrderDetails = workingOrderDetails || order?.orderDetails || {};

  const rawItems = displayedOrderDetails?.orderItem || [];
  const items = useMemo(
    () => rawItems.map((item: any, index: number) => normalizeOrderItem(item, index)),
    [rawItems]
  );

  const splitPaymentItems = useMemo(
    () =>
      items.map((item: any, index: number) => ({
        key: `${item.cartId || item.menuItemId || index}-${index}`,
        name: `${item.customId ? `${item.customId}. ` : ''}${item.itemName || 'Item'}`,
        quantity: Math.max(getCartItemQuantity(item), 0),
        unitTotal: round2(getItemUnitTotal(item)),
      })),
    [items]
  );

  const remainingSplitItemUnits = useMemo(
    () =>
      splitPaymentItems.reduce(
        (sum: number, item: any) => sum + Math.max(toNumber(item?.quantity, 0), 0),
        0
      ),
    [splitPaymentItems]
  );

  const allowSplitOption = useMemo(() => {
    if (displayedOrderDetails?.isSplitOrder) return false;
    if (Array.isArray(displayedOrderDetails?.giftCardLogs) && displayedOrderDetails.giftCardLogs.length > 0) {
      return false;
    }
    return splitPaymentItems.length > 1 || remainingSplitItemUnits > 1;
  }, [displayedOrderDetails?.isSplitOrder, displayedOrderDetails?.giftCardLogs, splitPaymentItems.length, remainingSplitItemUnits]);

  const totals = useMemo(() => {
    const od = displayedOrderDetails || {};
    const subtotal = Number(od.orderSubTotal ?? od.orderCartSubTotal ?? 0) || 0;
    const discount = Number(od.orderDiscountTotal ?? 0) || 0;
    const tax = Number(od.orderTaxTotal ?? od.orderCartTaxAndChargesTotal ?? 0) || 0;
    const total = Number(od.orderTotal ?? subtotal - discount + tax) || 0;
    return { subtotal, discount, tax, total };
  }, [displayedOrderDetails]);

  const paymentProcessorId =
    displayedOrderDetails?.orderPaymentSummary?.paymentProcessorId;
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(
    paymentProcessorId ?? null
  );
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [pendingSettle, setPendingSettle] = useState(false);

  const paymentLabel =
    PAYMENT_METHOD_LABELS[selectedPaymentId ?? paymentProcessorId] || 'Not set';
  const orderStatusLabel = getOrderStatusLabel(order);
  const statusTone = getStatusTone(orderStatusLabel, colors);
  const isPaid = displayedOrderDetails?.isPaid === 1;

  useFocusEffect(
    useCallback(() => {
      editingRef.current = false;
      return () => {};
    }, []),
  );

  useEffect(() => {
    if (!order) return;
    lockOrder(order);
    return () => {
      if (!editingRef.current) {
        unlockOrder(order);
      }
    };
  }, [order]);

  useEffect(() => {
    setWorkingOrderDetails(order?.orderDetails || {});
  }, [order?._id, order?.id]);

  const onEdit = () => {
    editingRef.current = true;
    lockOrder(order);
    navigation.navigate('Menu', {
      tableNo: displayedOrderDetails?.tableNo,
      deliveryType: displayedOrderDetails?.orderDeliveryTypeId ?? 0,
      existingOrder: order,
      tableArea: displayedOrderDetails?.tableArea ?? null,
    });
  };

  const settleOrderWithPayment = async (option: any) => {
    try {
      setMarking(true);
      const now = new Date().toISOString();
      const selectedPaymentMethod = toNumber(option?.paymentMethod ?? option?.id, 0);
      const userDataStr = await AsyncStorage.getItem('userData');
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      const paidBy = Number(userData?.id || userData?.userId || 0) || null;
      const orderDetails = displayedOrderDetails || {};
      const companyId =
        Number(order.companyId || orderDetails?.companyId || userData?.companyId || 0) ||
        0;
      const invoiceNumber = await commonFunctionService.generateInvoice(companyId);
      const tip = toNumber((option as any).tip, 0);
      const giftCard = (option as any).giftCard;
      const giftCardTotal = toNumber(giftCard?.amount, 0);
      const deliveryCharge = toNumber(orderDetails?.deliveryCharge, 0);
      const currency = orderDetails?.currency || 'EUR';
      const defaultAmount = totals.total + tip + deliveryCharge - giftCardTotal;
      const incomingPaymentDetails = Array.isArray(option?.orderPaymentDetails)
        ? option.orderPaymentDetails
            .map((detail: any) => ({
              paymentProcessorId: toNumber(detail?.paymentProcessorId, selectedPaymentMethod),
              paymentTotal: toNumber(detail?.paymentTotal, 0),
            }))
            .filter((detail: any) => detail.paymentTotal > 0)
        : [];
      let orderPaymentDetails =
        incomingPaymentDetails.length > 0
          ? incomingPaymentDetails
          : [
              {
                paymentProcessorId: selectedPaymentMethod,
                paymentTotal: toNumber(defaultAmount, 0),
              },
            ];
      const splitAmount = orderPaymentDetails.reduce(
        (sum: number, detail: any) => sum + toNumber(detail?.paymentTotal, 0),
        0
      );
      let amount = splitAmount > 0 ? splitAmount : defaultAmount;
      let orderPaymentSummary = option?.orderPaymentSummary ?? {
        paymentProcessorId: selectedPaymentMethod,
      };
      const localOrderId = order._id || order.id || order.orderId;
      const tsc = orderDetails?.tsc;
      const orderDeliveryTypeId = Number(
        orderDetails?.orderDeliveryTypeId ?? order?.orderDeliveryTypeId ?? 0
      );
      const orderType =
        orderDetails?.orderType ||
        (orderDeliveryTypeId === 1
          ? 'delivery'
          : orderDeliveryTypeId === 2
            ? 'pickup'
            : orderDeliveryTypeId === 3
              ? 'kiosk'
              : 'table');

      const rawOrderItems = Array.isArray(orderDetails?.orderItem)
        ? orderDetails.orderItem
        : Array.isArray(orderDetails?.orderItems)
          ? orderDetails.orderItems
          : [];

      let normalizedOrderItems = rawOrderItems.map((item: any) => ({
        companyId: item.companyId ?? companyId,
        categoryId: item.categoryId ?? item.menuCategoryId ?? item.category?.id ?? 0,
        cartId: item.cartId,
        categoryName: item.categoryName ?? item.menuCategoryName ?? item.category?.name ?? '',
        menuItemId: item.menuItemId ?? item.itemId ?? item.id ?? 0,
        itemName: item.itemName ?? item.name ?? '',
        quantity: Math.max(toNumber(item.quantity, 1), 1),
        unitPrice: `${item.unitPrice ?? item.itemPrice ?? item.price ?? 0}`,
        orderItemNote: item.orderItemNote ?? item.note ?? '',
        groupType: item.groupType ?? 0,
        groupLabel: item.groupLabel ?? '',
        customId: item.customId ?? item.customID ?? item.customId ?? null,
        tax: item.tax ?? item.taxInfo ?? item.taxObj ?? null,
        splitPaidQuantity: toNumber(item.splitPaidQuantity, 0),
        atgPinsSale: item.atgPinsSale ?? false,
        atgVatPercent: toNumber(item.atgVatPercent, 0),
        atgOrderPayload: item.atgOrderPayload ?? null,
        ...(item.orderItemVariant ? { orderItemVariant: item.orderItemVariant } : {}),
        ...(item.orderItemVariants ? { orderItemVariants: item.orderItemVariants } : {}),
      }));

      let payableSubTotal = round2(toNumber(orderDetails?.orderSubTotal, totals.subtotal));
      let payableDiscount = round2(toNumber(orderDetails?.orderDiscountTotal, totals.discount));
      let payableTax = round2(
        toNumber(
          orderDetails?.orderTaxTotal ?? orderDetails?.orderCartTaxAndChargesTotal,
          totals.tax
        )
      );
      let payableTotal = round2(toNumber(orderDetails?.orderTotal, totals.total));
      let payableCount = toNumber(orderDetails?.count, normalizedOrderItems.length || 1);
      let payableDeliveryCharge = deliveryCharge;

      let splitSelections = Array.isArray(option?.splitSelections)
        ? option.splitSelections.map((qty: any) => Math.max(0, Math.floor(toNumber(qty, 0))))
        : [];
      let isItemSplit =
        option?.isItemSplit === true &&
        splitSelections.some((qty: number) => qty > 0);

      const shouldFinalizeExistingSplit =
        !isItemSplit &&
        !!orderDetails?.isSplitOrder;

      if (shouldFinalizeExistingSplit) {
        splitSelections = normalizedOrderItems.map((item: any) =>
          Math.max(0, Math.floor(toNumber(item?.quantity, 0)))
        );
        isItemSplit = splitSelections.some((qty: number) => qty > 0);
      }

      if (isItemSplit) {
        const selectedOrderItems: any[] = [];
        const remainingOrderItems: any[] = [];
        let selectedSubTotal = 0;
        let remainingSubTotal = 0;

        normalizedOrderItems.forEach((item: any, index: number) => {
          const availableQty = Math.max(Math.floor(toNumber(item.quantity, 0)), 0);
          const selectedQty = Math.min(availableQty, splitSelections[index] || 0);
          const remainingQty = Math.max(0, availableQty - selectedQty);
          const unitTotal = toNumber(splitPaymentItems[index]?.unitTotal, toNumber(item.unitPrice, 0));

          if (selectedQty > 0) {
            selectedSubTotal += unitTotal * selectedQty;
            selectedOrderItems.push({
              ...item,
              quantity: selectedQty,
            });
          }

          if (remainingQty > 0) {
            remainingSubTotal += unitTotal * remainingQty;
            remainingOrderItems.push({
              ...item,
              quantity: remainingQty,
              splitPaidQuantity: toNumber(item.splitPaidQuantity, 0) + selectedQty,
            });
          }
        });

        if (selectedOrderItems.length === 0) {
          throw new Error('No items selected for split payment');
        }

        selectedSubTotal = round2(selectedSubTotal);
        remainingSubTotal = round2(remainingSubTotal);

        const baseSubTotal = round2(selectedSubTotal + remainingSubTotal);
        const sourceSubTotal = round2(toNumber(orderDetails?.orderSubTotal, totals.subtotal));
        const effectiveSubTotal = sourceSubTotal > 0 ? sourceSubTotal : baseSubTotal;
        const sourceDiscount = round2(
          toNumber(orderDetails?.orderDiscountTotal, totals.discount)
        );
        const sourceTax = round2(
          toNumber(
            orderDetails?.orderTaxTotal ?? orderDetails?.orderCartTaxAndChargesTotal,
            totals.tax
          )
        );
        const splitRatio =
          effectiveSubTotal > 0 ? Math.min(1, selectedSubTotal / effectiveSubTotal) : 1;

        const selectedDiscount = round2(sourceDiscount * splitRatio);
        const selectedTax = round2(sourceTax * splitRatio);
        const remainingDiscount = round2(sourceDiscount - selectedDiscount);
        const remainingTax = round2(sourceTax - selectedTax);
        const selectedTotal = round2(
          Math.max(0, selectedSubTotal - selectedDiscount + selectedTax)
        );
        const remainingTotal = round2(
          Math.max(0, remainingSubTotal - remainingDiscount + remainingTax)
        );
        const splitDeliveryCharge = remainingOrderItems.length > 0 ? 0 : deliveryCharge;
        const splitDefaultAmount = round2(
          Math.max(0, selectedTotal + tip + splitDeliveryCharge - giftCardTotal)
        );
        const splitPaymentDetails =
          incomingPaymentDetails.length > 0
            ? incomingPaymentDetails
            : [
                {
                  paymentProcessorId: selectedPaymentMethod,
                  paymentTotal: splitDefaultAmount,
                },
              ];
        const splitPaymentSummary = option?.orderPaymentSummary ?? {
          paymentProcessorId: selectedPaymentMethod,
        };
        const splitAmount = round2(
          splitPaymentDetails.reduce(
            (sum: number, detail: any) => sum + toNumber(detail?.paymentTotal, 0),
            0
          ) || splitDefaultAmount
        );
        const splitOrderInfo: any = {
          companyId,
          currency,
          isPickup: orderDetails?.isPickup ?? orderDeliveryTypeId === 2,
          pickupDateTime: orderDetails?.pickupDateTime ?? null,
          familyName: orderDetails?.familyName ?? '',
          orderType,
          isSandbox: orderDetails?.isSandbox ?? false,
          isPriceIncludingTax: orderDetails?.isPriceIncludingTax ?? false,
          orderTaxTotal: selectedTax,
          orderCartTaxAndChargesTotal: selectedTax,
          orderDeliveryTypeId,
          orderPromoCodeDiscountTotal: toNumber(
            orderDetails?.orderPromoCodeDiscountTotal,
            0
          ),
          countryCode: orderDetails?.countryCode || userData?.countryCode || 'IN',
          orderNotes: orderDetails?.orderNotes || '',
          orderDiscountTotal: selectedDiscount,
          orderItem: selectedOrderItems,
          orderStatusId: ORDER_STATUS.DELIVERED,
          orderSubTotal: selectedSubTotal,
          orderTotal: selectedTotal,
          createdAt: orderDetails?.createdAt || order?.createdAt || now,
          count: selectedOrderItems.length,
          user: orderDetails?.user || order?.user || userData || null,
          addedBy: orderDetails?.addedBy ?? paidBy ?? null,
          posId: orderDetails?.posId || order?.posId || '',
          onHold: false,
          holdingName: '',
          atgPinsPayloads: orderDetails?.atgPinsPayloads ?? [],
          tableNo: orderDetails?.tableNo ?? null,
          tableArea: orderDetails?.tableArea ?? null,
          tsc: tsc ?? undefined,
          customOrderId: orderDetails?.customOrderId || order?.customOrderId || '',
          parentLocalOrderId: localOrderId,
          reason: orderDetails?.reason ?? '',
          isDeleted: false,
          updatedAt: now,
          paidAt: now,
          isCorporate: orderDetails?.isCorporate ?? false,
          isFinalBillPrint: !!option.print,
          canceledOrderPayment: 0,
          invoiceNumber,
          paidBy: paidBy || undefined,
          company: orderDetails?.company || order?.company || undefined,
          printObj: orderDetails?.printObj ?? order?.printObj ?? undefined,
          paymentMethod: selectedPaymentMethod,
          orderPaymentSummary: splitPaymentSummary,
          orderPaymentDetails: splitPaymentDetails,
          tip,
          deliveryCharge: splitDeliveryCharge,
          isSplitOrder: true,
        };

        if (giftCard) {
          splitOrderInfo.giftCard = giftCard;
          splitOrderInfo.appliedGiftCard = giftCard;
          splitOrderInfo.giftCardTotal = giftCardTotal;
          splitOrderInfo.isfullPaidWithGiftCard =
            giftCardTotal > 0 && Math.abs(selectedTotal - giftCardTotal) < 0.01;
        }

        const splitSettlePayload: any = {
          currency,
          paymentMethod: selectedPaymentMethod,
          amount: splitAmount,
          tip,
          deliveryCharge: splitDeliveryCharge,
          isEditPayment: false,
          orderInfo: splitOrderInfo,
        };

        try {
          const tscStartPayload: any = {
            orderStatusId: ORDER_STATUS.DELIVERED,
            orderDetails: { ...splitOrderInfo },
            companyId,
            parentLocalOrderId: localOrderId,
            revision: 1,
          };
          const tscStartRes: any = await tscService.startTransaction(tscStartPayload);
          const rawTscData = tscStartRes?.data?.data ?? tscStartRes?.data ?? [];
          const tscData = Array.isArray(rawTscData)
            ? rawTscData
            : [rawTscData].filter(Boolean);
          const lastObj = tscData[tscData.length - 1];

          if (!lastObj?.success) {
            splitOrderInfo.isTscOffline = true;
          } else {
            const filteredTscData = tscData
              .filter((item: any) => item?.data?.state === 'FINISHED')
              .reduce(
                (acc: any, item: any) => {
                  const isReceipt =
                    item?.data?.schema?.standard_v1?.receipt?.receipt_type ===
                    'RECEIPT';
                  if (isReceipt) {
                    acc.receipt = { ...item.data, success: item.success };
                  } else {
                    acc.order = { ...item.data, success: item.success };
                  }
                  return acc;
                },
                { order: null, receipt: null }
              );
            splitOrderInfo.tsc = filteredTscData;
          }
        } catch (tscErr) {
          console.warn('startNewTransaction failed for split order:', tscErr);
          splitOrderInfo.isTscOffline = true;
        }

        const splitCreatePayload: any = {
          orderStatusId: ORDER_STATUS.DELIVERED,
          orderDetails: splitOrderInfo,
          companyId,
          settleInfo: splitSettlePayload,
          parentLocalOrderId: localOrderId,
        };

        const createdSplitOrder = await orderService.createOrder(splitCreatePayload);
        const createdSplitOrderId =
          createdSplitOrder?._id ||
          createdSplitOrder?.id ||
          createdSplitOrder?.orderId ||
          createdSplitOrder?.localOrderId;
        const splitOrderForPrint = {
          ...splitOrderInfo,
          localOrderId: createdSplitOrderId || undefined,
          customOrderId: createdSplitOrder?.customOrderId || splitOrderInfo.customOrderId,
        };

        if (remainingOrderItems.length > 0) {
          const remainingOrderDetails: any = {
            ...orderDetails,
            orderItem: remainingOrderItems,
            orderStatusId: ORDER_STATUS.PENDING,
            orderSubTotal: remainingSubTotal,
            orderTotal: remainingTotal,
            orderDiscountTotal: remainingDiscount,
            orderTaxTotal: remainingTax,
            orderCartTaxAndChargesTotal: remainingTax,
            orderPaymentSummary: { paymentProcessorId: 3 },
            paymentMethod: 3,
            count: remainingOrderItems.length,
            isSplitOrder: true,
            updatedAt: now,
            tip: 0,
            isPaid: 0,
            deliveryCharge,
          };

          await orderService.updateOrder(`${localOrderId}`, {
            orderStatusId: ORDER_STATUS.PENDING,
            orderDetails: remainingOrderDetails,
            settleInfo: {
              ...splitSettlePayload,
              splitLog: true,
            },
          });

          if (option?.print) {
            emitPosPrint(splitOrderForPrint, selectedPaymentMethod);
          }

          await emitOrderSync('ORDER_UPDATED', {
            tableNo: orderDetails?.tableNo ?? null,
            orderNumber: order?.customOrderId || order?._id,
            orderDeliveryTypeId,
          });

          setWorkingOrderDetails(remainingOrderDetails);
          const paidItemQty = selectedOrderItems.reduce(
            (sum: number, item: any) => sum + toNumber(item?.quantity, 0),
            0
          );
          showToast(
            `Split payment saved (${paidItemQty} item${paidItemQty === 1 ? '' : 's'} paid)`,
            { type: 'success' }
          );
          setMarking(false);
          return { keepModalOpen: true };
        }

        const splitOrdersFromDb = await localDatabase.select('order', {
          where: {
            parentLocalOrderId: localOrderId,
          },
        });
        const splitOrders = Array.isArray(splitOrdersFromDb)
          ? [...splitOrdersFromDb]
          : [];
        if (
          createdSplitOrderId &&
          !splitOrders.some(
            (splitOrder: any) =>
              `${splitOrder?._id || splitOrder?.id || ''}` ===
              `${createdSplitOrderId}`
          )
        ) {
          splitOrders.push({
            ...(createdSplitOrder || {}),
            _id: createdSplitOrderId,
            parentLocalOrderId: localOrderId,
            orderDetails: splitOrderInfo,
          });
        }

        const itemMap = new Map<string, any>();
        let mainOrderSubTotal = 0;
        let mainOrderTotal = 0;
        let mainOrderDiscount = 0;
        let mainOrderTax = 0;
        let finalOrderTip = 0;
        let finalOrderDeliveryCharge = 0;

        splitOrders.forEach((splitOrder: any, index: number) => {
          const details = splitOrder?.orderDetails || {};
          mainOrderSubTotal += toNumber(details.orderSubTotal, 0);
          mainOrderTotal += toNumber(details.orderTotal, 0);
          mainOrderDiscount += toNumber(details.orderDiscountTotal, 0);
          mainOrderTax += toNumber(
            details.orderTaxTotal ?? details.orderCartTaxAndChargesTotal,
            0
          );
          finalOrderTip += toNumber(details.tip, 0);
          finalOrderDeliveryCharge += toNumber(details.deliveryCharge, 0);

          const splitItems = Array.isArray(details.orderItem) ? details.orderItem : [];
          splitItems.forEach((splitItem: any, itemIndex: number) => {
            const key =
              splitItem?.cartId ||
              `${splitItem?.menuItemId || splitItem?.itemName || 'item'}-${index}-${itemIndex}`;
            if (itemMap.has(key)) {
              const existing = itemMap.get(key);
              existing.quantity = toNumber(existing.quantity, 0) + toNumber(splitItem.quantity, 0);
              delete existing.splitPaidQuantity;
            } else {
              const cloned = { ...splitItem };
              delete cloned.splitPaidQuantity;
              itemMap.set(key, cloned);
            }
          });
        });

        const mergedOrderItems = Array.from(itemMap.values());
        const mainOrderInvoiceNumber =
          (await commonFunctionService.generateInvoice(companyId)) || invoiceNumber;
        const finalizedMainOrderInfo: any = {
          ...orderDetails,
          orderItem: mergedOrderItems,
          orderSubTotal: round2(mainOrderSubTotal),
          orderTotal: round2(mainOrderTotal),
          orderDiscountTotal: round2(mainOrderDiscount),
          orderTaxTotal: round2(mainOrderTax),
          orderCartTaxAndChargesTotal: round2(mainOrderTax),
          orderStatusId: ORDER_STATUS.DELIVERED,
          updatedAt: now,
          paidAt: now,
          tip: round2(finalOrderTip),
          deliveryCharge: round2(finalOrderDeliveryCharge),
          count: mergedOrderItems.length || toNumber(orderDetails?.count, 1),
          isSplitOrder: true,
          isPaid: 1,
          localOrderId,
          customOrderId: order?.customOrderId || orderDetails?.customOrderId,
          parentLocalOrderId: undefined,
          invoiceNumber: mainOrderInvoiceNumber,
          paidBy: paidBy || undefined,
          orderPaymentSummary: {
            paymentProcessorId: 3,
          },
        };

        const bulkOrdersObj: any[] = splitOrders.map((splitOrder: any) => {
          const details = splitOrder?.orderDetails || {};
          const paymentMethod = toNumber(
            details?.paymentMethod ??
              details?.orderPaymentSummary?.paymentProcessorId,
            selectedPaymentMethod
          );
          const splitLocalOrderId =
            splitOrder?._id || splitOrder?.id || details?.localOrderId;

          return {
            currency: details?.currency || currency,
            paymentMethod,
            amount: toNumber(details?.orderTotal, 0),
            moneyBack: 0,
            tip: toNumber(details?.tip, 0),
            deliveryCharge: toNumber(details?.deliveryCharge, 0),
            orderInfo: {
              orderStatusId: ORDER_STATUS.DELIVERED,
              ...details,
              updatedAt: now,
              localOrderId: splitLocalOrderId,
              parentLocalOrderId: splitOrder?.parentLocalOrderId || localOrderId,
              customOrderId: splitOrder?.customOrderId || details?.customOrderId,
            },
          };
        });

        const mainSettleObj = {
          currency,
          paymentMethod: selectedPaymentMethod,
          amount: round2(mainOrderTotal),
          moneyBack: 0,
          tip: round2(finalOrderTip),
          deliveryCharge: round2(finalOrderDeliveryCharge),
          orderInfo: {
            ...finalizedMainOrderInfo,
            localOrderId,
            customOrderId: order?.customOrderId || orderDetails?.customOrderId,
            paymentMethod: selectedPaymentMethod,
            orderPaymentDetails: [
              {
                paymentProcessorId: selectedPaymentMethod,
                paymentTotal: round2(mainOrderTotal),
              },
            ],
            orderPaymentSummary: {
              paymentProcessorId: selectedPaymentMethod,
            },
          },
        };

        bulkOrdersObj.push({
          ...mainSettleObj,
          isOrderPaid: isPaid,
        });

        await orderService.updateOrder(`${localOrderId}`, {
          orderStatusId: ORDER_STATUS.DELIVERED,
          orderDetails: finalizedMainOrderInfo,
          settleInfo: {
            ...mainSettleObj,
            splitLog: true,
          },
        });

        try {
          const bulkSettleRes: any = await orderService.settleBulkOrder(bulkOrdersObj);
          const bulkSettleRows = Array.isArray(bulkSettleRes?.data)
            ? bulkSettleRes.data
            : Array.isArray(bulkSettleRes?.data?.data)
              ? bulkSettleRes.data.data
              : Array.isArray(bulkSettleRes)
                ? bulkSettleRes
                : [];

          if (bulkSettleRows.length > 0) {
            const localOrdersToUpdate = new Map<string, any>();

            splitOrders.forEach((splitOrder: any) => {
              const splitId =
                splitOrder?._id ||
                splitOrder?.id ||
                splitOrder?.orderDetails?.localOrderId;
              if (splitId !== undefined && splitId !== null && `${splitId}` !== '') {
                localOrdersToUpdate.set(`${splitId}`, splitOrder);
              }
            });

            if (localOrderId !== undefined && localOrderId !== null && `${localOrderId}` !== '') {
              localOrdersToUpdate.set(`${localOrderId}`, {
                _id: localOrderId,
                id: order?.id,
                customOrderId: order?.customOrderId || orderDetails?.customOrderId,
                orderDetails: finalizedMainOrderInfo,
                settleInfo: {
                  ...mainSettleObj,
                  splitLog: true,
                },
              });
            }

            const bulkRowByLocalId = new Map<string, any>();
            bulkSettleRows.forEach((row: any) => {
              const localIdCandidates = [
                row?.dataValues?.localOrderId,
                row?.localOrderId,
                row?.orderInfo?.localOrderId,
                row?.orderDetails?.localOrderId,
                row?.data?.localOrderId,
                row?.data?.dataValues?.localOrderId,
              ];

              localIdCandidates.forEach((candidateId) => {
                if (
                  candidateId !== undefined &&
                  candidateId !== null &&
                  `${candidateId}` !== ''
                ) {
                  bulkRowByLocalId.set(`${candidateId}`, row);
                }
              });
            });

            const localOrderUpdateTasks: Promise<any>[] = [];

            localOrdersToUpdate.forEach((localOrderRecord: any, currentLocalId: string) => {
              const settledRow = bulkRowByLocalId.get(currentLocalId);
              const existingOrderDetails = localOrderRecord?.orderDetails || {};
              const settledDataValues =
                settledRow?.dataValues ??
                settledRow?.data?.dataValues ??
                settledRow?.data ??
                {};
              const updatedPaidAt =
                settledDataValues?.paidAt ??
                settledRow?.paidAt ??
                existingOrderDetails?.paidAt ??
                now;
              const updatedOrderDetails: any = {
                ...existingOrderDetails,
                orderStatusId: ORDER_STATUS.DELIVERED,
                updatedAt: now,
                paidAt: updatedPaidAt,
                localOrderId: currentLocalId,
                parentLocalOrderId:
                  localOrderRecord?.parentLocalOrderId ??
                  existingOrderDetails?.parentLocalOrderId,
                isTscOffline:
                  settledRow?.isTscOffline ??
                  settledDataValues?.isTscOffline ??
                  existingOrderDetails?.isTscOffline,
                tsc:
                  settledRow?.tsc ??
                  settledDataValues?.tsc ??
                  existingOrderDetails?.tsc,
                orderPaymentSummary:
                  settledRow?.orderPaymentSummary ??
                  settledDataValues?.orderPaymentSummary ??
                  existingOrderDetails?.orderPaymentSummary,
                orderPaymentDetails:
                  settledRow?.orderPaymentDetails ??
                  settledDataValues?.orderPaymentDetails ??
                  existingOrderDetails?.orderPaymentDetails,
                giftCardLogs:
                  settledRow?.giftCardLogs ??
                  settledDataValues?.giftCardLogs ??
                  existingOrderDetails?.giftCardLogs ??
                  null,
                orderCustomerDetails:
                  settledRow?.orderCustomerDetails ??
                  settledDataValues?.orderCustomerDetails ??
                  existingOrderDetails?.orderCustomerDetails,
                invoiceNumber:
                  settledDataValues?.invoiceNumber ??
                  settledRow?.invoiceNumber ??
                  existingOrderDetails?.invoiceNumber,
              };

              if (!updatedOrderDetails?.parentLocalOrderId) {
                delete updatedOrderDetails.parentLocalOrderId;
              }

              const updatedSettleInfo = {
                ...(localOrderRecord?.settleInfo || {}),
                splitLog: true,
                orderInfo: {
                  ...(localOrderRecord?.settleInfo?.orderInfo || {}),
                  ...updatedOrderDetails,
                  isSynced: true,
                  localOrderId: currentLocalId,
                  parentLocalOrderId:
                    localOrderRecord?.parentLocalOrderId || undefined,
                  customOrderId:
                    localOrderRecord?.customOrderId ||
                    updatedOrderDetails?.customOrderId,
                },
              };

              localOrderUpdateTasks.push(
                orderService.updateOrder(currentLocalId, {
                  orderStatusId: ORDER_STATUS.DELIVERED,
                  isSynced: true,
                  orderDetails: updatedOrderDetails,
                  settleInfo: updatedSettleInfo,
                })
              );
            });

            if (localOrderUpdateTasks.length > 0) {
              await Promise.all(localOrderUpdateTasks);
            }
          }
        } catch (bulkErr) {
          console.warn('settleBulkOrder failed; orders kept local for sync:', bulkErr);
        }

        if (option?.print) {
          emitPosPrint(splitOrderForPrint, selectedPaymentMethod);
        }

        await emitOrderSync('ORDER_PAID', {
          tableNo: orderDetails?.tableNo ?? null,
          orderNumber: order?.customOrderId || order?._id,
          orderDeliveryTypeId,
        });

        showToast('Split payment completed', { type: 'success' });
        await unlockOrder(order);
        setMarking(false);
        navigation.goBack();
        return { keepModalOpen: false };
      }

      const orderInfo: any = {
        companyId,
        currency,
        isPickup: orderDetails?.isPickup ?? orderDeliveryTypeId === 2,
        pickupDateTime: orderDetails?.pickupDateTime ?? null,
        familyName: orderDetails?.familyName ?? '',
        orderType,
        isSandbox: orderDetails?.isSandbox ?? false,
        isPriceIncludingTax: orderDetails?.isPriceIncludingTax ?? false,
        orderTaxTotal: payableTax,
        orderCartTaxAndChargesTotal: payableTax,
        orderDeliveryTypeId,
        orderPromoCodeDiscountTotal: toNumber(
          orderDetails?.orderPromoCodeDiscountTotal,
          0
        ),
        countryCode: orderDetails?.countryCode || userData?.countryCode || 'IN',
        orderNotes: orderDetails?.orderNotes || '',
        orderDiscountTotal: payableDiscount,
        orderItem: normalizedOrderItems,
        orderStatusId: ORDER_STATUS.DELIVERED,
        orderSubTotal: payableSubTotal,
        orderTotal: payableTotal,
        createdAt: orderDetails?.createdAt || order?.createdAt || now,
        count: payableCount,
        user: orderDetails?.user || order?.user || userData || null,
        addedBy: orderDetails?.addedBy ?? paidBy ?? null,
        posId: orderDetails?.posId || order?.posId || '',
        onHold: orderDetails?.onHold ?? false,
        holdingName: orderDetails?.holdingName ?? '',
        atgPinsPayloads: orderDetails?.atgPinsPayloads ?? [],
        tableNo: orderDetails?.tableNo ?? null,
        tableArea: orderDetails?.tableArea ?? null,
        tsc: tsc ?? undefined,
        customOrderId: orderDetails?.customOrderId || order?.customOrderId || '',
        localOrderId,
        reason: orderDetails?.reason ?? '',
        isDeleted: orderDetails?.isDeleted ?? order?.isDeleted ?? false,
        updatedAt: now,
        paidAt: now,
        isCorporate: orderDetails?.isCorporate ?? false,
        isSplitOrder: isItemSplit || orderDetails?.isSplitOrder || false,
        isFinalBillPrint: !!option.print,
        canceledOrderPayment: orderDetails?.canceledOrderPayment ?? 0,
        invoiceNumber,
        paidBy: paidBy || undefined,
        company: orderDetails?.company || order?.company || undefined,
        printObj: orderDetails?.printObj ?? order?.printObj ?? undefined,
        paymentMethod: selectedPaymentMethod,
        tip,
        deliveryCharge: payableDeliveryCharge,
      };

      orderInfo.orderPaymentSummary = orderPaymentSummary;
      orderInfo.orderPaymentDetails = orderPaymentDetails;

      if (giftCard) {
        orderInfo.giftCard = giftCard;
        orderInfo.appliedGiftCard = giftCard;
        orderInfo.giftCardTotal = giftCardTotal;
        orderInfo.isfullPaidWithGiftCard =
          giftCardTotal > 0 && Math.abs(totals.total - giftCardTotal) < 0.01;
      }

      const settlePayload: any = {
        currency,
        paymentMethod: selectedPaymentMethod,
        amount,
        tip,
        deliveryCharge: payableDeliveryCharge,
        isEditPayment: false,
        orderInfo,
      };

        const settleRes = await orderService.settleOrder(
          order._id || order.id || order.orderId,
          settlePayload
        );
        const normalized = settleRes?.normalized;
        console.log(normalized)
        if (normalized) {
          orderInfo.orderPaymentSummary =
            normalized.orderPaymentSummary ?? orderInfo.orderPaymentSummary;
          if (normalized.orderPaymentDetails) {
            orderInfo.orderPaymentDetails = normalized.orderPaymentDetails;
          }
          if (normalized.paidAt) {
            orderInfo.paidAt = normalized.paidAt;
          }
          if (normalized.tsc !== undefined) {
            console.log('tsc===>',normalized.tsc)
            orderInfo.tsc = normalized.tsc;
          }
          if (normalized.invoiceNumber !== undefined) {
            orderInfo.invoiceNumber = normalized.invoiceNumber;
          }
          if (normalized.giftCardLogs !== undefined) {
            orderInfo.giftCardLogs = normalized.giftCardLogs;
          }
          if (normalized.orderCustomerDetails !== undefined) {
            orderInfo.orderCustomerDetails = normalized.orderCustomerDetails;
          }
        }
        if (option?.print) {
          emitPosPrint(orderInfo, selectedPaymentMethod);
        }
        await emitOrderSync('ORDER_PAID', {
          tableNo: orderDetails?.tableNo ?? null,
          orderNumber: order?.customOrderId || order?._id,
          orderDeliveryTypeId,
        });
      await unlockOrder(order);
      setMarking(false);
      navigation.goBack();
      return { keepModalOpen: false };
    } catch (err) {
      setMarking(false);
      console.error('Error settling order after payment selection:', err);
      showToast('Unable to complete payment', { type: 'error' });
      return { keepModalOpen: false };
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
                  {getOrderTypeLabel(displayedOrderDetails?.orderDeliveryTypeId ?? 0, displayedOrderDetails?.tableNo)}
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
                {formatTimestamp(order.createdAt || displayedOrderDetails?.createdAt)}
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
                              {valuePrice > 0 ? ` (+${formatCurrency(valuePrice)})` : ''}
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
                        {formatCurrency(itemUnitTotal)} each
                      </Text>
                      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginTop: 2 }}>
                        {formatCurrency(itemLineTotal)}
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
              {displayedOrderDetails?.orderNotes || 'No order note added.'}
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
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {formatCurrency(totals.total)}
              </Text>
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
          setSelectedPaymentId(
            toNumber(option?.paymentMethod ?? option?.id, 0)
          );
          if (!pendingSettle) return;

          const isSplitSelection = option?.isItemSplit === true;
          if (!isSplitSelection) {
            setPaymentModalVisible(false);
          }

          const settleResult = await settleOrderWithPayment(option);
          if (isSplitSelection && settleResult?.keepModalOpen) {
            setPaymentModalVisible(true);
            setPendingSettle(true);
            return;
          }

          setPendingSettle(false);
        }}
        orderTotal={totals.total}
        splitItems={splitPaymentItems}
        allowSplitOption={allowSplitOption}
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
            <Text style={{ color: colors.text, fontWeight: '700' }}>
              {formatCurrency(totals.subtotal)}
            </Text>
          </View>
          {totals.tax > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={{ color: colors.textSecondary }}>Tax</Text>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {formatCurrency(totals.tax)}
              </Text>
            </View>
          ) : null}
          {totals.discount > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={{ color: colors.textSecondary }}>Discount</Text>
              <Text style={{ color: colors.error, fontWeight: '700' }}>
                {formatCurrency(-totals.discount)}
              </Text>
            </View>
          ) : null}
          <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }]}>
            <Text style={{ color: colors.text, fontWeight: '800' }}>Total</Text>
            <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 17 }}>
              {formatCurrency(totals.total)}
            </Text>
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
              lockPayment(order);
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
