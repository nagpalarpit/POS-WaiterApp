import React, {
  useState,
  useLayoutEffect,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Easing,
  Keyboard,
  TextInput,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { useTheme } from '../theme/ThemeProvider';
import { useTranslation } from '../contexts/LanguageContext';
import { SERVER_BASE_URL } from '../config/urls';
import { getOrderStatusLabel, ORDER_STATUS } from '../utils/orderUtils';
import { formatCurrency } from '../utils/currency';
import { formatOrderServiceTime } from '../utils/orderServiceDisplay';
import {
  emitOrderSync,
  isOrderLocked,
  isTableLocked,
  lockOrder,
  lockTable,
  unlockOrder,
} from '../services/orderSyncService';
import { useToast } from '../components/ToastProvider';
import cartService from '../services/cartService';
import OrderTimeModal from '../components/OrderTimeModal';
import AppBottomSheet from '../components/AppBottomSheet';
import orderService from '../services/orderService';
import {
  getCustomerDisplayName,
  resolveOrderCustomer,
} from '../utils/customerData';

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
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [moveSheetVisible, setMoveSheetVisible] = useState(false);
  const [movingOrder, setMovingOrder] = useState<Order | null>(null);
  const [moveTargetTableNo, setMoveTargetTableNo] = useState<number | null>(null);
  const [isMoveSubmitting, setIsMoveSubmitting] = useState(false);
  const searchAnimation = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef<TextInput | null>(null);

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

  const hasConfiguredTableAreas = tableAreaList.length > 0;

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
      return;
    }

    const latestSelectedArea = tableAreaList.find(
      (area: any) => area?.id === selectedTableArea?.id
    );

    if (latestSelectedArea && latestSelectedArea !== selectedTableArea) {
      setSelectedTableArea(latestSelectedArea);
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

  const dineInOrderByTable = useMemo(() => {
    const tableMap = new Map<number, Order>();

    ordersData.dineInTables.forEach((order) => {
      const tableNo = Number(order?.orderDetails?.tableNo);
      if (Number.isFinite(tableNo) && !tableMap.has(tableNo)) {
        tableMap.set(tableNo, order);
      }
    });

    return tableMap;
  }, [ordersData.dineInTables]);

  const tableNumbers = useMemo(() => {
    if (!hasConfiguredTableAreas) {
      return [];
    }

    if (selectedTableArea) {
      return selectedAreaTables;
    }

    return allAreaTables;
  }, [allAreaTables, hasConfiguredTableAreas, selectedAreaTables, selectedTableArea]);

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

  const getAreaNameForTable = (tableNo: number) => {
    const area = resolveTableAreaForTable(tableNo);
    return String(area?.name || '').trim();
  };

  const allMoveTableNumbers = useMemo(() => {
    if (allAreaTables.length > 0) {
      return allAreaTables;
    }

    return tableNumbers;
  }, [allAreaTables, tableNumbers]);

  const resetMoveSheet = useCallback(() => {
    setMoveSheetVisible(false);
    setMovingOrder(null);
    setMoveTargetTableNo(null);
    setIsMoveSubmitting(false);
  }, []);

  const availableMoveTables = useMemo(() => {
    if (!movingOrder) {
      return [];
    }

    const currentTableNo = Number(movingOrder?.orderDetails?.tableNo);
    const bookedTables = new Set(
      ordersData.dineInTables
        .map((order) => Number(order?.orderDetails?.tableNo))
        .filter((tableNo) => Number.isFinite(tableNo) && tableNo !== currentTableNo)
    );

    return allMoveTableNumbers
      .filter((tableNo) => Number.isFinite(tableNo) && tableNo !== currentTableNo)
      .filter((tableNo) => !bookedTables.has(tableNo))
      .filter((tableNo) => !isTableLocked(tableNo))
      .map((tableNo) => ({
        tableNo,
        areaName: getAreaNameForTable(tableNo),
      }));
  }, [allMoveTableNumbers, movingOrder, ordersData.dineInTables]);

  const handleMoveSheetClose = useCallback(() => {
    if (movingOrder && !isMoveSubmitting) {
      void unlockOrder(movingOrder);
    }
    resetMoveSheet();
  }, [isMoveSubmitting, movingOrder, resetMoveSheet]);

  const handleMoveTablePress = useCallback(
    (order: Order, event?: any) => {
      event?.stopPropagation?.();

      if (!order) {
        return;
      }

      if (isOrderLocked(order)) {
        const label = getOrderDisplayLabel(order);
        showToast('error', `${label} ${t('handledOnAnotherDevice')} ${t('pleaseTryLater')}`);
        return;
      }

      void lockOrder(order);
      setMovingOrder(order);
      setMoveTargetTableNo(null);
      setMoveSheetVisible(true);
    },
    [getOrderDisplayLabel, showToast, t]
  );

  const handleConfirmMoveTable = useCallback(async () => {
    if (!movingOrder) {
      return;
    }

    if (!moveTargetTableNo) {
      showToast('error', t('selectNewTable'));
      return;
    }

    const currentTableNo = Number(movingOrder?.orderDetails?.tableNo);
    const orderNumber =
      movingOrder?.customOrderId ||
      (movingOrder as any)?.orderDetails?.customOrderId ||
      movingOrder?._id ||
      movingOrder?.id;

    const destinationOccupied = ordersData.dineInTables.some((order) => {
      const tableNo = Number(order?.orderDetails?.tableNo);
      const compareOrderNumber =
        order?.customOrderId ||
        (order as any)?.orderDetails?.customOrderId ||
        order?._id ||
        order?.id;

      return tableNo === moveTargetTableNo && `${compareOrderNumber}` !== `${orderNumber}`;
    });

    if (destinationOccupied || isTableLocked(moveTargetTableNo)) {
      showToast('error', t('unableToMoveTable'));
      return;
    }

    const orderId =
      movingOrder?._id ||
      movingOrder?.id ||
      (movingOrder as any)?.orderId ||
      (movingOrder as any)?.orderDetails?.localOrderId;

    if (!orderId) {
      showToast('error', t('unableToMoveTable'));
      return;
    }

    try {
      setIsMoveSubmitting(true);

      const nextTableArea = resolveTableAreaForTable(moveTargetTableNo);
      const updatedAt = new Date().toISOString();
      const updatedOrderDetails = {
        ...(movingOrder.orderDetails || {}),
        tableNo: moveTargetTableNo,
        tableArea: nextTableArea,
        updatedAt,
      };

      await orderService.updateOrder(`${orderId}`, {
        orderDetails: updatedOrderDetails,
        updatedAt,
      });

      await unlockOrder(movingOrder);
      await emitOrderSync(
        'ORDER_UPDATED',
        {
          tableNo: moveTargetTableNo,
          tableArea: nextTableArea,
          orderNumber,
        },
        {
          orderInfo: {
            ...updatedOrderDetails,
            orderNumber,
          },
          tableMoved: true,
          previousTableNo: currentTableNo,
          newTableNo: moveTargetTableNo,
        }
      );

      await ordersData.fetchOrders(false);
      showToast('success', t('tableMovedSuccessfully'));
      resetMoveSheet();
    } catch (error) {
      console.error('Move table failed:', error);
      showToast('error', t('unableToMoveTable'));
      setIsMoveSubmitting(false);
    }
  }, [
    moveTargetTableNo,
    movingOrder,
    ordersData,
    resetMoveSheet,
    showToast,
    t,
  ]);

  const normalizeSearchValue = (value: unknown) =>
    String(value ?? '').trim().toLowerCase();

  const isPlacedOrder = (order?: Order | any) => {
    const rootStatusId = Number(order?.orderStatusId);
    const detailStatusId = Number(order?.orderDetails?.orderStatusId);

    return (
      rootStatusId === ORDER_STATUS.PENDING ||
      detailStatusId === ORDER_STATUS.PENDING
    );
  };

  const matchesCustomOrderIdSearch = (order: Order | any, query: string) => {
    if (!query || !order || !isPlacedOrder(order)) {
      return false;
    }

    const customOrderId = normalizeSearchValue(
      order?.customOrderId ?? order?.orderDetails?.customOrderId
    );

    return customOrderId.includes(query);
  };

  const formatOrderCreatedAt = (value?: string | null) => {
    if (!value) {
      return '';
    }

    const normalized = String(value).replace(' ', 'T');
    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const pad = (part: number) => String(part).padStart(2, '0');

    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };

  const normalizedSearchTerm = useMemo(
    () => normalizeSearchValue(debouncedSearchTerm),
    [debouncedSearchTerm]
  );

  const hasActiveSearch = normalizedSearchTerm.length > 0;

  const filteredTableNumbers = useMemo(() => {
    if (!hasActiveSearch) {
      return tableNumbers;
    }

    return tableNumbers.filter((tableNo) => {
      if (String(tableNo).includes(normalizedSearchTerm)) {
        return true;
      }

      return matchesCustomOrderIdSearch(
        dineInOrderByTable.get(tableNo),
        normalizedSearchTerm
      );
    });
  }, [tableNumbers, hasActiveSearch, normalizedSearchTerm, dineInOrderByTable]);

  const filteredDeliveryOrders = useMemo(() => {
    if (!hasActiveSearch) {
      return ordersData.deliveryOrders;
    }

    return ordersData.deliveryOrders.filter((order) =>
      matchesCustomOrderIdSearch(order, normalizedSearchTerm)
    );
  }, [ordersData.deliveryOrders, hasActiveSearch, normalizedSearchTerm]);

  const filteredPickupOrders = useMemo(() => {
    if (!hasActiveSearch) {
      return ordersData.pickupOrders;
    }

    return ordersData.pickupOrders.filter((order) =>
      matchesCustomOrderIdSearch(order, normalizedSearchTerm)
    );
  }, [ordersData.pickupOrders, hasActiveSearch, normalizedSearchTerm]);

  const searchPlaceholder = useMemo(() => {
    if (activeTab === DELIVERY_TYPE.DINE_IN) {
      return t('searchByTableNoOrOrderNo');
    }

    return t('searchByOrderNo');
  }, [activeTab, t]);

  const openSearch = useCallback(() => {
    setIsSearchVisible(true);
  }, []);

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    searchInputRef.current?.clear();
    setSearchInput('');
    setDebouncedSearchTerm('');
    setIsSearchVisible(false);
  }, []);

  const handleServiceFlowStart = useCallback(() => {
    if (
      activeTab !== DELIVERY_TYPE.DELIVERY &&
      activeTab !== DELIVERY_TYPE.PICKUP
    ) {
      return;
    }

    setPendingServiceType(activeTab);
    setServiceTimeModalVisible(true);
  }, [activeTab]);

  const handleServiceFlowClose = useCallback(() => {
    setServiceTimeModalVisible(false);
    setPendingServiceType(null);
  }, []);

  const handleServiceFlowSave = useCallback(
    (serviceTiming: OrderServiceTiming) => {
      const nextDeliveryType = pendingServiceType ?? activeTab;

      navigation.navigate('Menu', {
        tableNo: null,
        deliveryType: nextDeliveryType,
        serviceTiming,
      });

      handleServiceFlowClose();
    },
    [activeTab, handleServiceFlowClose, navigation, pendingServiceType]
  );

  useEffect(() => {
    const debounceTimeout = setTimeout(() => {
      setDebouncedSearchTerm(searchInput);
    }, 350);

    return () => clearTimeout(debounceTimeout);
  }, [searchInput]);

  useEffect(() => {
    Animated.timing(searchAnimation, {
      toValue: isSearchVisible ? 1 : 0,
      duration: isSearchVisible ? 240 : 180,
      easing: isSearchVisible
        ? Easing.out(Easing.cubic)
        : Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && isSearchVisible) {
        searchInputRef.current?.focus();
      }
    });

    if (!isSearchVisible) {
      Keyboard.dismiss();
    }
  }, [isSearchVisible, searchAnimation]);

  const searchInputOpacity = searchAnimation.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0, 0, 1],
  });
  const searchInputTranslateX = searchAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });
  const headerTitleOpacity = searchAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const headerTitleTranslateY = searchAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });
  const logoOpacity = searchAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const logoWidth = searchAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [36, 0],
  });
  const logoMargin = searchAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [4, 0],
  });
  const logoTranslateX = searchAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });
  const addButtonOpacity = searchAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const addButtonScale = searchAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.92],
  });

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

        <Animated.View
          style={{
            overflow: 'hidden',
            width: logoWidth,
            opacity: logoOpacity,
            marginRight: logoMargin,
            transform: [{ translateX: logoTranslateX }],
          }}
        >
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
        </Animated.View>
      </View>
    ),
    [
      colors.primary,
      colors.surfaceHover,
      colors.text,
      companyInitials,
      logoLoadFailed,
      logoMargin,
      logoOpacity,
      logoTranslateX,
      logoUri,
      logoWidth,
      navigation,
    ]
  );

  const searchBarComponent = useMemo(
    () => (
      <Animated.View
        style={{
          flex: 1,
          height: 40,
          borderRadius: 999,
          flexDirection: 'row',
          alignItems: 'center',
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          opacity: searchInputOpacity,
          transform: [{ translateX: searchInputTranslateX }],
        }}
      >
        <TouchableOpacity
          onPress={() => searchInputRef.current?.focus()}
          style={{
            width: 36,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialIcons name="search" size={20} color={colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <TextInput
            ref={searchInputRef}
            defaultValue={searchInput}
            onChangeText={setSearchInput}
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
            style={{
              color: colors.text,
              fontSize: 13,
              paddingVertical: 0,
              paddingRight: 8,
            }}
          />
        </View>

        <TouchableOpacity
          onPress={closeSearch}
          style={{
            width: 36,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialIcons
            name="close"
            size={18}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      </Animated.View>
    ),
    [
      closeSearch,
      colors.border,
      colors.surface,
      colors.text,
      colors.textSecondary,
      searchInput,
      searchInputOpacity,
      searchInputTranslateX,
      searchPlaceholder,
    ]
  );

  const headerTitleComponent = useMemo(
    () =>
      isSearchVisible ? (
        searchBarComponent
      ) : (
        <Animated.View
          style={{
            opacity: headerTitleOpacity,
            transform: [{ translateY: headerTitleTranslateY }],
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontWeight: '700',
              fontSize: 18,
            }}
          >
            {t('dashboard')}
          </Text>
        </Animated.View>
      ),
    [
      colors.text,
      headerTitleOpacity,
      headerTitleTranslateY,
      isSearchVisible,
      searchBarComponent,
      t,
    ]
  );

  /**
   * Memoize header right component to prevent re-renders on tab change
   */
  const headerRightComponent = useMemo(
    () =>
      isSearchVisible ? null : (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={openSearch}
            style={{ padding: 8, borderRadius: 100 }}
          >
            <MaterialIcons name="search" size={20} color={colors.text} />
          </TouchableOpacity>

          {activeTab !== DELIVERY_TYPE.DINE_IN && (
          <Animated.View
            style={{
              opacity: addButtonOpacity,
              transform: [{ scale: addButtonScale }],
              marginLeft: 4,
            }}
            pointerEvents={isSearchVisible ? 'none' : 'auto'}
          >
            <TouchableOpacity
              onPress={handleServiceFlowStart}
              disabled={isSearchVisible}
              style={{ padding: 8 }}
            >
              <MaterialIcons
                name="add-circle-outline"
                size={22}
                color={colors.primary}
              />
            </TouchableOpacity>
          </Animated.View>
          )}
        </View>
      ),
    [
      activeTab,
      addButtonOpacity,
      addButtonScale,
      colors.primary,
      colors.text,
      handleServiceFlowStart,
      isSearchVisible,
      openSearch,
    ]
  );

  /**
   * Set header options - only update when necessary
   */
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => headerTitleComponent,
      headerTitleAlign: 'left',
      headerTitleContainerStyle: isSearchVisible
        ? { left: 56, right: 8 }
        : undefined,
      headerStyle: { backgroundColor: colors.background },
      headerTintColor: colors.text,
      headerTitleStyle: { fontWeight: '700' },
      headerLeft: () => headerLeftComponent,
      headerRight: () => headerRightComponent,
    });
  }, [
    navigation,
    colors.background,
    colors.text,
    headerLeftComponent,
    headerRightComponent,
    headerTitleComponent,
    isSearchVisible,
  ]);

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

  useEffect(() => {
    if (activeTab !== DELIVERY_TYPE.DINE_IN && moveSheetVisible) {
      handleMoveSheetClose();
    }
  }, [activeTab, handleMoveSheetClose, moveSheetVisible]);

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
      return null;
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
        {hasActiveSearch
          ? t('noSearchResults')
          : activeTab === DELIVERY_TYPE.DINE_IN
            ? t('noDineInOrders')
            : activeTab === DELIVERY_TYPE.DELIVERY
              ? t('noDeliveryOrders')
              : t('noPickupOrders')}
      </Text>
    </View>
  );

  const renderTableAreasUnavailableState = () => (
    <View
      style={{
        marginTop: 16,
        paddingHorizontal: 20,
        paddingVertical: 28,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primary + '14',
        }}
      >
        <MaterialCommunityIcons
          name="view-grid-outline"
          size={26}
          color={colors.primary}
        />
      </View>
      <Text
        style={{
          color: colors.text,
          fontSize: 18,
          fontWeight: '800',
          textAlign: 'center',
          marginTop: 14,
        }}
      >
        {t('tableAreasNotAvailable')}
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 14,
          lineHeight: 20,
          textAlign: 'center',
          marginTop: 8,
        }}
      >
        {t('tableAreasNotAvailableDescription')}
      </Text>
    </View>
  );

  const renderDineInTables = () => {
    if (!hasConfiguredTableAreas) {
      return renderTableAreasUnavailableState();
    }

    if (filteredTableNumbers.length === 0) {
      return renderEmptyState();
    }

    const tables = filteredTableNumbers.map((tableNo) => {
      const order = dineInOrderByTable.get(tableNo);
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
              position: 'relative',
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
            {table.order ? (
              <TouchableOpacity
                onPress={(event) => handleMoveTablePress(table.order as Order, event)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  zIndex: 2,
                }}
              >
                <MaterialIcons
                  name="swap-horiz"
                  size={18}
                  color={colors.primary}
                />
              </TouchableOpacity>
            ) : null}
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
      const customerName = getCustomerDisplayName(
        resolveOrderCustomer(orderDetails, (order as any)?.customer)
      );
      const createdAtLabel = formatOrderCreatedAt(order.createdAt || (orderDetails as any)?.createdAt);

      return (
        <TouchableOpacity
          onPress={() => {
            if (isOrderLocked(order)) {
              const label = getOrderDisplayLabel(order);
              showToast('error', `${label} ${t('handledOnAnotherDevice')} ${t('pleaseTryLater')}`);
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
              {createdAtLabel ? (
                <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                  {t('orderedAt')}: {createdAtLabel}
                </Text>
              ) : null}
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

          {customerName ? (
            <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>
              {t('customer')}: {' '}
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {customerName}
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
        return filteredDeliveryOrders.length > 0 ? (
          <FlatList
            data={filteredDeliveryOrders}
            renderItem={renderOrderItem}
            keyExtractor={(item) => item._id}
            scrollEnabled={false}
            contentContainerStyle={{ marginTop: 16 }}
          />
        ) : (
          renderEmptyState()
        );
      case DELIVERY_TYPE.PICKUP:
        return filteredPickupOrders.length > 0 ? (
          <FlatList
            data={filteredPickupOrders}
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
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background }}
        edges={['bottom']}
      >
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['bottom']}
    >
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

      <AppBottomSheet
        visible={moveSheetVisible}
        onClose={handleMoveSheetClose}
        title={t('moveTable')}
        subtitle={
          movingOrder
            ? `${t('table')} ${movingOrder.orderDetails?.tableNo ?? ''}`
            : undefined
        }
        snapPoints={['70%']}
        footer={
          <View
            style={{
              flexDirection: 'row',
              gap: 12,
              paddingHorizontal: 4,
            }}
          >
            <TouchableOpacity
              onPress={handleMoveSheetClose}
              activeOpacity={0.85}
              disabled={isMoveSubmitting}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.searchBackground || colors.surface,
                opacity: isMoveSubmitting ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  color: colors.textSecondary || colors.text,
                  fontWeight: '700',
                }}
              >
                {t('cancel')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleConfirmMoveTable}
              activeOpacity={0.85}
              disabled={!moveTargetTableNo || isMoveSubmitting}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primary,
                opacity: !moveTargetTableNo || isMoveSubmitting ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  color: colors.textInverse,
                  fontWeight: '800',
                }}
              >
                {isMoveSubmitting ? t('processing') : t('confirm')}
              </Text>
            </TouchableOpacity>
          </View>
        }
      >
        {movingOrder ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: 18,
              padding: 16,
              marginBottom: 18,
            }}
          >
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 12,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {t('currentSelection')}
            </Text>
            <Text
              style={{
                color: colors.text,
                fontSize: 22,
                fontWeight: '800',
                marginTop: 6,
              }}
            >
              {t('table')} {movingOrder.orderDetails?.tableNo}
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 13,
                marginTop: 4,
              }}
            >
              {movingOrder.customOrderId || (movingOrder as any)?.orderDetails?.customOrderId || t('order')}
            </Text>
          </View>
        ) : null}

        <Text
          style={{
            color: colors.text,
            fontSize: 16,
            fontWeight: '700',
            marginBottom: 12,
          }}
        >
          {t('selectNewTable')}
        </Text>

        {availableMoveTables.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {availableMoveTables.map((tableOption) => {
              const isSelected = moveTargetTableNo === tableOption.tableNo;

              return (
                <TouchableOpacity
                  key={tableOption.tableNo}
                  onPress={() => setMoveTargetTableNo(tableOption.tableNo)}
                  activeOpacity={0.9}
                  style={{
                    width: '32%',
                    borderRadius: 18,
                    paddingVertical: 14,
                    paddingHorizontal: 10,
                    marginBottom: 12,
                    borderWidth: 1.5,
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected
                      ? `${colors.primary}14`
                      : colors.surface,
                  }}
                >
                  <Text
                    style={{
                      color: isSelected ? colors.primary : colors.textSecondary,
                      fontSize: 12,
                      fontWeight: '700',
                    }}
                  >
                    {t('table')}
                  </Text>
                  <Text
                    style={{
                      color: isSelected ? colors.primary : colors.text,
                      fontSize: 22,
                      fontWeight: '800',
                      marginTop: 4,
                    }}
                  >
                    {tableOption.tableNo}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.textSecondary,
                      fontSize: 11,
                      marginTop: 6,
                    }}
                  >
                    {tableOption.areaName || t('notAssigned')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.border,
              backgroundColor: colors.searchBackground || colors.surface,
              borderRadius: 18,
              paddingVertical: 28,
              paddingHorizontal: 18,
              alignItems: 'center',
            }}
          >
            <MaterialIcons
              name="event-busy"
              size={28}
              color={colors.textSecondary}
            />
            <Text
              style={{
                color: colors.text,
                fontSize: 15,
                fontWeight: '700',
                marginTop: 10,
                textAlign: 'center',
              }}
            >
              {t('noAvailableTablesToMove')}
            </Text>
          </View>
        )}
      </AppBottomSheet>
    </SafeAreaView>
  );
}



