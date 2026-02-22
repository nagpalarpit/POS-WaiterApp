import React, { useState, useEffect, useLayoutEffect } from 'react';
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
import { useTheme } from '../theme/ThemeProvider';
import localDatabase from '../services/localDatabase';
import serverConnection from '../services/serverConnection';
import { getOrderStatusLabel } from '../utils/orderUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVER_BASE_URL } from '../config/urls';

// Order delivery types
const DELIVERY_TYPE = {
  DINE_IN: 0,
  DELIVERY: 1,
  PICKUP: 2,
};

// Order statuses are defined in src/utils/orderUtils.ts

interface Order {
  _id: string;
  id?: string;
  customOrderId?: string;
  orderStatusId?: number;
  orderDetails: {
    orderDeliveryTypeId: number;
    tableNo?: number;
    orderStatusId?: number;
    orderTotal: number;
    isPaid?: number;
  };
  createdAt?: string;
}

interface Settings {
  totalTables?: number;
  enableDelivery?: boolean;
  enablePickup?: boolean;
  companyId?: string;
  isKiosk?: boolean;
}

interface DashboardScreenProps {
  navigation: any;
}

// order status label helper moved to utils/orderUtils

export default function DashboardScreen({ navigation }: DashboardScreenProps) {
  const { colors } = useTheme();
  // sidebar is provided by Drawer navigator; no local sidebar state

  // State management
  const [activeTab, setActiveTab] = useState<number>(DELIVERY_TYPE.DINE_IN);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logoSource, setLogoSource] = useState<any>(null); // for company logo in header

  // Orders state
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [dineInTables, setDineInTables] = useState<any[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<Order[]>([]);
  const [pickupOrders, setPickupOrders] = useState<Order[]>([]);

  // Counters
  const [availableTablesCount, setAvailableTablesCount] = useState(0);
  const [bookedTablesCount, setBookedTablesCount] = useState(0);
  const [semiPaidTablesCount, setSemiPaidTablesCount] = useState(0);

  // company initials for placeholder logo
  const getCompanyInitials = () => {
    const companyName = (settings as any)?.companyName || 'POS';
    const parts = companyName.split(' ').filter(Boolean);
    if (parts.length === 0) return 'POS';
    if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

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
  }, [])

  /**
   * Load settings from AsyncStorage or fetch from local server
   */
  const loadSettings = async () => {
    try {
      // Try to fetch fresh settings from local server
      if (serverConnection.isConnected()) {
        await localDatabase.select('settings', { where: {} });
      }

      // For now, use default settings
      const defaultSettings: Settings = {
        totalTables: 20,
        enableDelivery: true,
        enablePickup: true,
      };
      setSettings(defaultSettings);
      return defaultSettings;
    } catch (error) {
      console.log('Error loading settings:', error);
      // Use defaults
      const defaultSettings: Settings = {
        totalTables: 20,
        enableDelivery: true,
        enablePickup: true,
      };
      setSettings(defaultSettings);
      return defaultSettings;
    }
  };

  /**
   * Fetch all orders from local database
   */
  const fetchOrders = async () => {
    try {
      setLoading(true);

      // Fetch all orders from 'order' collection
      const orders = await localDatabase.select('order', { where: {} });

      if (orders && Array.isArray(orders)) {
        setAllOrders(orders);

        // Separate orders by type
        const dineIn = orders.filter(
          (o: Order) => o.orderDetails?.orderDeliveryTypeId === DELIVERY_TYPE.DINE_IN
        );
        const delivery = orders.filter(
          (o: Order) => o.orderDetails?.orderDeliveryTypeId === DELIVERY_TYPE.DELIVERY
        );
        const pickup = orders.filter(
          (o: Order) => o.orderDetails?.orderDeliveryTypeId === DELIVERY_TYPE.PICKUP
        );

        setDineInTables(dineIn);
        setDeliveryOrders(delivery);
        setPickupOrders(pickup);

        // Calculate table statuses
        calculateTableStatuses(dineIn);
      }
    } catch (error) {
      console.log('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Calculate table statuses: available, booked, semi-paid
   */
  const calculateTableStatuses = (dineInOrders: Order[]) => {
    const settingsData = settings || { totalTables: 20 };
    const totalTables = settingsData.totalTables || 20;
    const occupiedTableNumbers = new Set(
      dineInOrders.map((o) => o.orderDetails?.tableNo).filter(Boolean)
    );

    // Booked: tables with active orders
    // Semi-paid: tables with partially paid orders (payment details sum < order total)
    // Available: remaining tables
    let booked = 0;
    let semiPaid = 0;

    dineInOrders.forEach((order) => {
      const total = Number(order.orderDetails?.orderTotal ?? 0) || 0;
      const paymentDetails = Array.isArray((order as any).orderDetails?.orderPaymentDetails)
        ? (order as any).orderDetails.orderPaymentDetails
        : [];

      const paidSum = paymentDetails.reduce((s: number, p: any) => s + (Number(p.paymentTotal) || 0), 0);

      if (paidSum > 0 && paidSum < total) {
        semiPaid++;
      } else {
        booked++;
      }
    });

    const available = totalTables - occupiedTableNumbers.size;

    setAvailableTablesCount(Math.max(0, available));
    setBookedTablesCount(Math.max(0, booked));
    setSemiPaidTablesCount(Math.max(0, semiPaid));
  };

  /**
   * Initial load
   */
  useEffect(() => {
    const initDashboard = async () => {
      await loadSettings();
      await fetchOrders();
    };

    initDashboard();
  }, []);

  // no local sidebar animation — use Drawer navigator

  // use native header (react-navigation) to show logo/search/+ action
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: 'Dashboard',
      headerStyle: { backgroundColor: colors.background },
      headerTintColor: colors.text,
      headerTitleStyle: { fontWeight: '700' },
      headerLeft: () => (
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
              <Image source={logoSource} style={{ width: 36, height: 36 }} resizeMode="cover" />
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
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '800' }}>
                  {getCompanyInitials()}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 100 }}>
          <TouchableOpacity onPress={() => { /* search placeholder */ }} style={{ padding: 8, borderRadius: 100 }}>
            <MaterialIcons name="search" size={20} color={colors.text} />
          </TouchableOpacity>

          {activeTab !== DELIVERY_TYPE.DINE_IN && (
            <TouchableOpacity onPress={() => navigation.navigate('Menu', { tableNo: null, deliveryType: activeTab })} style={{ padding: 8 }}>
              <MaterialIcons name="add-circle-outline" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      ),
    });
  }, [navigation, colors, activeTab]);

  // Refresh orders when screen is focused (so edits / mark paid return refreshed data)
  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchOrders();
    });
    return unsubscribe;
  }, [navigation]);

  /**
   * Refresh handler
   */
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  };

  /**
   * Render table status badge
   */
  const renderTableStatusBadge = () => {
    const statusBadges = [
      {
        label: 'Available',
        count: availableTablesCount,
        bgColor: colors.success + '20',
        borderColor: colors.success,
        textColor: colors.success,
      },
      {
        label: 'Booked',
        count: bookedTablesCount,
        bgColor: colors.error + '20',
        borderColor: colors.error,
        textColor: colors.error,
      },
      {
        label: 'Semi-Paid',
        count: semiPaidTablesCount,
        bgColor: colors.warning + '20',
        borderColor: colors.warning,
        textColor: colors.warning,
      },
    ];

    if (activeTab === DELIVERY_TYPE.DINE_IN) {
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
                style={{ color: badge.textColor, fontSize: 14, fontWeight: '700' }}
              >
                {badge.label}
              </Text>
              <Text
                style={{ color: badge.textColor, fontSize: 20, fontWeight: '800', marginTop: 6 }}
              >
                {badge.count}
              </Text>
            </View>
          ))}
        </View>
      );
    }
    return null;
  };

  /**
   * Render empty state
   */
  const renderEmptyState = () => (
    <View className="flex-1 justify-center items-center py-8">
      <Text className="text-gray-400 text-center">
        {activeTab === DELIVERY_TYPE.DINE_IN && 'No dine-in orders'}
        {activeTab === DELIVERY_TYPE.DELIVERY && 'No delivery orders'}
        {activeTab === DELIVERY_TYPE.PICKUP && 'No pickup orders'}
      </Text>
    </View>
  );

  /**
   * Render dine-in tables section
   */
  const renderDineInTables = () => {
    if (!settings?.totalTables) {
      return renderEmptyState();
    }

    const tables = Array.from(
      { length: settings.totalTables },
      (_, i) => i + 1
    ).map((tableNo) => {
      const order = dineInTables.find((o) => o.orderDetails?.tableNo === tableNo);
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
                // Navigate to OrderDetails screen for booked / semi-paid tables
                navigation.navigate('OrderDetails', { order: table.order });
                return;
              }

              // Navigate to menu for available tables
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
            <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 6 }}>Table</Text>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>
              {table.tableNo}
            </Text>
            {table.order && (
              <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 6 }}>
                ₹{table.order.orderDetails?.orderTotal?.toFixed(2)}
              </Text>
            )}
          </TouchableOpacity>
        ))}

        {/* Order Details Modal */}
        {/* Order details now handled via a dedicated screen */}
      </View>
    );
  };

  /**
   * Render order list item for delivery/pickup
   */
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
          <Text className="text-xs font-semibold" style={{ color: colors.textSecondary }}>
            {getOrderStatusLabel(order)}
          </Text>
        </View>
      </View>
      <View className="mt-3 flex-row justify-between items-center">
        <Text className="text-sm" style={{ color: colors.textSecondary }}>
          Total Amount
        </Text>
        <Text style={{ color: colors.success, fontSize: 18, fontWeight: '700' }}>
          ₹{order.orderDetails?.orderTotal?.toFixed(2)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  /**
   * Render content based on active tab
   */
  const renderTabContent = () => {
    switch (activeTab) {
      case DELIVERY_TYPE.DINE_IN:
        return renderDineInTables();
      case DELIVERY_TYPE.DELIVERY:
        return deliveryOrders.length > 0 ? (
          <FlatList
            data={deliveryOrders}
            renderItem={renderOrderItem}
            keyExtractor={(item) => item._id}
            scrollEnabled={false}
            contentContainerStyle={{ marginTop: 16 }}
          />
        ) : (
          renderEmptyState()
        );
      case DELIVERY_TYPE.PICKUP:
        return pickupOrders.length > 0 ? (
          <FlatList
            data={pickupOrders}
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

  if (loading) {
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
        {/* Tab Navigation — professional pill style with icons */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={() => setActiveTab(DELIVERY_TYPE.DINE_IN)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: activeTab === DELIVERY_TYPE.DINE_IN ? colors.primary : colors.border, backgroundColor: activeTab === DELIVERY_TYPE.DINE_IN ? colors.primary : colors.surface }}
          >
            <Text style={{ color: activeTab === DELIVERY_TYPE.DINE_IN ? colors.textInverse : colors.text, fontWeight: '700' }}>Tables</Text>
            <Text style={{ color: activeTab === DELIVERY_TYPE.DINE_IN ? colors.textInverse : colors.textSecondary, fontSize: 12, marginTop: 4 }}>{availableTablesCount}</Text>
          </TouchableOpacity>

          {settings?.enableDelivery && (
            <TouchableOpacity
              onPress={() => setActiveTab(DELIVERY_TYPE.DELIVERY)}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: activeTab === DELIVERY_TYPE.DELIVERY ? colors.primary : colors.border, backgroundColor: activeTab === DELIVERY_TYPE.DELIVERY ? colors.primary : colors.surface }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="truck-delivery" size={16} color={activeTab === DELIVERY_TYPE.DELIVERY ? colors.textInverse : colors.text} />
                <Text style={{ color: activeTab === DELIVERY_TYPE.DELIVERY ? colors.textInverse : colors.text, fontWeight: '700' }}>Delivery</Text>
              </View>
              <Text style={{ color: activeTab === DELIVERY_TYPE.DELIVERY ? colors.textInverse : colors.textSecondary, fontSize: 12, marginTop: 4 }}>{deliveryOrders.length}</Text>
            </TouchableOpacity>
          )}

          {settings?.enablePickup && (
            <TouchableOpacity
              onPress={() => setActiveTab(DELIVERY_TYPE.PICKUP)}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: activeTab === DELIVERY_TYPE.PICKUP ? colors.primary : colors.border, backgroundColor: activeTab === DELIVERY_TYPE.PICKUP ? colors.primary : colors.surface }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="storefront" size={16} color={activeTab === DELIVERY_TYPE.PICKUP ? colors.textInverse : colors.text} />
                <Text style={{ color: activeTab === DELIVERY_TYPE.PICKUP ? colors.textInverse : colors.text, fontWeight: '700' }}>Pickup</Text>
              </View>
              <Text style={{ color: activeTab === DELIVERY_TYPE.PICKUP ? colors.textInverse : colors.textSecondary, fontSize: 12, marginTop: 4 }}>{pickupOrders.length}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick create moved to native header + action button */}

        {/* Status badges for dine-in */}
        {renderTableStatusBadge()}

        {/* Tab content */}
        {renderTabContent()}
      </View>
    </ScrollView>
  );
}
