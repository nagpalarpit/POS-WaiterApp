import React, { useState, useLayoutEffect, useEffect, useRef, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';

// Hooks
import {
  useMenuData,
  normalizeMenuItemForOptions,
} from '../hooks/useMenuData';
import { useMenuCart } from '../hooks/useMenuCart';
import { useCartNotes } from '../hooks/useCartNotes';
import { useCartFeedback } from '../hooks/useCartFeedback';
import { useSettings } from '../hooks/useSettings';

// Components
import {
  CategoryTabs,
  MenuItemsGrid,
  CartFAB,
} from '../components/MenuScreen';
import ItemDetailsModal from '../components/ItemDetailsModal';
import VoucherOptionsModal from '../components/VoucherOptionsModal';
import ItemNoteModal from '../components/ItemNoteModal';
import CartNoteModal from '../components/CartNoteModal';
import GroupModal from '../components/GroupModal';
import AddExtraModal from '../components/AddExtraModal';
import CustomerDrawer from '../components/CustomerDrawer';
import {
  getCartSubtotal,
  getDiscountAmount,
} from '../utils/cartCalculations';
import cartService from '../services/cartService';
import { lockOrder, lockTable, unlockOrder, unlockTable } from '../services/orderSyncService';
import { useToast } from '../components/ToastProvider';
import { OrderServiceTiming } from '../types/orderFlow';
import {
  formatCustomerAddress,
  getCustomerDisplayName,
} from '../utils/customerData';


interface MenuScreenProps {
  navigation: any;
  route: any;
}

/**
 * Refactored MenuScreen with extracted logic into hooks and components
 * Responsibilities: Navigation, state orchestration, and layout coordination
 */
export default function MenuScreen({ navigation, route }: MenuScreenProps) {
  const { colors } = useTheme();
  const {
    tableNo = null,
    deliveryType = 0,
    tableArea = null,
    existingOrder = null,
    serviceTiming = null,
  }: {
    tableNo?: number | null;
    deliveryType?: number;
    tableArea?: any;
    existingOrder?: any;
    serviceTiming?: OrderServiceTiming | null;
  } = route.params || {};
  // Use custom hooks for complex logic
  const menuData = useMenuData();
  const cartData = useMenuCart();
  const feedback = useCartFeedback();
  const { showToast } = useToast();
  const settingsData = useSettings();
  const groupLabelEnabled = settingsData.settings?.enableGroupLabel === true;

  // Local state
  const [showItemDetail, setShowItemDetail] = useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState<any>(null);
  const [selectedMenuCategory, setSelectedMenuCategory] = useState<any>(null);
  const [selectedVoucherCategories, setSelectedVoucherCategories] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupModalMode, setGroupModalMode] = useState<'addGroup' | 'selectForItem' | null>(null);
  const [pendingGroupItem, setPendingGroupItem] = useState<{
    category: any;
    rawItem: any;
    normalizedItem: any;
    opensOptionsModal: boolean;
  } | null>(null);
  const [showAddExtraModal, setShowAddExtraModal] = useState(false);
  const [showCustomerDrawer, setShowCustomerDrawer] = useState(false);

  // Cart notes management
  const cartNotes = useCartNotes(cartData.cart, cartData.updateItemNote, cartData.updateDiscount);

  const subtotal = getCartSubtotal(cartData.cart);
  const discount = getDiscountAmount(subtotal, cartData.cart.discount);
  const cartTotal = Math.max(subtotal - discount, 0);
  const selectedCustomerName = getCustomerDisplayName(cartData.cart.currentUser);
  const selectedCustomerAddress = formatCustomerAddress(
    cartData.cart.currentUser?.addresses.find(
      (address) => address.id === cartData.cart.currentUser?.customerAddressId,
    ) || cartData.cart.currentUser?.addresses?.[0],
  );

  const isVoucherCategory = (category: any) =>
    String(category?.categoryType || '')
      .trim()
      .toLowerCase() === 'voucher';

  const isVoucherFlowItem = (item: any, category?: any) =>
    isVoucherCategory(category) || item?.vouchers != null;

  const closeItemDetail = () => {
    setShowItemDetail(false);
    setSelectedMenuItem(null);
    setSelectedMenuCategory(null);
    setSelectedVoucherCategories([]);
  };

  const cloneData = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

  const resolveSingleVoucherItem = (categories: any[], voucherCategory: any) => {
    const categoryId = Number(voucherCategory?.categoryId ?? 0);
    const itemId = Number(voucherCategory?.items?.[0]?.itemId ?? 0);
    if (!categoryId || !itemId) return null;

    const matchedCategory = categories.find((menuCategory) => Number(menuCategory?.id) === categoryId);
    if (!matchedCategory) return null;

    const matchedItem = matchedCategory?.menuItems?.find(
      (menuItem: any) => Number(menuItem?.id) === itemId,
    );

    return matchedItem ? cloneData(matchedItem) : null;
  };

  const prepareVoucherItem = (item: any) => {
    const nextItem = cloneData(item);
    nextItem.discountItems = [];

    const voucherBuyCategories = Array.isArray(nextItem?.vouchers?.customerBuys?.categories)
      ? nextItem.vouchers.customerBuys.categories
      : [];
    const voucherGetCategories = Array.isArray(nextItem?.vouchers?.customerGets?.categories)
      ? nextItem.vouchers.customerGets.categories
      : [];

    if (voucherBuyCategories.length > 0) {
      const matchingCategories = menuData.categories.filter((menuCategory: any) =>
        voucherBuyCategories.some(
          (voucherCategory: any) => Number(voucherCategory?.categoryId) === Number(menuCategory?.id),
        ),
      );

      if (!matchingCategories.length) {
        return {
          error: 'Voucher cannot be applied! Selected category is not available',
        };
      }

      if (
        voucherBuyCategories?.[0]?.items?.length === 1 &&
        nextItem?.vouchers?.customerGets
      ) {
        const customerBuyItem = resolveSingleVoucherItem(matchingCategories, voucherBuyCategories[0]);
        if (!customerBuyItem) {
          return {
            error: 'Voucher cannot be applied! item is not available',
          };
        }
        nextItem.discountItems.push({
          customerBuys: [customerBuyItem],
        });
      } else {
        return {
          item: nextItem,
          requiresSelection: true,
          categories: matchingCategories.map((entry) => cloneData(entry)),
        };
      }
    }

    if (voucherGetCategories.length === 1 && voucherGetCategories[0]?.items?.length === 1) {
      const customerGetsItem = resolveSingleVoucherItem(menuData.categories, voucherGetCategories[0]);
      if (!customerGetsItem) {
        return {
          error: 'Voucher cannot be applied! item is not available',
        };
      }
      nextItem.discountItems.push({
        customerGets: [customerGetsItem],
      });
    }

    return {
      item: nextItem,
      requiresSelection: false,
      categories: [],
    };
  };


  const getExtrasCategoryPercent = (category: any): number | null => {
    const rawValues = [
      category?.tax?.percentage,
      category?.tax?.name,
      category?.name,
    ];
    let percent: number | null = null;
    let hasZero = false;
    for (const raw of rawValues) {
      if (raw == null) continue;
      if (typeof raw === 'number') {
        if (raw > 0) {
          percent = Math.round(raw);
          break;
        }
        if (raw === 0) hasZero = true;
        continue;
      }
      const match = String(raw).match(/(\d+)\s*%/);
      if (match) {
        percent = parseInt(match[1], 10);
        break;
      }
    }
    if (percent == null && hasZero) percent = 0;
    return percent;
  };

  const getCategoryByExtraCategory = (extraCategory?: number) => {
    const categories = menuData.cartCategories || [];
    if (!categories.length) return null;
    if (!extraCategory) return categories[0];

    const targetPercentage =
      extraCategory === 1 ? 7 : extraCategory === 2 ? 19 : 0;

    const match = categories.find((category) => {
      const pct = getExtrasCategoryPercent(category);
      if (pct == null) return false;
      return Math.round(pct) === targetPercentage;
    });

    return match || categories[0];
  };

  useEffect(() => {
    if (!existingOrder) return;
    const hydrateCart = async () => {
      try {
        const orderCart = await cartService.setCartFromOrder(existingOrder);
        cartData.setCart(orderCart);

        const isTableOrder =
          !!tableNo &&
          (deliveryType === 0 ||
            existingOrder?.orderDetails?.orderDeliveryTypeId === 0);

        if (isTableOrder && orderCart.items.length > 0) {
          const lastItem = orderCart.items[orderCart.items.length - 1];
          const groupType = lastItem?.groupType || 1;
          const groupLabel = lastItem?.groupLabel || '';
          cartService.setActiveGroup(groupType, groupLabel);
        }

        await lockOrder(existingOrder);
      } catch (error) {
        console.error('MenuScreen: Failed to hydrate cart from existing order', error);
      }
    };
    hydrateCart();
  }, [existingOrder, cartData.setCart, tableNo, deliveryType]);

  useEffect(() => {
    if (existingOrder) return;
    if (!tableNo) return;
    lockTable(tableNo);
  }, [existingOrder, tableNo]);

  useEffect(() => {
    if (!existingOrder && !tableNo) return;
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      const action = e?.data?.action;
      if (action?.type === 'NAVIGATE' && action?.payload?.name === 'Checkout') {
        return;
      }
      if (existingOrder) {
        unlockOrder(existingOrder);
        return;
      }
      if (tableNo) {
        unlockTable(tableNo);
      }
    });
    return unsubscribe;
  }, [navigation, existingOrder, tableNo]);


  const handleAddGroup = () => {
    const cart = cartData.cart;
    if (!groupLabelEnabled) {
      cartService.startNewGroup(cart);
      return;
    }
    setGroupModalMode('addGroup');
    setShowGroupModal(true);
  };

  const activeCategory = menuData.categories[menuData.activeCategory];
  const filteredItemsCount = useMemo(() => {
    const items = activeCategory?.menuItems || [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return items.length;
    return items.filter((item) => {
      const searchable = [
        item.name,
        item.description,
        item.sku,
        String(item.customId ?? ''),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(query);
    }).length;
  }, [activeCategory, searchQuery]);

  // Setup haptic feedback for cart quantity changes (animation handled in useCartFeedback)
  const previousCartQtyRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = previousCartQtyRef.current;
    if (prev !== null && cartData.cartQuantity > prev) {
      feedback.triggerCartAddedFeedback();
    }
    previousCartQtyRef.current = cartData.cartQuantity;
  }, [cartData.cartQuantity, feedback]);

  // Set header options
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: 'Menu',
      headerStyle: { backgroundColor: colors.background },
      headerTintColor: colors.text,
      headerTitleStyle: { fontWeight: '700' },
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ padding: 8 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialIcons name="chevron-left" size={24} color={colors.text} />
            {tableNo ? (
              <Text>Table {tableNo}</Text>
            ) : deliveryType === 1 ? (
              <Text>Delivery</Text>
            ) : (
              <Text>Pickup</Text>
            )}
          </View>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {groupLabelEnabled ? (
            <TouchableOpacity
              onPress={handleAddGroup}
              style={{ padding: 8 }}
            >
              <MaterialCommunityIcons name="layers-plus" size={20} color={colors.text} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => setShowCustomerDrawer(true)}
            style={{ padding: 8 }}
          >
            <MaterialCommunityIcons
              name={cartData.cart.currentUser ? 'account-check-outline' : 'account-outline'}
              size={20}
              color={cartData.cart.currentUser ? colors.primary : colors.text}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowAddExtraModal(true)}
            style={{ padding: 8 }}
          >
            <MaterialCommunityIcons name="plus-box-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => cartNotes.setShowCartNoteModal(true)}
            style={{ padding: 8 }}
          >
            <MaterialCommunityIcons name="note-edit-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [
    navigation,
    colors,
    tableNo,
    deliveryType,
    cartNotes,
    cartData.cart.currentUser,
    groupLabelEnabled,
    handleAddGroup,
  ]);

  // ===== Cart Operation Handlers =====

  const ensureGroupSelection = (payload: {
    category: any;
    rawItem: any;
    normalizedItem: any;
    opensOptionsModal: boolean;
  }) => {
    if (!groupLabelEnabled) return true;

    if (cartService.useTempGroupIfAvailable()) {
      return true;
    }

    if (cartService.currentGroupIndex && cartData.cart.items.length > 0) {
      const currentGroup = cartData.cart.items.find(
        (cartItem) => cartItem.groupType === cartService.currentGroupIndex
      );
      if (currentGroup) {
        cartService.tempNewGroupLabel = currentGroup.groupLabel || '';
        return true;
      }
    }

    setPendingGroupItem(payload);
    setGroupModalMode('selectForItem');
    setShowGroupModal(true);
    return false;
  };

  const addToCart = (item: any, categoryOverride?: any) => {
    const category = categoryOverride || menuData.categories[menuData.activeCategory];
    const normalizedItem = normalizeMenuItemForOptions(item);
    const hasVariants =
      Array.isArray(normalizedItem.menuItemVariants) &&
      normalizedItem.menuItemVariants.length > 0;
    const opensOptionsModal =
      isVoucherFlowItem(normalizedItem, category) || hasVariants;

    if (item?.vouchers != null) {
      const preparedVoucher = prepareVoucherItem(normalizedItem);
      if (preparedVoucher?.error) {
        showToast('error', preparedVoucher.error);
        return;
      }

      if (!preparedVoucher?.item) {
        showToast('error', 'Unable to open voucher');
        return;
      }

      const shouldOpenVoucherModal =
        isVoucherCategory(category) ||
        preparedVoucher.requiresSelection === true ||
        hasVariants;

      if (
        !ensureGroupSelection({
          category,
          rawItem: preparedVoucher.item,
          normalizedItem: preparedVoucher.item,
          opensOptionsModal: shouldOpenVoucherModal,
        })
      ) {
        if (shouldOpenVoucherModal) {
          setSelectedVoucherCategories(preparedVoucher.categories || []);
        }
        return;
      }

      if (shouldOpenVoucherModal) {
        setSelectedMenuCategory(category);
        setSelectedMenuItem(preparedVoucher.item);
        setSelectedVoucherCategories(preparedVoucher.categories || []);
        setShowItemDetail(true);
        return;
      }

      void handleAddToCartDirect(category, preparedVoucher.item, null, null, undefined);
      return;
    }

    if (
      !ensureGroupSelection({
        category,
        rawItem: item,
        normalizedItem,
        opensOptionsModal,
      })
    ) {
      return;
    }

    if (opensOptionsModal) {
      setSelectedMenuCategory(category);
      setSelectedMenuItem(normalizedItem);
      setShowItemDetail(true);
    } else {
      handleAddToCartDirect(category, item, null, null, undefined);
    }
  };

  const handleAddToCartDirect = async (
    category: any,
    item: any,
    variant: any,
    attribute: any,
    attributeValues?: any[]
  ) => {
    try {
      if (groupLabelEnabled) {
        cartService.useTempGroupIfAvailable();
      }
      await cartData.addToCartDirect(
        category,
        item,
        variant,
        attribute,
        attributeValues
      );
    } catch (error) {
      showToast('error', 'Failed to add item to cart');
    }
  };

  const handleModalConfirm = async (
    variant: any,
    attribute: any,
    attributeValues: any[]
  ) => {
    if (selectedMenuItem && selectedMenuCategory) {
      await handleAddToCartDirect(
        selectedMenuCategory,
        selectedMenuItem,
        variant,
        attribute,
        attributeValues
      );
      closeItemDetail();
    }
  };

  const handleVoucherModalConfirm = async (payload: {
    item: any;
    variant?: any;
    attribute?: any;
    attributeValues?: any[];
  }) => {
    if (!selectedMenuCategory || !payload?.item) {
      return;
    }

    await handleAddToCartDirect(
      selectedMenuCategory,
      payload.item,
      payload.variant ?? null,
      payload.attribute ?? null,
      payload.attributeValues ?? [],
    );
    closeItemDetail();
  };

  const handleGroupModalSelect = async (label: string) => {
    const cart = cartData.cart;
    if (groupModalMode === 'addGroup') {
      cartService.startNewGroup(cart, label);
      setShowGroupModal(false);
      setGroupModalMode(null);
      return;
    }

    if (pendingGroupItem) {
      cartService.setGroupIndexByLabel(label, cart);
      const pending = pendingGroupItem;
      setPendingGroupItem(null);
      setShowGroupModal(false);
      setGroupModalMode(null);

      if (pending.opensOptionsModal) {
        setSelectedMenuCategory(pending.category);
        setSelectedMenuItem(pending.normalizedItem);
        if (pending.normalizedItem?.vouchers != null) {
          const preparedVoucher = prepareVoucherItem(pending.normalizedItem);
          setSelectedVoucherCategories(preparedVoucher.categories || []);
        }
        setShowItemDetail(true);
        return;
      }

      await handleAddToCartDirect(
        pending.category,
        pending.rawItem,
        null,
        null,
        undefined
      );
      return;
    }

    setShowGroupModal(false);
    setGroupModalMode(null);
  };

  const handleAddExtraSave = async (payload: {
    itemName: string;
    price: number;
    extraCategory: number;
  }) => {
    const categories = menuData.cartCategories || [];
    if (!categories.length) {
      showToast('error', 'Extras are not configured.');
      return;
    }
    const categoryToUse = getCategoryByExtraCategory(payload.extraCategory);
    if (!categoryToUse) {
      showToast('error', 'No extras category found.');
      return;
    }
    const itemId = categoryToUse?.menuItems?.[0]?.id;
    if (!itemId) {
      showToast('error', 'No extra items configured.');
      return;
    }

    const item = {
      id: itemId,
      customId: 0,
      name: payload.itemName,
      price: payload.price,
      isExtraItem: true,
      extraCategory: payload.extraCategory,
    };

    try {
      if (groupLabelEnabled) {
        cartService.useTempGroupIfAvailable();
      }
      await cartData.addToCartDirect(categoryToUse, item, null, null, undefined);
      setShowAddExtraModal(false);
    } catch (error) {
      showToast('error', 'Failed to add extra item');
    }
  };

  const proceedToCheckout = async () => {
    if (cartData.cart.items.length === 0) {
      showToast('error', 'Please add items to cart');
      return;
    }

    navigation.navigate('Checkout', {
      cart: cartData.cart,
      tableNo,
      deliveryType,
      tableArea,
      existingOrder,
      serviceTiming,
    });
  };

  const handleSaveCartNote = async (note: string, discount: any) => {
    try {
      await cartData.updateOrderNote(note || '');
      if (discount) {
        await cartData.updateDiscount(discount);
      } else {
        await cartData.updateDiscount(null);
      }
      cartNotes.setShowCartNoteModal(false);
    } catch (err) {
      showToast('error', 'Failed to save cart note');
    }
  };

  // ===== Render =====

  if (menuData.loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.background,
        }}
      >
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            backgroundColor: colors.surface,
            paddingHorizontal: 10,
            height: 44,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <MaterialIcons name="search" size={19} color={colors.textSecondary} />
          <TextInput
            placeholder="Search by item, code, or description"
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={{
              flex: 1,
              color: colors.text,
              marginLeft: 8,
              paddingVertical: 0,
              fontSize: 13,
            }}
          />
          {searchQuery.trim() ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
              <MaterialIcons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {cartData.cart.currentUser ? (
        <View
          style={{
            paddingHorizontal: 14,
            paddingBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          <TouchableOpacity
            onPress={() => setShowCustomerDrawer(true)}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
              backgroundColor: colors.surface,
              paddingHorizontal: 12,
              paddingVertical: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <MaterialCommunityIcons
                name="account-outline"
                size={18}
                color={colors.textSecondary}
                style={{ marginTop: 1 }}
              />
              <View style={{ flex: 1, marginLeft: 10, paddingRight: 8 }}>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>
                  {selectedCustomerName || cartData.cart.currentUser.mobileNo || 'Selected Customer'}
                </Text>
                {cartData.cart.currentUser.mobileNo ? (
                  <Text style={{ color: colors.textSecondary, marginTop: 3, fontSize: 12 }}>
                    {cartData.cart.currentUser.mobileNo}
                  </Text>
                ) : null}
                {deliveryType === 1 && selectedCustomerAddress ? (
                  <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 12, lineHeight: 18 }}>
                    {selectedCustomerAddress}
                  </Text>
                ) : null}
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={18}
                color={colors.textSecondary}
              />
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flex: 1 }}>
        {/* Menu Section */}
        <View style={{ flex: 1 }}>
          {/* Category Tabs */}
          <CategoryTabs
            categories={menuData.categories}
            activeCategory={menuData.activeCategory}
            onCategorySelect={menuData.setActiveCategory}
            colors={colors}
          />

          {/* Menu Items Grid */}
          <MenuItemsGrid
            categories={menuData.categories}
            activeCategory={menuData.activeCategory}
            onAddToCart={addToCart}
            searchQuery={searchQuery}
            colors={colors}
          />
        </View>

        {/* Cart FAB */}
        <CartFAB
          cartQuantity={cartData.cartQuantity}
          totalAmount={cartTotal}
          onPress={proceedToCheckout}
          scaleAnim={feedback.cartFabScaleAnim}
          badgeScaleAnim={feedback.cartBadgeScaleAnim}
          colors={colors}
        />
      </View>

      {/* Item Details Modal */}
      {selectedMenuItem && !isVoucherFlowItem(selectedMenuItem, selectedMenuCategory) ? (
        <ItemDetailsModal
          visible={showItemDetail}
          item={selectedMenuItem}
          category={selectedMenuCategory}
          onClose={closeItemDetail}
          onConfirm={handleModalConfirm}
        />
      ) : null}

      {selectedMenuItem && isVoucherFlowItem(selectedMenuItem, selectedMenuCategory) ? (
        <VoucherOptionsModal
          visible={showItemDetail}
          item={selectedMenuItem}
          category={selectedMenuCategory}
          availableCategories={selectedVoucherCategories}
          onClose={closeItemDetail}
          onConfirm={handleVoucherModalConfirm}
        />
      ) : null}

      {/* Item Note Modal */}
      <ItemNoteModal
        visible={cartNotes.showItemNoteModal}
        initialNote={cartNotes.itemNoteDraft}
        onClose={() => cartNotes.setShowItemNoteModal(false)}
        onSave={cartNotes.saveItemNoteModal}
      />

      {/* Cart Note & Discount Modal */}
      <CartNoteModal
        visible={cartNotes.showCartNoteModal}
        initialNote={cartData.cart.orderNote || ''}
        initialDiscount={cartData.cart.discount || null}
        onClose={() => cartNotes.setShowCartNoteModal(false)}
        onSave={handleSaveCartNote}
      />

      <AddExtraModal
        visible={showAddExtraModal}
        onClose={() => setShowAddExtraModal(false)}
        onSave={handleAddExtraSave}
      />

      <GroupModal
        visible={showGroupModal}
        existingLabels={cartService.getUniqueGroupLabels(cartData.cart)}
        onSelect={handleGroupModalSelect}
      />

      <CustomerDrawer
        visible={showCustomerDrawer}
        selectedCustomer={cartData.cart.currentUser || null}
        onClose={() => setShowCustomerDrawer(false)}
        onSelect={async (customer) => {
          await cartData.updateCurrentUser(customer);
        }}
      />
    </View>
  );
}
