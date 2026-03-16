import React, { useState, useLayoutEffect, useEffect, useRef, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
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
import { useCartDrawerAnimation } from '../hooks/useCartDrawerAnimation';
import { useCartNotes } from '../hooks/useCartNotes';
import { useCartFeedback } from '../hooks/useCartFeedback';
import { useSettings } from '../hooks/useSettings';

// Components
import {
  CategoryTabs,
  MenuItemsGrid,
  CartFAB,
  CartDrawer,
} from '../components/MenuScreen';
import ItemDetailsModal from '../components/ItemDetailsModal';
import ItemNoteModal from '../components/ItemNoteModal';
import CartNoteModal from '../components/CartNoteModal';
import GroupModal from '../components/GroupModal';
import PinModal from '../components/PinModal';
import AddExtraModal from '../components/AddExtraModal';
import {
  getCartSubtotal,
  getDiscountAmount,
  getCartItemQuantity,
} from '../utils/cartCalculations';
import cartService from '../services/cartService';
import { lockOrder, lockTable, unlockOrder, unlockTable } from '../services/orderSyncService';
import { useToast } from '../components/ToastProvider';
import { useConnection } from '../contexts/ConnectionProvider';

const { width } = Dimensions.get('window');

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
  const { tableNo = null, deliveryType = 0, tableArea = null, existingOrder = null } = route.params || {};
  const cartDrawerWidth = Math.min(width * 0.84, 400);

  // Use custom hooks for complex logic
  const menuData = useMenuData();
  const cartData = useMenuCart();
  const cartAnimation = useCartDrawerAnimation(cartDrawerWidth);
  const feedback = useCartFeedback();
  const { showToast } = useToast();
  const { canModifyOrders } = useConnection();
  const settingsData = useSettings();
  const groupLabelEnabled = settingsData.settings?.enableGroupLabel === true;

  // Local state
  const [showItemDetail, setShowItemDetail] = useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupModalMode, setGroupModalMode] = useState<'addGroup' | 'selectForItem' | null>(null);
  const [pendingGroupItem, setPendingGroupItem] = useState<{
    rawItem: any;
    normalizedItem: any;
    hasVariants: boolean;
  } | null>(null);
  const [showAddExtraModal, setShowAddExtraModal] = useState(false);

  const ensureCanModify = (message?: string) => {
    if (canModifyOrders) return true;
    showToast('error', message || 'Local server is offline. Orders are view-only.');
    return false;
  };

  // Cart notes management
  const cartNotes = useCartNotes(cartData.cart, cartData.updateItemNote, cartData.updateDiscount);

  const subtotal = getCartSubtotal(cartData.cart);
  const discount = getDiscountAmount(subtotal, cartData.cart.discount);
  const cartTotal = Math.max(subtotal - discount, 0);

  const orderContextLabel = useMemo(() => {
    if (tableNo) return `Table ${tableNo}`;
    if (deliveryType === 1) return 'Delivery Order';
    if (deliveryType === 2) return 'Pickup Order';
    return 'Walk-in Order';
  }, [tableNo, deliveryType]);

  const orderContextIcon = useMemo(() => {
    if (tableNo) return 'table-chair';
    if (deliveryType === 1) return 'bike-fast';
    if (deliveryType === 2) return 'shopping-outline';
    return 'silverware-fork-knife';
  }, [tableNo, deliveryType]);

  const [decreasePinChecked, setDecreasePinChecked] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const pendingDecreaseRef = useRef<
    { type: 'update' | 'remove'; cartId: string; quantity?: number } | null
  >(null);

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
    setDecreasePinChecked(false);
    pendingDecreaseRef.current = null;
  }, [existingOrder?._id, existingOrder?.id]);

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

  const shouldRequireDecreasePin = (cartId: string, nextQty?: number) => {
    if (!existingOrder) return false;
    const item = cartData.cart.items.find((entry) => entry.cartId === cartId);
    if (!item) return false;
    const isOldItem = item.isOld === true || item.oldQuantity != null;
    if (!isOldItem) return false;
    if (nextQty == null) return true;
    const currentQty = getCartItemQuantity(item);
    return nextQty < currentQty;
  };

  const handleUpdateQuantity = async (cartId: string, quantity: number) => {
    if (!ensureCanModify()) return;
    if (!decreasePinChecked && shouldRequireDecreasePin(cartId, quantity)) {
      pendingDecreaseRef.current = { type: 'update', cartId, quantity };
      setPinModalVisible(true);
      return;
    }
    await cartData.updateQuantity(cartId, quantity);
  };

  const handleRemoveItem = async (cartId: string) => {
    if (!ensureCanModify()) return;
    if (!decreasePinChecked && shouldRequireDecreasePin(cartId)) {
      pendingDecreaseRef.current = { type: 'remove', cartId };
      setPinModalVisible(true);
      return;
    }
    await cartData.removeFromCart(cartId);
  };

  const handlePinVerified = async () => {
    setPinModalVisible(false);
    setDecreasePinChecked(true);
    const pending = pendingDecreaseRef.current;
    pendingDecreaseRef.current = null;
    if (!pending) return;
    if (pending.type === 'update' && typeof pending.quantity === 'number') {
      await cartData.updateQuantity(pending.cartId, pending.quantity);
      return;
    }
    if (pending.type === 'remove') {
      await cartData.removeFromCart(pending.cartId);
    }
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
          <TouchableOpacity
            onPress={() => {
              if (!ensureCanModify()) return;
              setShowAddExtraModal(true);
            }}
            style={{ padding: 8, opacity: canModifyOrders ? 1 : 0.5 }}
          >
            <MaterialCommunityIcons name="plus-box-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (!ensureCanModify()) return;
              cartNotes.setShowCartNoteModal(true);
            }}
            style={{ padding: 8, opacity: canModifyOrders ? 1 : 0.5 }}
          >
            <MaterialCommunityIcons name="note-edit-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, colors, tableNo, deliveryType, cartNotes, canModifyOrders, showToast]);

  // ===== Cart Operation Handlers =====

  const ensureGroupSelection = (payload: {
    rawItem: any;
    normalizedItem: any;
    hasVariants: boolean;
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

  const addToCart = (item: any) => {
    if (!ensureCanModify()) return;
    const normalizedItem = normalizeMenuItemForOptions(item);
    const hasVariants =
      Array.isArray(normalizedItem.menuItemVariants) &&
      normalizedItem.menuItemVariants.length > 0;

    if (
      !ensureGroupSelection({
        rawItem: item,
        normalizedItem,
        hasVariants,
      })
    ) {
      return;
    }

    if (hasVariants) {
      setSelectedMenuItem(normalizedItem);
      setShowItemDetail(true);
    } else {
      handleAddToCartDirect(item, null, null, undefined);
    }
  };

  const handleAddToCartDirect = async (
    item: any,
    variant: any,
    attribute: any,
    attributeValues?: any[]
  ) => {
    try {
      if (!ensureCanModify()) return;
      if (groupLabelEnabled) {
        cartService.useTempGroupIfAvailable();
      }
      const category = menuData.categories[menuData.activeCategory];
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
    if (selectedMenuItem) {
      await handleAddToCartDirect(
        selectedMenuItem,
        variant,
        attribute,
        attributeValues
      );
      setShowItemDetail(false);
      setSelectedMenuItem(null);
    }
  };

  const handleGroupModalSelect = async (label: string) => {
    const cart = cartData.cart;
    if (groupModalMode === 'addGroup') {
      cartService.startNewGroup(cart, label);
      cartAnimation.closeCartDrawer();
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

      if (pending.hasVariants) {
        setSelectedMenuItem(pending.normalizedItem);
        setShowItemDetail(true);
        return;
      }

      await handleAddToCartDirect(
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

  const handleAddGroup = () => {
    const cart = cartData.cart;
    if (!groupLabelEnabled) {
      cartService.startNewGroup(cart);
      return;
    }
    setGroupModalMode('addGroup');
    setShowGroupModal(true);
  };

  const handleSelectGroup = (groupType: number, groupLabel?: string) => {
    cartService.setActiveGroup(groupType, groupLabel || '');
  };

  const handleAddExtraSave = async (payload: {
    itemName: string;
    price: number;
    extraCategory: number;
  }) => {
    if (!ensureCanModify()) return;
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
    if (!ensureCanModify()) return;
    if (cartData.cart.items.length === 0) {
      showToast('error', 'Please add items to cart');
      return;
    }

    if (cartAnimation.showCart) {
      cartAnimation.closeCartDrawer();
    }

    navigation.navigate('Checkout', {
      cart: cartData.cart,
      tableNo,
      deliveryType,
      tableArea,
      existingOrder,
    });
  };

  const handleSaveCartNote = async (note: string, discount: any) => {
    try {
      if (!ensureCanModify()) return;
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
          onPress={cartAnimation.toggleCartDrawer}
          scaleAnim={feedback.cartFabScaleAnim}
          badgeScaleAnim={feedback.cartBadgeScaleAnim}
          colors={colors}
        />

        {/* Cart Drawer */}
        <CartDrawer
          visible={cartAnimation.showCart}
          cart={cartData.cart}
          cartQuantity={cartData.cartQuantity}
          cartDrawerWidth={cartDrawerWidth}
          cartDrawerTranslateAnim={cartAnimation.cartDrawerTranslateAnim}
          cartDrawerBackdropAnim={cartAnimation.cartDrawerBackdropAnim}
          editingItemNoteId={cartNotes.editingItemNoteId}
          itemNoteDraft={cartNotes.itemNoteDraft}
          onItemNoteDraftChange={cartNotes.setItemNoteDraft}
          onOpenItemNoteModal={(item) =>
            cartNotes.openItemNoteModal(item.cartId || '', item.orderItemNote || '')
          }
          onCancelItemNoteEdit={cartNotes.cancelItemNoteEdit}
          onSaveItemNote={async () => {
            if (cartNotes.editingItemNoteId) {
              try {
                await cartData.updateItemNote(
                  cartNotes.editingItemNoteId,
                  cartNotes.itemNoteDraft
                );
                cartNotes.cancelItemNoteEdit();
              } catch (err) {
                showToast('error', 'Failed to save item note');
              }
            }
          }}
          onUpdateQuantity={handleUpdateQuantity}
          onRemoveItem={handleRemoveItem}
          onEditOrderMeta={() => {
            if (!ensureCanModify()) return;
            cartNotes.setShowCartNoteModal(true);
          }}
          onAddGroup={handleAddGroup}
          showAddGroup={groupLabelEnabled}
          onSelectGroup={handleSelectGroup}
          onCheckout={proceedToCheckout}
          onClose={cartAnimation.closeCartDrawer}
          colors={colors}
        />
      </View>

      {/* Item Details Modal */}
      {selectedMenuItem && (
        <ItemDetailsModal
          visible={showItemDetail}
          item={selectedMenuItem}
          category={menuData.categories[menuData.activeCategory]}
          onClose={() => {
            setShowItemDetail(false);
            setSelectedMenuItem(null);
          }}
          onConfirm={handleModalConfirm}
        />
      )}

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

      <PinModal
        visible={pinModalVisible}
        onClose={() => {
          setPinModalVisible(false);
          pendingDecreaseRef.current = null;
        }}
        onVerified={handlePinVerified}
      />

      <GroupModal
        visible={showGroupModal}
        existingLabels={cartService.getUniqueGroupLabels(cartData.cart)}
        onSelect={handleGroupModalSelect}
      />
    </View>
  );
}
