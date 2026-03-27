import React, { useState, useLayoutEffect, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { useTheme } from '../theme/ThemeProvider';
import { useTranslation } from '../contexts/LanguageContext';
import { SERVER_BASE_URL } from '../config/urls';
import { getOrderStatusLabel } from '../utils/orderUtils';
import { formatCurrency } from '../utils/currency';
import { formatOrderServiceTime } from '../utils/orderServiceDisplay';
import { isOrderLocked, isTableLocked, lockOrder, lockTable } from '../services/orderSyncService';
import { useToast } from '../components/ToastProvider';
import cartService from '../services/cartService';
import OrderTimeModal from '../components/OrderTimeModal';

// Hooks
import { useOrdersData, DELIVERY_TYPE, Order } from '../hooks/useOrdersData';
import { useSettings } from '../hooks/useSettings';
import { useTableStatistics } from '../hooks/useTableStatistics';
import { OrderServiceTiming } from '../types/orderFlow';

interface DashboardScreenProps {
  navigation: any;
}

/**
 * Refactored DashboardScreen with extracted logic
 * Responsibilities: Navigation, state orchestration, and layout
 */
export default function DashboardScreen({ navigation }: DashboardScreenProps) {
  const { colors } = useTheme();
  const { t, language } = useTranslation();

  // Use custom hooks for complex logic
  const ordersData = useOrdersData();
  const settingsData = useSettings();
  const tableStats = useTableStatistics(ordersData.dineInTables, settingsData.settings);
  const { showToast } = useToast();

  const getOrderDisplayLabel = (order: Order | any) => {
    const tableNo = order?.orderDetails?.tableNo;
    if (tableNo) return `${t('table')} ${tableNo}`;
    return order?.customOrderId || order?.id || order?._id || t('order');
  };

  // Local state
  const [activeTab, setActiveTab] = useState<number>(DELIVERY_TYPE.DINE_IN);
  const [refreshing, setRefreshing] = useState(false);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [selectedTableArea, setSelectedTableArea] = useState<any | null>(null);
  const [serviceTimeModalVisible, setServiceTimeModalVisible] = useState(false);
  const [pendingServiceType, setPendingServiceType] = useState<number | null>(null);

  const companyDisplayName = useMemo(() => {
    const rawName =
      settingsData.settings?.companyName ||
      settingsData.settings?.company?.name ||
      '';
    return rawName.trim();
  }, [settingsData.settings?.companyName, settingsData.settings?.company?.name]);

  const companyInitials = useMemo(() => {
    const companyName = companyDisplayName || 'POS';
    const parts = companyName.split(' ').filter(Boolean);
    if (parts.length === 0) return 'POS';
    if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }, [companyDisplayName]);

  /**
   * Load and set logo from user data - only on mount
   */
  useEffect(() => {
    const loadUserData = async () => {
      const userData = await AsyncStorage.getItem(STORAGE_KEYS.authUser);
      if (userData) {
        const user = JSON.parse(userData);
        const imagePath = String(user?.company?.imagePath || '').trim();

        if (!imagePath) {
          setLogoUri(null);
          return;
        }

        const resolvedUri = imagePath.startsWith('http')
          ? imagePath
          : `${SERVER_BASE_URL.replace(/\/+$/, '')}/${imagePath.replace(/^\/+/, '')}`;

        setLogoLoadFailed(false);
        setLogoUri(resolvedUri);
      }
    };
    loadUserData();
  }, []);

  const tableAreaList = useMemo(() => {
    const rawAreas = (settingsData.settings as any)?.tableAreas;
    if (!Array.isArray(rawAreas)) return [];
    return rawAreas.filter(
      (area: any) =>
        Array.isArray(area?.tableAreaMappings) &&
        area.tableAreaMappings.length > 0
    );
  }, [settingsData.settings]);

  const allAreaTables = useMemo(() => {
    if (!tableAreaList.length) return [];
    const tableNos = tableAreaList.flatMap((area: any) =>
      Array.isArray(area?.tableAreaMappings)
        ? area.tableAreaMappings
          .filter((mapping: any) => mapping?.isActive !== false)
          .map((mapping: any) => Number(mapping.tableNo))
        : []
    );
    const unique = Array.from(
      new Set(tableNos.filter((value: number) => Number.isFinite(value)))
    );
    return unique.sort((a, b) => a - b);
  }, [tableAreaList]);

  const bookedTableNos = useMemo(() => {
    const tableNos = ordersData.dineInTables
      .map((order) => Number(order.orderDetails?.tableNo))
      .filter((value) => Number.isFinite(value));
    return new Set(tableNos);
  }, [ordersData.dineInTables]);

  useEffect(() => {
    if (!tableAreaList.length) {
      if (selectedTableArea !== null) {
        setSelectedTableArea(null);
      }
      return;
    }

    const stillExists = tableAreaList.some(
      (area: any) => area?.id === selectedTableArea?.id
    );

    if (!selectedTableArea || !stillExists) {
      setSelectedTableArea(tableAreaList[0]);
    }
  }, [tableAreaList, selectedTableArea]);

  const getAreaBookedCount = (area: any) => {
    if (!area || !Array.isArray(area.tableAreaMappings)) return 0;
    return area.tableAreaMappings.filter((mapping: any) => {
      if (mapping?.isActive === false) return false;
      const tableNo = Number(mapping.tableNo);
      return Number.isFinite(tableNo) && bookedTableNos.has(tableNo);
    }).length;
  };

  const getActiveTablesFromArea = (area: any) => {
    if (!area || !Array.isArray(area.tableAreaMappings)) return [];
    const tableNos = area.tableAreaMappings
      .filter((mapping: any) => mapping?.isActive !== false)
      .map((mapping: any) => Number(mapping.tableNo))
      .filter((value: number) => Number.isFinite(value));
    return Array.from(new Set(tableNos)).sort((a: any, b: any) => a - b);
  };

  const selectedAreaTables = useMemo(
    () => getActiveTablesFromArea(selectedTableArea),
    [selectedTableArea]
  );

  const tableNumbers = useMemo(() => {
    if (selectedTableArea) {
      return selectedAreaTables;
    }

    if (allAreaTables.length > 0) {
      return allAreaTables;
    }

    const total = Number(settingsData.settings?.totalTables ?? 0);
    if (total > 0) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    return [];
  }, [selectedAreaTables, selectedTableArea, allAreaTables, settingsData.settings]);

  const resolveTableAreaForTable = (tableNo: number) => {
    if (!tableAreaList.length) return null;

    const findInArea = (area: any) => {
      if (!area || !Array.isArray(area.tableAreaMappings)) return null;
      const mapping = area.tableAreaMappings.find((m: any) => {
        const mappedNo = Number(m?.tableNo);
        return Number.isFinite(mappedNo) && mappedNo === tableNo && m?.isActive !== false;
      });
      if (!mapping) return null;

      const payload: any = { ...area, tableAreaMappings: [mapping] };
      delete payload.company;
      delete payload.freeTables;
      return payload;
    };

    const fromSelected = findInArea(selectedTableArea);
    if (fromSelected) return fromSelected;

    for (const area of tableAreaList) {
      const found = findInArea(area);
      if (found) return found;
    }

    return null;
  };

  const handleServiceFlowStart = () => {
    if (
      activeTab !== DELIVERY_TYPE.DELIVERY &&
      activeTab !== DELIVERY_TYPE.PICKUP
    ) {
      return;
    }

    setPendingServiceType(activeTab);
    setServiceTimeModalVisible(true);
  };

  const handleServiceFlowClose = () => {
    setServiceTimeModalVisible(false);
    setPendingServiceType(null);
  };

  const handleServiceFlowSave = (serviceTiming: OrderServiceTiming) => {
    const nextDeliveryType = pendingServiceType ?? activeTab;

    navigation.navigate('Menu', {
      tableNo: null,
      deliveryType: nextDeliveryType,
      serviceTiming,
    });

    handleServiceFlowClose();
  };

  /**
   * Memoize header left component to prevent re-renders on tab change
   */
  const headerLeftComponent = useMemo(
    () => (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => navigation.getParent?.()?.openDrawer?.()}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8,
            backgroundColor: colors.surfaceHover,
          }}
        >
          <MaterialIcons name="menu" size={20} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.getParent?.()?.openDrawer?.()}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            overflow: 'hidden',
            backgroundColor: colors.surfaceHover,
          }}
        >
          {logoUri && !logoLoadFailed ? (
            <Image
              source={{ uri: logoUri }}
              style={{ width: 36, height: 36 }}
              contentFit="cover"
              cachePolicy="disk"
              transition={120}
              onError={(error) => {
                console.log('Dashboard logo failed to load:', error);
                setLogoLoadFailed(true);
              }}
            />
          ) : (
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primary + '20',
              }}
            >
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 12,
                  fontWeight: '800',
                }}
              >
                {companyInitials}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    ),
    [colors, companyInitials, logoLoadFailed, logoUri, navigation]
  );

  /**
   * Memoize header right component to prevent re-renders on tab change
   */
  const headerRightComponent = useMemo(
    () => (
      <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 100 }}>
        <TouchableOpacity
          onPress={() => {
            /* search placeholder */
          }}
          style={{ padding: 8, borderRadius: 100 }}
        >
          <MaterialIcons name="search" size={20} color={colors.text} />
        </TouchableOpacity>

        {activeTab !== DELIVERY_TYPE.DINE_IN && (
          <TouchableOpacity
            onPress={handleServiceFlowStart}
            style={{ padding: 8 }}
          >
            <MaterialIcons name="add-circle-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    ),
    [colors, activeTab, handleServiceFlowStart]
  );

  /**
   * Set header options - only update when necessary
   */
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: t('dashboard'),
      headerStyle: { backgroundColor: colors.background },
      headerTintColor: colors.text,
      headerTitleStyle: { fontWeight: '700' },
      headerLeft: () => headerLeftComponent,
      headerRight: () => headerRightComponent,
    });
  }, [navigation, colors.background, colors.text, headerLeftComponent, headerRightComponent]);

  /**
   * Refresh handler
   */
  const onRefresh = async () => {
    setRefreshing(true);
    await ordersData.fetchOrders();
    setRefreshing(false);
  };

  /**
   * Refresh orders when screen is focused
   */
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      AsyncStorage.removeItem('cart').catch((error) => {
        console.warn('Failed to clear cart on dashboard focus:', error);
      });
      cartService.resetGroupState();
      ordersData.fetchOrders();
    });
    return unsubscribe;
  }, [navigation]);

  // ===== Render Functions =====

  const renderTableStatusBadge = () => {
    if (activeTab !== DELIVERY_TYPE.DINE_IN) return null;

    const statusBadges = [
      {
        label: t('available'),
        count: tableStats.availableTablesCount,
        bgColor: colors.success + '20',
        borderColor: colors.success,
        textColor: colors.success,
      },
      {
        label: t('booked'),
        count: tableStats.bookedTablesCount,
        bgColor: colors.error + '20',
        borderColor: colors.error,
        textColor: colors.error,
      },
      {
        label: t('semiPaid'),
        count: tableStats.semiPaidTablesCount,
        bgColor: colors.warning + '20',
        borderColor: colors.warning,
        textColor: colors.warning,
      },
    ];

    return (
      <View className="flex-row gap-2 mt-3">
        {statusBadges.map((badge) => (
          <View
            key={badge.label}
            className="flex-1 px-3 py-2 rounded-lg border"
            style={{
              backgroundColor: badge.bgColor,
              borderColor: badge.borderColor,
              borderWidth: 1,
            }}
          >
            <Text
              style={{
                color: badge.textColor,
                fontSize: 14,
                fontWeight: '700',
              }}
            >
              {badge.label}
            </Text>
            <Text
              style={{
                color: badge.textColor,
                fontSize: 20,
                fontWeight: '800',
                marginTop: 6,
              }}
            >
              {badge.count}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderTableAreas = () => {
    if (activeTab !== DELIVERY_TYPE.DINE_IN) return null;

    if (!tableAreaList.length) {
      return (
        <View
          style={{
            marginTop: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {t('tableAreasNotAvailable')}
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: 12 }}
        contentContainerStyle={{ alignItems: 'center', paddingVertical: 4 }}
      >
        {tableAreaList.map((area: any) => {
          const isActive = selectedTableArea?.id === area?.id;
          const bookedCount = getAreaBookedCount(area);

          return (
            <TouchableOpacity
              key={`${area?.id || area?.name}`}
              onPress={() => setSelectedTableArea(area)}
              style={{
                marginRight: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 14,
                borderWidth: 1,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isActive ? colors.primary + '18' : colors.surface,
                borderColor: isActive ? colors.primary : colors.border,
              }}
            >
              <Text
                style={{
                  color: isActive ? colors.primary : colors.text,
                  fontSize: 12,
                  fontWeight: '700',
                  maxWidth: 140,
                }}
                numberOfLines={1}
              >
                {area?.name || t('area')}
              </Text>
              {bookedCount > 0 && (
                <View
                  style={{
                    marginLeft: 8,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 999,
                    backgroundColor: isActive
                      ? colors.primary
                      : colors.surfaceHover,
                    borderWidth: 1,
                    borderColor: isActive ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    style={{
                      color: isActive ? colors.textInverse : colors.textSecondary,
                      fontSize: 10,
                      fontWeight: '700',
                    }}
                  >
                    {bookedCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  };


  const renderEmptyState = () => (
    <View className="flex-1 justify-center items-center py-8">
      <Text className="text-gray-400 text-center">
        {activeTab === DELIVERY_TYPE.DINE_IN && t('noDineInOrders')}
        {activeTab === DELIVERY_TYPE.DELIVERY && t('noDeliveryOrders')}
        {activeTab === DELIVERY_TYPE.PICKUP && t('noPickupOrders')}
      </Text>
    </View>
  );

  const renderDineInTables = () => {
    if (tableNumbers.length === 0) {
      return renderEmptyState();
    }

    const tables = tableNumbers.map((tableNo) => {
      const order = ordersData.dineInTables.find(
        (o) => Number(o.orderDetails?.tableNo) === tableNo
      );
      let status = 'available';

      if (order) {
        const total = Number(order.orderDetails?.orderTotal ?? 0) || 0;
        const paymentDetails = Array.isArray((order as any).orderDetails?.orderPaymentDetails)
          ? (order as any).orderDetails.orderPaymentDetails
          : [];
        const paidSum = paymentDetails.reduce(
          (sum: number, payment: any) => sum + (Number(payment?.paymentTotal) || 0),
          0
        );
        const isSplitOrder = (order as any).orderDetails?.isSplitOrder === true;
        const isPartialPaid = paidSum > 0 && paidSum < total;

        status = isSplitOrder || isPartialPaid ? 'semi-paid' : 'booked';
      }

      return { tableNo, status, order };
    });

    return (
      <View className="flex-row flex-wrap justify-between mt-4">
        {tables.map((table) => (
          <TouchableOpacity
            key={table.tableNo}
            onPress={() => {
              if (table.order) {
                if (isOrderLocked(table.order)) {
                  const label = getOrderDisplayLabel(table.order);
                  showToast('error', `${label} ${t('handledOnAnotherDevice')} ${t('pleaseTryLater')}`);
                  return;
                }
                lockOrder(table.order);
                navigation.navigate('OrderDetails', { order: table.order });
                return;
              }

              if (isTableLocked(table.tableNo)) {
                showToast('error', `${t('table')} ${table.tableNo} ${t('selectedOnAnotherDevice')}`);
                return;
              }

              const tableArea = resolveTableAreaForTable(table.tableNo);
              lockTable(table.tableNo);

              navigation.navigate('Menu', {
                tableNo: table.tableNo,
                deliveryType: DELIVERY_TYPE.DINE_IN,
                existingOrder: table.order,
                tableArea,
              });
            }}
            className="rounded-lg p-3 items-center justify-center border-2 mb-2"
            style={{
              width: '32%',
              aspectRatio: 1,
              borderColor:
                table.status === 'available'
                  ? colors.success
                  : table.status === 'booked'
                    ? colors.error
                    : colors.warning,
              backgroundColor:
                table.status === 'available'
                  ? colors.success + '10'
                  : table.status === 'booked'
                    ? colors.error + '10'
                    : colors.warning + '10',
            }}
          >
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 14,
                marginBottom: 6,
              }}
            >
              {t('table')}
            </Text>
            <Text
              style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}
            >
              {table.tableNo}
            </Text>
            {table.order && (
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 14,
                  marginTop: 6,
                }}
              >
                {formatCurrency(Number(table.order.orderDetails?.orderTotal ?? 0))}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderOrderItem = ({ item: order }: { item: Order }) => (
    (() => {
      const orderDetails = (order as any)?.orderDetails || {};
      const serviceTimeLabel = formatOrderServiceTime(orderDetails?.pickupDateTime);
      const familyName = String(orderDetails?.familyName || '').trim();

      return (
        <TouchableOpacity
          onPress={() => {
            if (isOrderLocked(order)) {
              const label = getOrderDisplayLabel(order);
              showToast('error', `${label} is being handled on another device. Please try later.`);
              return;
            }
            lockOrder(order);
            navigation.navigate('OrderDetails', { order });
          }}
          className="rounded-lg p-4 mb-3 border"
          style={{ backgroundColor: colors.surface, borderColor: colors.border }}
        >
          <View className="flex-row justify-between items-start">
            <View className="flex-1">
              <Text className="font-semibold text-base" style={{ color: colors.text }}>
                {order.customOrderId || order.id || order._id}
              </Text>
              <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                {new Date(order.createdAt || '').toLocaleTimeString()}
              </Text>
            </View>
            <View
              className="px-2 py-1 rounded-full"
              style={{ backgroundColor: colors.surfaceHover }}
            >
              <Text
                className="text-xs font-semibold"
                style={{ color: colors.textSecondary }}
              >
                {getOrderStatusLabel(order, language)}
              </Text>
            </View>
          </View>

          {serviceTimeLabel ? (
            <Text className="text-xs mt-3" style={{ color: colors.textSecondary }}>
              {orderDetails?.orderDeliveryTypeId === DELIVERY_TYPE.DELIVERY ? t('deliveryTime') : t('pickupTime')}: {' '}
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {serviceTimeLabel}
              </Text>
            </Text>
          ) : null}

          {orderDetails?.orderDeliveryTypeId === DELIVERY_TYPE.PICKUP && familyName ? (
            <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>
              {t('familyName')}: {' '}
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {familyName}
              </Text>
            </Text>
          ) : null}

          <View className="mt-3 flex-row justify-between items-center">
            <Text className="text-sm" style={{ color: colors.textSecondary }}>
              {t('totalAmount')}
            </Text>
            <Text
              style={{ color: colors.success, fontSize: 18, fontWeight: '700' }}
            >
              {formatCurrency(Number(order.orderDetails?.orderTotal ?? 0))}
            </Text>
          </View>
        </TouchableOpacity>
      );
    })()
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case DELIVERY_TYPE.DINE_IN:
        return renderDineInTables();
      case DELIVERY_TYPE.DELIVERY:
        return ordersData.deliveryOrders.length > 0 ? (
          <FlatList
            data={ordersData.deliveryOrders}
            renderItem={renderOrderItem}
            keyExtractor={(item) => item._id}
            scrollEnabled={false}
            contentContainerStyle={{ marginTop: 16 }}
          />
        ) : (
          renderEmptyState()
        );
      case DELIVERY_TYPE.PICKUP:
        return ordersData.pickupOrders.length > 0 ? (
          <FlatList
            data={ordersData.pickupOrders}
            renderItem={renderOrderItem}
            keyExtractor={(item) => item._id}
            scrollEnabled={false}
            contentContainerStyle={{ marginTop: 16 }}
          />
        ) : (
          renderEmptyState()
        );
      default:
        return null;
    }
  };

  if (ordersData.loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="flex-1 px-4 py-4">
          {/* Tab Navigation */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setActiveTab(DELIVERY_TYPE.DINE_IN)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 12,
                alignItems: 'center',
                borderWidth: 1,
                borderColor:
                  activeTab === DELIVERY_TYPE.DINE_IN
                    ? colors.primary
                    : colors.border,
                backgroundColor:
                  activeTab === DELIVERY_TYPE.DINE_IN
                    ? colors.primary
                    : colors.surface,
              }}
            >
              <Text
                style={{
                  color:
                    activeTab === DELIVERY_TYPE.DINE_IN
                      ? colors.textInverse
                      : colors.text,
                  fontWeight: '700',
                }}
              >
                {t('tables')}
              </Text>
              <Text
                style={{
                  color:
                    activeTab === DELIVERY_TYPE.DINE_IN
                      ? colors.textInverse
                      : colors.textSecondary,
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                {tableStats.availableTablesCount}
              </Text>
            </TouchableOpacity>

            {settingsData.settings?.enableDelivery && (
              <TouchableOpacity
                onPress={() => setActiveTab(DELIVERY_TYPE.DELIVERY)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 12,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor:
                    activeTab === DELIVERY_TYPE.DELIVERY
                      ? colors.primary
                      : colors.border,
                  backgroundColor:
                    activeTab === DELIVERY_TYPE.DELIVERY
                      ? colors.primary
                      : colors.surface,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialCommunityIcons
                    name="truck-delivery"
                    size={16}
                    color={
                      activeTab === DELIVERY_TYPE.DELIVERY
                        ? colors.textInverse
                        : colors.text
                    }
                  />
                  <Text
                    style={{
                      color:
                        activeTab === DELIVERY_TYPE.DELIVERY
                          ? colors.textInverse
                          : colors.text,
                      fontWeight: '700',
                    }}
                  >
                    {t('delivery')}
                  </Text>
                </View>
                <Text
                  style={{
                    color:
                      activeTab === DELIVERY_TYPE.DELIVERY
                        ? colors.textInverse
                        : colors.textSecondary,
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  {ordersData.deliveryOrders.length}
                </Text>
              </TouchableOpacity>
            )}

            {settingsData.settings?.enablePickup && (
              <TouchableOpacity
                onPress={() => setActiveTab(DELIVERY_TYPE.PICKUP)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 12,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor:
                    activeTab === DELIVERY_TYPE.PICKUP
                      ? colors.primary
                      : colors.border,
                  backgroundColor:
                    activeTab === DELIVERY_TYPE.PICKUP
                      ? colors.primary
                      : colors.surface,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialIcons
                    name="storefront"
                    size={16}
                    color={
                      activeTab === DELIVERY_TYPE.PICKUP
                        ? colors.textInverse
                        : colors.text
                    }
                  />
                  <Text
                    style={{
                      color:
                        activeTab === DELIVERY_TYPE.PICKUP
                          ? colors.textInverse
                          : colors.text,
                      fontWeight: '700',
                    }}
                  >
                    {t('pickup')}
                  </Text>
                </View>
                <Text
                  style={{
                    color:
                      activeTab === DELIVERY_TYPE.PICKUP
                        ? colors.textInverse
                        : colors.textSecondary,
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  {ordersData.pickupOrders.length}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Status badges for dine-in */}
          {/* {renderTableStatusBadge()} */}

          {/* Table area filters for dine-in */}
          {renderTableAreas()}

          {/* Tab content */}
          {renderTabContent()}
        </View>
      </ScrollView>

      <OrderTimeModal
        visible={serviceTimeModalVisible}
        deliveryType={pendingServiceType ?? activeTab}
        initialValue={null}
        onClose={handleServiceFlowClose}
        onSave={handleServiceFlowSave}
      />
    </SafeAreaView>
  );
}



