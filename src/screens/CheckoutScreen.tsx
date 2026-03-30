import React, { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from 'react';
import {
  Alert,
  BackHandler,
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
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { useTranslation } from '../contexts/LanguageContext';
import { useOrderSubmit } from '../hooks/useOrderSubmit';
import { useCartNotes } from '../hooks/useCartNotes';
import cartService, { Cart, CartItem } from '../services/cartService';
import CartNoteModal from '../components/CartNoteModal';
import ItemNoteModal from '../components/ItemNoteModal';
import PinModal from '../components/PinModal';
import OrderTimeModal from '../components/OrderTimeModal';
import { CartItemRow } from '../components/MenuScreen/CartItemRow';
import { formatCurrency } from '../utils/currency';
import { emitOrderSync, emitPosKotPrint, unlockOrder, unlockTable } from '../services/orderSyncService';
import { useToast } from '../components/ToastProvider';
import {
  getCartItemQuantity,
  getCartSubtotal,
  getDiscountAmount,
} from '../utils/cartCalculations';
import { OrderServiceTiming } from '../types/orderFlow';
import { formatOrderServiceTime } from '../utils/orderServiceDisplay';
import {
  buildPosPrintCurrentUser,
  formatCustomerAddress,
  getCustomerDisplayName,
  getSelectedCustomerAddress,
  mergeOrderCustomerData,
  resolveOrderCustomer,
} from '../utils/customerData';

interface CheckoutScreenProps {
  navigation: any;
  route: any;
}

const getServiceTypeLabel = (
  deliveryType: number,
  tableNo: number | null,
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string,
) => {
  if (tableNo) return `${t('table')} ${tableNo}`;
  if (deliveryType === 1) return t('delivery');
  if (deliveryType === 2) return t('pickup');
  if (deliveryType === 3) return t('kiosk');
  return t('walkIn');
};

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

export default function CheckoutScreen({ navigation, route }: CheckoutScreenProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const incomingCart = (route.params?.cart || { items: [], orderNote: '', discount: null }) as Cart;
  const tableNo = route.params?.tableNo ?? null;
  const deliveryType = route.params?.deliveryType ?? 0;
  const tableArea = route.params?.tableArea ?? null;
  const existingOrder = route.params?.existingOrder ?? null;
  const serviceTiming = (route.params?.serviceTiming ?? null) as OrderServiceTiming | null;

  const [checkoutCart, setCheckoutCart] = useState<Cart>(incomingCart);
  const [currentServiceTiming, setCurrentServiceTiming] = useState<OrderServiceTiming | null>(
    serviceTiming ??
    (deliveryType !== 0
      ? {
        pickupDateTime: existingOrder?.orderDetails?.pickupDateTime ?? null,
        familyName: existingOrder?.orderDetails?.familyName ?? '',
      }
      : null),
  );
  const [showServiceTimeModal, setShowServiceTimeModal] = useState(false);
  const { showToast } = useToast();
  const [decreasePinChecked, setDecreasePinChecked] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const pendingDecreaseRef = useRef<
    { type: 'update' | 'remove'; cartId: string; quantity?: number } | null
  >(null);

  const orderSubmit = useOrderSubmit(
    checkoutCart,
    tableNo,
    deliveryType,
    tableArea,
    existingOrder,
    currentServiceTiming
  );
  const cartNotes = useCartNotes(
    checkoutCart,
    async (cartId: string, note: string) => {
      const updatedCart = await cartService.updateItemNote(cartId, note);
      setCheckoutCart(updatedCart);
      return updatedCart;
    },
    async (discount: any) => {
      const updatedCart = await cartService.updateDiscount(discount);
      setCheckoutCart(updatedCart);
      return updatedCart;
    }
  );

  const placeAnim = useRef(new Animated.Value(1)).current;
  const toastNavTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack?.()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Menu', {
      tableNo,
      deliveryType,
      tableArea,
      existingOrder,
      serviceTiming: currentServiceTiming ?? serviceTiming ?? null,
    });
  }, [navigation, tableNo, deliveryType, tableArea, existingOrder, currentServiceTiming, serviceTiming]);

  useEffect(() => {
    setCheckoutCart((route.params?.cart || { items: [], orderNote: '', discount: null }) as Cart);
  }, [route.params?.cart]);

  useEffect(() => {
    if (deliveryType === 0) {
      setCurrentServiceTiming(null);
      return;
    }

    setCurrentServiceTiming(
      serviceTiming ??
      {
        pickupDateTime: existingOrder?.orderDetails?.pickupDateTime ?? null,
        familyName: existingOrder?.orderDetails?.familyName ?? '',
      },
    );
  }, [deliveryType, existingOrder?.orderDetails?.familyName, existingOrder?.orderDetails?.pickupDateTime, serviceTiming]);

  useEffect(() => {
    cartService.loadCart().then(setCheckoutCart).catch(() => { });
  }, []);

  useEffect(() => {
    return () => {
      if (toastNavTimer.current) clearTimeout(toastNavTimer.current);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      if (toastNavTimer.current) {
        clearTimeout(toastNavTimer.current);
        toastNavTimer.current = null;
      }
    });

    return unsubscribe;
  }, [navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: ({ tintColor }: any) => (
        <TouchableOpacity
          onPress={goBackSafely}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: 2,
            backgroundColor: colors.surfaceHover || 'transparent',
          }}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={20}
            color={tintColor || colors.text}
          />
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.surfaceHover, colors.text, goBackSafely]);

  useFocusEffect(
    useCallback(() => {
      const onHardwareBackPress = () => {
        goBackSafely();
        return true;
      };

      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        onHardwareBackPress,
      );

      return () => subscription.remove();
    }, [goBackSafely]),
  );

  const shouldRequireDecreasePin = (cartId: string, nextQty?: number) => {
    if (!existingOrder) return false;
    const item = checkoutCart.items.find((entry) => entry.cartId === cartId);
    if (!item) return false;
    const isOldItem = item.isOld === true || item.oldQuantity != null;
    if (!isOldItem) return false;
    if (nextQty == null) return true;
    const currentQty = getCartItemQuantity(item);
    return nextQty < currentQty;
  };

  const handleUpdateQuantity = async (cartId: string, quantity: number) => {
    try {
      if (!decreasePinChecked && shouldRequireDecreasePin(cartId, quantity)) {
        pendingDecreaseRef.current = { type: 'update', cartId, quantity };
        setPinModalVisible(true);
        return;
      }

      if (quantity <= 0) {
        const updatedCart = await cartService.removeFromCart(cartId);
        setCheckoutCart(updatedCart);
        return;
      }

      const updatedCart = await cartService.updateQuantity(cartId, quantity);
      setCheckoutCart(updatedCart);
    } catch (error) {
      showToast('error', t('failedToUpdateItemQuantity'));
    }
  };

  const handleRemoveItem = async (cartId: string) => {
    try {
      if (!decreasePinChecked && shouldRequireDecreasePin(cartId)) {
        pendingDecreaseRef.current = { type: 'remove', cartId };
        setPinModalVisible(true);
        return;
      }

      const updatedCart = await cartService.removeFromCart(cartId);
      setCheckoutCart(updatedCart);
    } catch (error) {
      showToast('error', t('failedToRemoveItem'));
    }
  };

  const handlePinVerified = async () => {
    setPinModalVisible(false);
    setDecreasePinChecked(true);
    const pending = pendingDecreaseRef.current;
    pendingDecreaseRef.current = null;
    if (!pending) return;

    if (pending.type === 'update' && typeof pending.quantity === 'number') {
      await handleUpdateQuantity(pending.cartId, pending.quantity);
      return;
    }

    if (pending.type === 'remove') {
      await handleRemoveItem(pending.cartId);
    }
  };

  const subtotal = getCartSubtotal(checkoutCart);
  const discountAmount = getDiscountAmount(subtotal, checkoutCart.discount || null);
  const total = subtotal - discountAmount;
  const serviceTimeLabel = formatOrderServiceTime(currentServiceTiming?.pickupDateTime);
  const familyName = currentServiceTiming?.familyName?.trim() || '';
  const selectedCustomer = checkoutCart.currentUser || null;
  const selectedCustomerAddress = getSelectedCustomerAddress(selectedCustomer);
  const deliveryCharge =
    deliveryType === 1 ? toNumber(selectedCustomerAddress?.deliveryCharge, 0) : 0;
  const totalPayable = total + deliveryCharge;
  const selectedCustomerName =
    getCustomerDisplayName(selectedCustomer) ||
    selectedCustomer?.mobileNo ||
    '';
  const selectedCustomerAddressText = formatCustomerAddress(selectedCustomerAddress);
  const groupedItems = useMemo(() => {
    const groups = checkoutCart.items.reduce(
      (acc: Record<number, CartItem[]>, item) => {
        const groupType = item.groupType || 1;
        if (!acc[groupType]) acc[groupType] = [];
        acc[groupType].push(item);
        return acc;
      },
      {},
    );
    return Object.keys(groups)
      .map((key) => Number(key))
      .sort((a, b) => a - b)
      .map((groupType) => ({
        groupType,
        items: groups[groupType],
        label:
          groups[groupType].find((item) => item.groupLabel)?.groupLabel ||
          `Gange ${groupType}`,
      }));
  }, [checkoutCart.items]);
  const [expandedGroupType, setExpandedGroupType] = useState<number | null>(null);
  const groupCount = groupedItems.length;
  const latestGroupType =
    groupCount > 0 ? groupedItems[groupCount - 1].groupType : null;

  useEffect(() => {
    if (!groupCount) {
      setExpandedGroupType(null);
      return;
    }
    setExpandedGroupType(latestGroupType);
  }, [groupCount, latestGroupType]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: getServiceTypeLabel(deliveryType, tableNo, t),
      headerStyle: { backgroundColor: colors.background },
      headerTintColor: colors.text,
      headerTitleStyle: { fontWeight: '700' },
      headerRight: () => null,
    });
  }, [navigation, colors.background, colors.text, deliveryType, tableNo, t]);

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
      showToast('error', t('failedToSaveCartNote'));
    }
  };

  const handleServiceTimingSave = (value: OrderServiceTiming) => {
    setCurrentServiceTiming(value);
    navigation.setParams?.({
      serviceTiming: value,
    });
  };

  const confirmDeliveryMinimumOrder = async () => {
    if (deliveryType !== 1 || !selectedCustomerAddress) {
      return true;
    }

    const minimumOrderValue = toNumber(selectedCustomerAddress.minimumOrderValue, 0);
    if (minimumOrderValue <= 0 || total >= minimumOrderValue) {
      return true;
    }

    return await new Promise<boolean>((resolve) => {
      Alert.alert(
        t('minimumOrderNotReached'),
        `${t('thisAddressRequiresAMinimumOrderOf', {
          amount: formatCurrency(minimumOrderValue),
        })} ${t('doYouStillWantToContinue')}`,
        [
          {
            text: t('cancel'),
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: t('continueAction'),
            onPress: () => resolve(true),
          },
        ],
        {
          cancelable: true,
          onDismiss: () => resolve(false),
        },
      );
    });
  };

  const handlePlaceOrder = async () => {
    try {
      if (!checkoutCart.items?.length) {
        showToast('error', t('pleaseAddItemsBeforePlacingOrder'));
        return;
      }

      if (deliveryType === 0 && !tableNo) {
        showToast('error', t('pleaseSelectTable'));
        return;
      }

      const canContinue = await confirmDeliveryMinimumOrder();
      if (!canContinue) {
        return;
      }

      Animated.sequence([
        Animated.timing(placeAnim, { toValue: 0.96, duration: 90, useNativeDriver: true }),
        Animated.timing(placeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();

      const resolveDeltaPrintItems = (
        items: CartItem[],
        removedSeed: CartItem[] = [],
      ) => {
        const added: CartItem[] = [];
        const removed: CartItem[] = [...removedSeed];

        const pushRemoved = (item: CartItem, qty: number) => {
          if (qty <= 0) return;
          const existingIndex = removed.findIndex(
            (entry) => entry.cartId === item.cartId,
          );
          if (existingIndex > -1) {
            removed[existingIndex].quantity += qty;
            return;
          }
          removed.push({
            ...item,
            quantity: qty,
            isOld: false,
            oldQuantity: undefined,
          });
        };

        items.forEach((item) => {
          const isOld = item.isOld === true;
          const oldQty =
            item.oldQuantity != null ? toNumber(item.oldQuantity, 0) : null;
          const currentQty = toNumber(item.quantity, 0);

          if (isOld && oldQty == null) {
            return;
          }

          if (oldQty != null) {
            const delta = currentQty - oldQty;
            if (delta > 0) {
              added.push({ ...item, quantity: delta, isOld: false, oldQuantity: undefined });
            } else if (delta < 0) {
              pushRemoved(item, Math.abs(delta));
            }
            return;
          }

          added.push(item);
        });

        return { added, removed };
      };

      const { added: printSourceItems, removed: removedSourceItems } =
        existingOrder
          ? resolveDeltaPrintItems(
            checkoutCart.items,
            Array.isArray(checkoutCart.removedItems)
              ? checkoutCart.removedItems
              : [],
          )
          : { added: checkoutCart.items, removed: [] };

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
        const companyId =
          orderDetails?.companyId ||
          existingOrder?.companyId ||
          existingOrder?.orderDetails?.companyId ||
          0;
        const printItems =
          printSourceItems.length > 0
            ? orderSubmit.prepareOrderItems(companyId, printSourceItems)
            : [];
        const canceledItems =
          removedSourceItems.length > 0
            ? orderSubmit.prepareOrderItems(companyId, removedSourceItems)
            : [];
        const orderInfoForPrint = {
          ...mergeOrderCustomerData(orderDetails, checkoutCart.currentUser || null),
          orderNumber:
            orderDetails?.customOrderId ||
            submittedOrder?.customOrderId ||
            submittedOrder?._id ||
            submittedOrder?.id,
        };
        const printCurrentUser = buildPosPrintCurrentUser(
          resolveOrderCustomer(orderInfoForPrint, checkoutCart.currentUser || null),
        );
        const canceledPrintObj =
          canceledItems.length > 0
            ? {
              items: canceledItems,
              isOrderDetails: true,
              currentUser: printCurrentUser,
              orderInfo: {
                ...orderInfoForPrint,
                orderNumber: `${orderInfoForPrint.orderNumber}-C`,
              },
            }
            : undefined;
        if (printItems.length > 0 || canceledPrintObj) {
          emitPosKotPrint({
            items: printItems,
            canceledObj: canceledPrintObj,
            isOrderDetails: true,
            currentUser: printCurrentUser,
            orderInfo: orderInfoForPrint,
          });
        }
      }
      if (existingOrder) {
        await unlockOrder(existingOrder);
      } else if (tableNo) {
        await unlockTable(tableNo);
      }
      showToast('success', existingOrder ? t('orderUpdatedSuccessfully') : t('orderPlacedSuccessfully'));
      if (toastNavTimer.current) clearTimeout(toastNavTimer.current);
      toastNavTimer.current = setTimeout(() => {
        navigation.navigate('Dashboard');
      }, 800);
    } catch (error) {
      const rawMessage =
        (error as any)?.response?.data?.message ||
        (error as any)?.message ||
        '';
      const message =
        rawMessage === 'NO_ITEMS_IN_CART'
          ? t('pleaseAddItemsBeforePlacingOrder')
          : rawMessage === 'PLEASE_SELECT_TABLE'
            ? t('pleaseSelectTable')
            : rawMessage === 'COMPANY_ID_MISSING'
              ? t('companyIdMissingPleaseLoginAgain')
              : rawMessage === 'ORDER_ID_MISSING'
                ? t('orderIdMissingUnableToUpdateOrder')
                : rawMessage === 'FAILED_TO_CREATE_ORDER'
                  ? t('failedToCreateOrder')
                  : rawMessage === 'FAILED_TO_PLACE_ORDER'
                    ? t('failedToPlaceOrder')
                    : rawMessage || t('failedToPlaceOrder');
      showToast('error', message);
      console.error('Error placing order:', error);
    }
  };

  const renderOrderItem = (item: CartItem, index: number) => {
    return (
      <View
        key={item.cartId || `${item.itemId}-${index}`}
        style={[
          styles.itemCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            overflow: 'hidden',
          },
        ]}
      >
        <CartItemRow
          item={item}
          onOpenNoteModal={(noteItem) =>
            cartNotes.openItemNoteModal(
              noteItem.cartId || '',
              noteItem.orderItemNote || '',
            )
          }
          onUpdateQuantity={handleUpdateQuantity}
          onRemoveItem={handleRemoveItem}
          colors={colors}
        />
      </View>
    );
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['bottom']}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: insets.bottom + 214,
        }}
        showsVerticalScrollIndicator={false}
      >
        {deliveryType !== 0 ? (
          <View
            style={[
              styles.serviceCard,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <View style={styles.serviceHeaderRow}>
              <View style={styles.serviceHeaderContent}>
                <MaterialCommunityIcons
                  name={deliveryType === 1 ? 'truck-delivery-outline' : 'storefront-outline'}
                  size={18}
                  color={deliveryType === 1 ? colors.primary : colors.accent || colors.primary}
                />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                    {deliveryType === 1 ? t('delivery') : t('pickup')}
                  </Text>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, marginTop: 2 }}>
                    {getServiceTypeLabel(deliveryType, tableNo, t)}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setShowServiceTimeModal(true)}
                style={[
                  styles.serviceEditButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceHover || colors.background,
                  },
                ]}
              >
                <MaterialCommunityIcons name="pencil-outline" size={15} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12, marginLeft: 4 }}>
                  {t('edit')}
                </Text>
              </TouchableOpacity>
            </View>

            {serviceTimeLabel ? (
              <View style={styles.serviceMetaRow}>
                <MaterialCommunityIcons
                  name="clock-outline"
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 8 }}>
                  {deliveryType === 1 ? t('deliveryTime') : t('pickupTime')}:{' '}
                  <Text style={{ color: colors.text, fontWeight: '700' }}>
                    {serviceTimeLabel}
                  </Text>
                </Text>
              </View>
            ) : null}

            {deliveryType === 2 && familyName ? (
              <View style={styles.serviceMetaRow}>
                <MaterialCommunityIcons
                  name="account-group-outline"
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 8 }}>
                  {t('familyName')}:{' '}
                  <Text style={{ color: colors.text, fontWeight: '700' }}>
                    {familyName}
                  </Text>
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {selectedCustomer ? (
          <View
            style={[
              styles.serviceCard,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <View style={styles.serviceHeaderRow}>
              <View style={styles.serviceHeaderContent}>
                <MaterialCommunityIcons
                  name="account-outline"
                  size={18}
                  color={colors.secondary || colors.primary}
                />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                    {t('customer')}
                  </Text>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, marginTop: 2 }}>
                    {selectedCustomerName}
                  </Text>
                </View>
              </View>
            </View>

            {selectedCustomer.mobileNo ? (
              <View style={styles.serviceMetaRow}>
                <MaterialCommunityIcons
                  name="phone-outline"
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 8 }}>
                  {selectedCustomer.mobileNo}
                </Text>
              </View>
            ) : null}

            {deliveryType === 1 && selectedCustomerAddressText ? (
              <View style={styles.serviceMetaRow}>
                <MaterialCommunityIcons
                  name="map-marker-outline"
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 8, flex: 1 }}>
                  {selectedCustomerAddressText}
                </Text>
              </View>
            ) : null}

            {deliveryType === 1 && selectedCustomerAddress?.minimumOrderValue ? (
              <View style={styles.serviceMetaRow}>
                <MaterialCommunityIcons
                  name="cash-fast"
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 8 }}>
                  {t('minimumOrder')}:{' '}
                  <Text style={{ color: colors.text, fontWeight: '700' }}>
                    {formatCurrency(selectedCustomerAddress.minimumOrderValue)}
                  </Text>
                </Text>
              </View>
            ) : null}

            {deliveryType === 1 && deliveryCharge > 0 ? (
              <View style={styles.serviceMetaRow}>
                <MaterialCommunityIcons
                  name="truck-fast-outline"
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 8 }}>
                  {t('deliveryCharge')}:{' '}
                  <Text style={{ color: colors.text, fontWeight: '700' }}>
                    {formatCurrency(deliveryCharge)}
                  </Text>
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {checkoutCart.items.length > 0 ? (
          groupedItems.map((group) => {
            const isExpanded = groupCount <= 1 || expandedGroupType === group.groupType;
            return (
              <View key={`group-${group.groupType}`} style={{ marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => {
                    if (groupCount > 1) setExpandedGroupType(group.groupType);
                  }}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    marginBottom: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ color: colors.text, fontWeight: '700' }}>
                    {group.label}
                  </Text>
                  {groupCount > 1 ? (
                    <MaterialCommunityIcons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={colors.textSecondary}
                    />
                  ) : null}
                </TouchableOpacity>
                {isExpanded ? group.items.map((item, index) => renderOrderItem(item, index)) : null}
              </View>
            );
          })
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
            <Text style={{ color: colors.text, fontWeight: '700', marginTop: 10 }}>{t('cartIsEmpty')}</Text>
            <Text style={{ color: colors.textSecondary, marginTop: 4, textAlign: 'center', fontSize: 12 }}>
              {t('goBackToMenuAndAddItemsBeforeCheckout')}
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
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('subtotal')}</Text>
            <Text style={{ color: colors.text, fontWeight: '700' }}>
              {formatCurrency(subtotal)}
            </Text>
          </View>

          {discountAmount > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('discount')}</Text>
              <Text style={{ color: colors.error, fontWeight: '700' }}>
                {formatCurrency(-discountAmount)}
              </Text>
            </View>
          ) : null}

          {deliveryCharge > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('deliveryCharge')}</Text>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {formatCurrency(deliveryCharge)}
              </Text>
            </View>
          ) : null}

          <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }]}>
            <Text style={{ color: colors.text, fontWeight: '800' }}>{t('totalPayable')}</Text>
            <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 18 }}>
              {formatCurrency(totalPayable)}
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
              {t('addOrderNoteDiscount')}
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
                  {t('placeOrder')}
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

      <ItemNoteModal
        visible={cartNotes.showItemNoteModal}
        initialNote={cartNotes.itemNoteDraft}
        onClose={() => cartNotes.setShowItemNoteModal(false)}
        onSave={cartNotes.saveItemNoteModal}
      />

      <PinModal
        visible={pinModalVisible}
        onClose={() => {
          setPinModalVisible(false);
          pendingDecreaseRef.current = null;
        }}
        onVerified={handlePinVerified}
      />

      <OrderTimeModal
        visible={showServiceTimeModal}
        deliveryType={deliveryType}
        initialValue={currentServiceTiming}
        onClose={() => setShowServiceTimeModal(false)}
        onSave={handleServiceTimingSave}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  itemCard: {
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 10,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
  },
  serviceCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  serviceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  serviceHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  serviceEditButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
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
