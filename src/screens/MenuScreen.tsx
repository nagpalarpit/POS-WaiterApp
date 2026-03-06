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
import {
  getCartSubtotal,
  getDiscountAmount,
} from '../utils/cartCalculations';
import cartService from '../services/cartService';
import { lockOrder, lockTable, unlockTable } from '../services/orderSyncService';
import { useToast } from '../components/ToastProvider';

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

  // Local state
  const [showItemDetail, setShowItemDetail] = useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  useEffect(() => {
    if (!existingOrder) return;
    const hydrateCart = async () => {
      try {
        const orderCart = await cartService.setCartFromOrder(existingOrder);
        cartData.setCart(orderCart);
        await lockOrder(existingOrder);
      } catch (error) {
        console.error('MenuScreen: Failed to hydrate cart from existing order', error);
      }
    };
    hydrateCart();
  }, [existingOrder, cartData.setCart]);

  useEffect(() => {
    if (existingOrder) return;
    if (!tableNo) return;
    lockTable(tableNo);
  }, [existingOrder, tableNo]);

  useEffect(() => {
    if (existingOrder || !tableNo) return;
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      const action = e?.data?.action;
      if (action?.type === 'NAVIGATE' && action?.payload?.name === 'Checkout') {
        return;
      }
      unlockTable(tableNo);
    });
    return unsubscribe;
  }, [navigation, existingOrder, tableNo]);

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
        <TouchableOpacity
          onPress={() => cartNotes.setShowCartNoteModal(true)}
          style={{ padding: 8,}}
        >
          <MaterialCommunityIcons name="note-edit-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors, tableNo, deliveryType, cartNotes]);

  // ===== Cart Operation Handlers =====

  const addToCart = (item: any) => {
    const normalizedItem = normalizeMenuItemForOptions(item);
    const hasVariants =
      Array.isArray(normalizedItem.menuItemVariants) &&
      normalizedItem.menuItemVariants.length > 0;

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
      const category = menuData.categories[menuData.activeCategory];
      await cartData.addToCartDirect(
        category,
        item,
        variant,
        attribute,
        attributeValues
      );
    } catch (error) {
      showToast('Failed to add item to cart', { type: 'error' });
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

  const proceedToCheckout = async () => {
    if (cartData.cart.items.length === 0) {
      showToast('Please add items to cart', { type: 'error' });
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
      await cartData.updateOrderNote(note || '');
      if (discount) {
        await cartData.updateDiscount(discount);
      } else {
        await cartData.updateDiscount(null);
      }
      cartNotes.setShowCartNoteModal(false);
    } catch (err) {
      showToast('Failed to save cart note', { type: 'error' });
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
                showToast('Failed to save item note', { type: 'error' });
              }
            }
          }}
          onUpdateQuantity={cartData.updateQuantity}
          onRemoveItem={cartData.removeFromCart}
          onEditOrderMeta={() => cartNotes.setShowCartNoteModal(true)}
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
    </View>
  );
}
