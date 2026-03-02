import React, { useState, useLayoutEffect, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeProvider';
import { SERVER_BASE_URL } from '../config/urls';
import { getOrderStatusLabel } from '../utils/orderUtils';

// Hooks
import { useOrdersData, DELIVERY_TYPE, Order } from '../hooks/useOrdersData';
import { useSettings } from '../hooks/useSettings';
import { useTableStatistics } from '../hooks/useTableStatistics';

interface DashboardScreenProps {
  navigation: any;
}

/**
 * Refactored DashboardScreen with extracted logic
 * Responsibilities: Navigation, state orchestration, and layout
 */
export default function DashboardScreen({ navigation }: DashboardScreenProps) {
  const { colors } = useTheme();

  // Use custom hooks for complex logic
  const ordersData = useOrdersData();
  const settingsData = useSettings();
  const tableStats = useTableStatistics(ordersData.dineInTables, settingsData.settings);

  // Local state
  const [activeTab, setActiveTab] = useState<number>(DELIVERY_TYPE.DINE_IN);
  const [refreshing, setRefreshing] = useState(false);
  const [logoSource, setLogoSource] = useState<any>(null);

  /**
   * Get company initials for placeholder logo
   */
  const getCompanyInitials = () => {
    const companyName = (settingsData.settings as any)?.companyName || 'POS';
    const parts = companyName.split(' ').filter(Boolean);
    if (parts.length === 0) return 'POS';
    if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  /**
   * Load and set logo from user data - only on mount
   */
  useEffect(() => {
    const loadUserData = async () => {
      const userData = await AsyncStorage.getItem('userData');
      if (userData) {
        const user = JSON.parse(userData);
        setLogoSource(
          user?.company?.imagePath
            ? { uri: `${SERVER_BASE_URL}${user.company.imagePath}` }
            : null
        );
      }
    };
    loadUserData();
  }, []);

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
          style={{ width: 36, height: 36, borderRadius: 18, overflow: 'hidden' }}
        >
          {logoSource ? (
            <Image
              source={logoSource}
              style={{ width: 36, height: 36 }}
              resizeMode="cover"
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
                {getCompanyInitials()}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    ),
    [colors, logoSource, navigation]
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
            onPress={() =>
              navigation.navigate('Menu', {
                tableNo: null,
                deliveryType: activeTab,
              })
            }
            style={{ padding: 8 }}
          >
            <MaterialIcons name="add-circle-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    ),
    [colors, activeTab, navigation]
  );

  /**
   * Set header options - only update when necessary
   */
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: 'Dashboard',
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
      ordersData.fetchOrders();
    });
    return unsubscribe;
  }, [navigation]);

  // ===== Render Functions =====

  const renderTableStatusBadge = () => {
    if (activeTab !== DELIVERY_TYPE.DINE_IN) return null;

    const statusBadges = [
      {
        label: 'Available',
        count: tableStats.availableTablesCount,
        bgColor: colors.success + '20',
        borderColor: colors.success,
        textColor: colors.success,
      },
      {
        label: 'Booked',
        count: tableStats.bookedTablesCount,
        bgColor: colors.error + '20',
        borderColor: colors.error,
        textColor: colors.error,
      },
      {
        label: 'Semi-Paid',
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

  const renderEmptyState = () => (
    <View className="flex-1 justify-center items-center py-8">
      <Text className="text-gray-400 text-center">
        {activeTab === DELIVERY_TYPE.DINE_IN && 'No dine-in orders'}
        {activeTab === DELIVERY_TYPE.DELIVERY && 'No delivery orders'}
        {activeTab === DELIVERY_TYPE.PICKUP && 'No pickup orders'}
      </Text>
    </View>
  );

  const renderDineInTables = () => {
    if (!settingsData.settings?.totalTables) {
      return renderEmptyState();
    }

    const tables = Array.from(
      { length: settingsData.settings.totalTables },
      (_, i) => i + 1
    ).map((tableNo) => {
      const order = ordersData.dineInTables.find(
        (o) => o.orderDetails?.tableNo === tableNo
      );
      let status = 'available';

      if (order) {
        status = order.orderDetails?.isPaid === 1 ? 'semi-paid' : 'booked';
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
                navigation.navigate('OrderDetails', { order: table.order });
                return;
              }

              navigation.navigate('Menu', {
                tableNo: table.tableNo,
                deliveryType: DELIVERY_TYPE.DINE_IN,
                existingOrder: table.order,
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
              Table
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
                ₹{table.order.orderDetails?.orderTotal?.toFixed(2)}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderOrderItem = ({ item: order }: { item: Order }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('OrderDetails', { order })}
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
            {getOrderStatusLabel(order)}
          </Text>
        </View>
      </View>
      <View className="mt-3 flex-row justify-between items-center">
        <Text className="text-sm" style={{ color: colors.textSecondary }}>
          Total Amount
        </Text>
        <Text
          style={{ color: colors.success, fontSize: 18, fontWeight: '700' }}
        >
          ₹{order.orderDetails?.orderTotal?.toFixed(2)}
        </Text>
      </View>
    </TouchableOpacity>
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
              Tables
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
                  Delivery
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
                  Pickup
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
        {renderTableStatusBadge()}

        {/* Tab content */}
        {renderTabContent()}
      </View>
    </ScrollView>
  );
}
