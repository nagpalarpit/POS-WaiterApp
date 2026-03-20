import AsyncStorage from '@react-native-async-storage/async-storage';
import { Customer } from '../types/customer';
import { resolveOrderCustomer } from '../utils/customerData';

export interface AttributeValue {
  id?: number;
  attributeValueId?: number;
  name?: string;
  attributeValueName?: string;
  price?: number;
  attributeValuePrice?: number;
  unitPrice?: number;
  quantity?: number;
  attributeValueQuantity?: number;
}

export type CartDiscountType = 'PERCENTAGE' | 'FLAT' | 'CUSTOM';

export interface CartDiscount {
  discountId?: number | string;
  discountName?: string;
  discountType: CartDiscountType;
  discountValue: number;
}

export interface CartItem {
  cartId?: string;
  
  // Basic item info
  categoryId: number;
  categoryName: string;
  customId: number;
  itemId: number;
  itemName: string;
  itemPrice: number;
  isExtraItem?: boolean;
  extraCategory?: number;
  
  // Variant
  variantId?: number;
  variantName?: string;
  variantPrice?: number;
  
  // Attribute
  attributeId?: number;
  attributeName?: string;
  attributePrice?: number;
  
  // Attribute Values (Array - POS_V2 pattern)
  attributeValues?: AttributeValue[];
  
  // Quantity & Notes
  quantity: number;
  orderItemNote?: string;
  discountItems?: any[];
  
  // Group & Order info
  tax?: any;
  groupType: number;
  groupLabel?: string;
  isOld?: boolean;
  oldQuantity?: number;
}

export interface Cart {
  items: CartItem[];
  removedItems?: CartItem[];
  orderNote?: string;
  discount?: CartDiscount | null;
  currentUser?: Customer | null;
}

const CART_STORAGE_KEY = 'cart';

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

const normalizeDiscountFromOrder = (discount: any): CartDiscount | null => {
  if (!discount) return null;
  const discountType =
    discount.discountType === 3 ||
    discount.discountType === '3' ||
    discount.discountType === 'CUSTOM'
      ? 'CUSTOM'
      : discount.discountType === 1 ||
        discount.discountType === '1' ||
        discount.discountType === 'PERCENTAGE'
        ? 'PERCENTAGE'
        : 'FLAT';
  const discountValue = toNumber(discount.discountValue ?? discount.value, 0);
  if (!discountValue) return null;
  return {
    discountId: discount.discountId ?? discount.id ?? discount._id,
    discountName: discount.discountName || discount.name || '',
    discountType,
    discountValue,
  };
};

class CartService {
  currentGroupIndex = 1;
  tempGroupIndex = false;
  tempNewGroup = 1;
  tempNewGroupLabel = '';

  resetGroupState() {
    this.currentGroupIndex = 1;
    this.tempNewGroup = 1;
    this.tempGroupIndex = false;
    this.tempNewGroupLabel = '';
  }

  /**
   * Load cart from AsyncStorage
   */
  async loadCart(): Promise<Cart> {
    try {
      const cartData = await AsyncStorage.getItem(CART_STORAGE_KEY);
      if (cartData) {
        const parsed = JSON.parse(cartData);
        const cart = {
          items: Array.isArray(parsed?.items) ? parsed.items : [],
          removedItems: Array.isArray(parsed?.removedItems) ? parsed.removedItems : [],
          orderNote: parsed?.orderNote || '',
          discount: parsed?.discount || null,
          currentUser: parsed?.currentUser || null,
        };
        this.syncGroupStateFromCart(cart);
        return cart;
      }
      const emptyCart = {
        items: [],
        removedItems: [],
        orderNote: '',
        discount: null,
        currentUser: null,
      };
      this.syncGroupStateFromCart(emptyCart);
      return emptyCart;
    } catch (error) {
      console.error('Error loading cart:', error);
      const emptyCart = {
        items: [],
        removedItems: [],
        orderNote: '',
        discount: null,
        currentUser: null,
      };
      this.syncGroupStateFromCart(emptyCart);
      return emptyCart;
    }
  }

  /**
   * Save cart to AsyncStorage
   */
  async saveCart(cart: Cart): Promise<void> {
    try {
      await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (error) {
      console.error('Error saving cart:', error);
    }
  }

  /**
   * Add item to cart or increment quantity if exists
   * Supports variants, attributes, and attribute values (POS_V2 pattern)
   */
  async addToCart(
    category: any,
    item: any,
    variant?: any,
    attribute?: any,
    attributeValues?: AttributeValue[],
    groupType?: number,
    groupLabel?: string
  ): Promise<Cart> {
    try {
      const prevGroupType = this.currentGroupIndex;
      const prevTempGroupIndex = this.tempGroupIndex;
      const prevTempNewGroup = this.tempNewGroup;
      const cart = await this.loadCart();
      const resolvedGroupType = groupType ?? this.currentGroupIndex ?? 1;
      const resolvedGroupLabel = groupLabel ?? this.tempNewGroupLabel;

      const cartItem: CartItem = {
        categoryId: category.id,
        categoryName: category.name,
        customId: item.customId || item.id,
        itemId: item.id,
        itemName: item.name,
        itemPrice: item.price,
        quantity: 1,
        discountItems: Array.isArray(item?.discountItems) ? item.discountItems : undefined,
        tax: category.tax,
        groupType: resolvedGroupType,
        groupLabel: resolvedGroupLabel || undefined,
      };
      if (item?.isExtraItem) {
        cartItem.isExtraItem = true;
      }
      if (item?.extraCategory !== undefined && item?.extraCategory !== null) {
        cartItem.extraCategory = item.extraCategory;
      }

      // Add variant if provided
      if (variant) {
        cartItem.variantId = variant.id;
        cartItem.variantName = variant.name;
        cartItem.variantPrice = variant.price ? parseFloat(variant.price) : 0;
      }

      // Add attribute if provided
      if (attribute) {
        cartItem.attributeId = attribute.id;
        cartItem.attributeName = attribute.name;
        cartItem.attributePrice = attribute.price ? parseFloat(attribute.price) : 0;
      }

      // Add attribute values if provided
      if (attributeValues && attributeValues.length > 0) {
        cartItem.attributeValues = attributeValues.map((av: any) => ({
          attributeValueId: av.id,
          attributeValueName: av.name,
          attributeValuePrice: parseFloat(av.price || 0),
          attributeValueQuantity: av.quantity || 1,
        }));
      }

      // Debug log
      console.log('CartService: Adding item to cart:', {
        itemName: cartItem.itemName,
        variantId: cartItem.variantId,
        variantName: cartItem.variantName,
        attributeId: cartItem.attributeId,
        attributeValues: cartItem.attributeValues,
      });

      // Generate cart ID like POS_V2 does
      cartItem.cartId = this.generateCartId(cartItem);

      // Check if item already exists with same cartId
      const existingIndex =
        Array.isArray(cartItem.discountItems) && cartItem.discountItems.length > 0
          ? this.checkDiscountItems(cart, cartItem)
          : cart.items.findIndex((i) => i.cartId === cartItem.cartId);

      if (existingIndex > -1) {
        // Item exists, increase quantity
        if (cart.items[existingIndex].isOld && cart.items[existingIndex].oldQuantity == null) {
          cart.items[existingIndex].oldQuantity = cart.items[existingIndex].quantity;
          cart.items[existingIndex].isOld = false;
        }
        cart.items[existingIndex].quantity += 1;
        this.reduceRemovedItems(cart, cart.items[existingIndex].cartId, 1);
        if (
          cart.items[existingIndex].oldQuantity != null &&
          cart.items[existingIndex].quantity === cart.items[existingIndex].oldQuantity
        ) {
          cart.items[existingIndex].isOld = true;
          delete cart.items[existingIndex].oldQuantity;
        }
      } else {
        // New item, add to front
        cart.items.unshift(cartItem);
        this.reduceRemovedItems(cart, cartItem.cartId, 1);
      }

      this.currentGroupIndex = resolvedGroupType;
      this.tempNewGroupLabel = resolvedGroupLabel || '';
      this.tempGroupIndex = prevTempGroupIndex;
      this.tempNewGroup = prevTempNewGroup;
      if (!this.tempGroupIndex && prevGroupType) {
        this.currentGroupIndex = resolvedGroupType || prevGroupType;
      }
      this.addGroup(resolvedGroupType, cart);
      await this.saveCart(cart);
      return cart;
    } catch (error) {
      console.error('Error adding to cart:', error);
      throw error;
    }
  }

  private checkDiscountItems(cart: Cart, cartItem: CartItem): number {
    let matchedIndex = -1;

    cart?.items?.forEach((item, index) => {
      if (item.itemId !== cartItem.itemId) return;
      if (JSON.stringify(item.discountItems || []) === JSON.stringify(cartItem.discountItems || [])) {
        matchedIndex = index;
      }
    });

    return matchedIndex;
  }

  /**
   * Update item quantity
   */
  async updateQuantity(cartId: string, quantity: number): Promise<Cart> {
    try {
      const cart = await this.loadCart();

      if (quantity <= 0) {
        return this.removeFromCart(cartId);
      }

      const item = cart.items.find((i) => i.cartId === cartId);
      if (item) {
        const prevQuantity = item.quantity;
        if (item.isOld && item.oldQuantity == null && quantity !== prevQuantity) {
          item.oldQuantity = prevQuantity;
          item.isOld = false;
        }
        item.quantity = quantity;
        if (quantity > prevQuantity) {
          this.reduceRemovedItems(cart, item.cartId, quantity - prevQuantity);
        }
        if (item.oldQuantity != null) {
          if (item.quantity === item.oldQuantity) {
            item.isOld = true;
            delete item.oldQuantity;
          } else {
            item.isOld = false;
          }
        }
      }

      await this.saveCart(cart);
      return cart;
    } catch (error) {
      console.error('Error updating quantity:', error);
      throw error;
    }
  }

  /**
   * Remove item from cart
   */
  async removeFromCart(cartId: string): Promise<Cart> {
    try {
      const cart = await this.loadCart();
      const existing = cart.items.find((i) => i.cartId === cartId);
      if (existing && (existing.isOld || existing.oldQuantity != null)) {
        const removedQty =
          existing.oldQuantity != null
            ? toNumber(existing.oldQuantity, 0)
            : toNumber(existing.quantity, 0);
        if (removedQty > 0) {
          if (!Array.isArray(cart.removedItems)) {
            cart.removedItems = [];
          }
          const removedIndex = cart.removedItems.findIndex(
            (item) => item.cartId === existing.cartId
          );
          if (removedIndex > -1) {
            cart.removedItems[removedIndex].quantity += removedQty;
          } else {
            cart.removedItems.push({
              ...existing,
              quantity: removedQty,
              isOld: false,
              oldQuantity: undefined,
            });
          }
        }
      }
      cart.items = cart.items.filter((i) => i.cartId !== cartId);
      if (cart.items.length === 0) {
        cart.orderNote = '';
        cart.discount = null;
      }
      await this.saveCart(cart);
      return cart;
    } catch (error) {
      console.error('Error removing from cart:', error);
      throw error;
    }
  }

  private reduceRemovedItems(cart: Cart, cartId?: string, deltaQty: number = 1) {
    if (!cartId || deltaQty <= 0) return;
    if (!Array.isArray(cart.removedItems) || cart.removedItems.length === 0) return;
    const index = cart.removedItems.findIndex((item) => item.cartId === cartId);
    if (index === -1) return;
    cart.removedItems[index].quantity = Math.max(
      0,
      toNumber(cart.removedItems[index].quantity, 0) - deltaQty,
    );
    if (cart.removedItems[index].quantity <= 0) {
      cart.removedItems.splice(index, 1);
    }
  }

  /**
   * Clear cart
   */
  async clearCart(): Promise<Cart> {
    try {
      const emptyCart: Cart = {
        items: [],
        removedItems: [],
        orderNote: '',
        discount: null,
        currentUser: null,
      };
      this.syncGroupStateFromCart(emptyCart);
      await this.saveCart(emptyCart);
      return emptyCart;
    } catch (error) {
      console.error('Error clearing cart:', error);
      throw error;
    }
  }

  /**
   * Get cart total
   */
  calculateTotal(cart: Cart): number {
    return cart.items.reduce((total, item) => {
      let itemTotal = item.itemPrice;

      if (item.variantPrice) {
        itemTotal += item.variantPrice;
      }

      if (item.attributeValues && item.attributeValues.length > 0) {
        item.attributeValues.forEach((attributeValue) => {
          const valuePrice =
            attributeValue.attributeValuePrice ??
            attributeValue.price ??
            attributeValue.unitPrice ??
            0;
          const valueQuantity =
            attributeValue.attributeValueQuantity ??
            attributeValue.quantity ??
            1;
          itemTotal += valuePrice * valueQuantity;
        });
      }

      return total + itemTotal * item.quantity;
    }, 0);
  }

  /**
   * Get cart item count
   */
  calculateItemCount(cart: Cart): number {
    return cart.items.reduce((count, item) => count + item.quantity, 0);
  }

  /**
   * Update item note in cart
   */
  async updateItemNote(cartId: string, note: string): Promise<Cart> {
    try {
      const cart = await this.loadCart();
      const item = cart.items.find((i) => i.cartId === cartId);
      if (item) {
        item.orderItemNote = note?.trim() || '';
      }

      await this.saveCart(cart);
      return cart;
    } catch (error) {
      console.error('Error updating item note:', error);
      throw error;
    }
  }

  /**
   * Update cart-level note
   */
  async updateOrderNote(note: string): Promise<Cart> {
    try {
      const cart = await this.loadCart();
      cart.orderNote = note?.trim() || '';
      await this.saveCart(cart);
      return cart;
    } catch (error) {
      console.error('Error updating cart note:', error);
      throw error;
    }
  }

  /**
   * Update cart-level discount
   */
  async updateDiscount(discount: CartDiscount | null): Promise<Cart> {
    try {
      const cart = await this.loadCart();
      cart.discount = discount;
      await this.saveCart(cart);
      return cart;
    } catch (error) {
      console.error('Error updating cart discount:', error);
      throw error;
    }
  }

  /**
   * Update selected customer in cart
   */
  async updateCurrentUser(currentUser: Customer | null): Promise<Cart> {
    try {
      const cart = await this.loadCart();
      cart.currentUser = currentUser;
      await this.saveCart(cart);
      return cart;
    } catch (error) {
      console.error('Error updating selected customer:', error);
      throw error;
    }
  }

  /**
   * Clear selected customer without touching cart items
   */
  async clearCurrentUser(): Promise<Cart> {
    return this.updateCurrentUser(null);
  }

  /**
   * Hydrate cart from an existing order (edit flow)
   */
  async setCartFromOrder(order: any): Promise<Cart> {
    try {
      const orderDetails = order?.orderDetails || {};
      const rawItems = Array.isArray(orderDetails?.orderItem)
        ? orderDetails.orderItem
        : [];

      const items: CartItem[] = rawItems.map((item: any, index: number) => {
        const variant =
          item?.orderItemVariant ||
          (Array.isArray(item?.orderItemVariants)
            ? item.orderItemVariants[0]
            : null);

        const variantAttributes = Array.isArray(
          variant?.orderItemVariantAttributes
        )
          ? variant.orderItemVariantAttributes
          : Array.isArray(variant?.menuItemVariantAttributes)
            ? variant.menuItemVariantAttributes
            : [];

        const attribute = variantAttributes[0];

        const attributeValuesRaw = Array.isArray(
          attribute?.orderItemVariantAttributeValues
        )
          ? attribute.orderItemVariantAttributeValues
          : Array.isArray(attribute?.menuItemVariantAttributeValues)
            ? attribute.menuItemVariantAttributeValues
            : Array.isArray(item?.attributeValues)
              ? item.attributeValues
              : [];

        const attributeValues: AttributeValue[] = attributeValuesRaw.map(
          (av: any) => ({
            attributeValueId:
              av?.menuItemVariantAttributeValueId ??
              av?.attributeValueId ??
              av?.id,
            attributeValueName:
              av?.menuItemVariantAttributeValue?.name ??
              av?.attributeValueName ??
              av?.name ??
              '',
            attributeValuePrice: toNumber(
              av?.unitPrice ??
                av?.attributeValuePrice ??
                av?.price ??
                av?.menuItemVariantAttributeValue?.price,
              0
            ),
            attributeValueQuantity: Math.max(
              toNumber(av?.quantity ?? av?.attributeValueQuantity, 1),
              1
            ),
          })
        );

        const cartItem: CartItem = {
          categoryId: item.categoryId ?? item.menuCategoryId ?? item.category?.id ?? 0,
          categoryName:
            item.categoryName ??
            item.menuCategoryName ??
            item.category?.name ??
            '',
          customId: toNumber(item.customId ?? item.customID ?? item.customId, 0),
          itemId: item.menuItemId ?? item.itemId ?? item.id ?? 0,
          itemName: item.itemName ?? item.name ?? '',
          itemPrice: toNumber(item.itemPrice ?? item.unitPrice ?? item.price, 0),
          quantity: Math.max(toNumber(item.quantity, 1), 1),
          orderItemNote: item.orderItemNote ?? item.note ?? '',
          discountItems: Array.isArray(item?.discountItems) ? item.discountItems : undefined,
          tax: item.tax ?? item.taxInfo ?? item.taxObj ?? null,
          groupType: item.groupType ?? 0,
          groupLabel: item.groupLabel ?? '',
          isOld: true,
        };
        if (item?.isExtraItem) {
          cartItem.isExtraItem = true;
        }
        if (item?.extraCategory !== undefined && item?.extraCategory !== null) {
          cartItem.extraCategory = item.extraCategory;
        }

        if (variant) {
          cartItem.variantId =
            variant?.menuItemVariantId ?? variant?.id ?? item.variantId;
          cartItem.variantName =
            variant?.name ?? item.variantName ?? '';
          cartItem.variantPrice = toNumber(
            variant?.unitPrice ?? variant?.price ?? item.variantPrice,
            0
          );
        }

        if (attribute) {
          cartItem.attributeId =
            attribute?.menuItemVariantAttributeId ??
            attribute?.attributeId ??
            attribute?.id ??
            item.attributeId;
          cartItem.attributeName =
            attribute?.menuItemVariantAttribute?.name ??
            attribute?.attributeName ??
            attribute?.name ??
            item.attributeName ??
            '';
          cartItem.attributePrice = toNumber(
            attribute?.unitPrice ?? attribute?.price ?? item.attributePrice,
            0
          );
        }

        if (attributeValues.length > 0) {
          cartItem.attributeValues = attributeValues;
        }

        cartItem.cartId = item.cartId || this.generateCartId(cartItem);
        return cartItem;
      });

      const cart: Cart = {
        items,
        removedItems: [],
        orderNote: orderDetails?.orderNotes || '',
        discount: normalizeDiscountFromOrder(orderDetails?.discount),
        currentUser: resolveOrderCustomer(orderDetails),
      };

      this.syncGroupStateFromCart(cart);
      await this.saveCart(cart);
      return cart;
    } catch (error) {
      console.error('Error hydrating cart from order:', error);
      throw error;
    }
  }

  /**
   * Generate cart ID matching POS_V2 logic
   * Includes: categoryId, itemId, itemName, itemPrice, variantId, attributeId, 
   * attributeValues, groupType, groupLabel, orderItemNote
   */
  private generateCartId(item: CartItem): string {
    let combination = `${item.categoryId}-${item.itemId}-${item.itemName}-${item.itemPrice}`;

    if (item.variantId) combination += `-${item.variantId}`;
    if (item.attributeId) combination += `-${item.attributeId}`;

    if (item.attributeValues && item.attributeValues.length > 0) {
      item.attributeValues.forEach((av: any) => {
        combination += `-${av.attributeValueId || av.id}`;
      });
    }

    if (item.groupType) combination += `-${item.groupType}`;
    if (item.groupLabel) combination += `-${item.groupLabel}`;
    if (item.orderItemNote && item.orderItemNote !== '')
      combination += `-${item.orderItemNote}`;

    // Simple hash function instead of UUID v5
    return this.simpleHash(combination);
  }

  /**
   * Simple hash function for cart ID (React Native doesn't have uuid easily)
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `cart_${Math.abs(hash).toString(16)}`;
  }

  getUniqueGroupLabels(cart: Cart): string[] {
    const labels = cart?.items
      ?.map((item) => item.groupLabel)
      .filter((label): label is string => !!label) || [];
    if (this.tempNewGroupLabel) labels.push(this.tempNewGroupLabel);
    return Array.from(new Set(labels));
  }

  setGroupIndexByLabel(groupLabel: string, cart: Cart) {
    this.tempNewGroupLabel = groupLabel;
    const existingGroup = cart?.items?.find(
      (cartItem) => cartItem.groupLabel === groupLabel
    );

    if (existingGroup) {
      this.currentGroupIndex = existingGroup.groupType || 1;
      return;
    }

    const maxGroupType =
      cart?.items?.reduce(
        (max, cartItem) => Math.max(max, cartItem.groupType || 0),
        0
      ) || 0;
    this.currentGroupIndex = maxGroupType + 1;
    this.tempNewGroup = this.currentGroupIndex;
  }

  startNewGroup(cart: Cart, groupLabel = '') {
    const maxGroupType =
      cart?.items?.reduce(
        (max, cartItem) => Math.max(max, cartItem.groupType || 0),
        0
      ) || 0;
    this.currentGroupIndex = maxGroupType + 1;
    this.tempNewGroup = this.currentGroupIndex;
    this.tempGroupIndex = true;
    this.tempNewGroupLabel = groupLabel;
  }

  setActiveGroup(groupType: number, groupLabel = '') {
    this.currentGroupIndex = groupType || 1;
    this.tempNewGroup = this.currentGroupIndex;
    this.tempGroupIndex = false;
    this.tempNewGroupLabel = groupLabel;
  }

  useTempGroupIfAvailable() {
    if (this.tempGroupIndex && this.tempNewGroup >= 1) {
      this.currentGroupIndex = this.tempNewGroup;
      return true;
    }
    return false;
  }

  syncGroupStateFromCart(cart: Cart) {
    if (!cart?.items?.length) {
      this.resetGroupState();
      return;
    }
    if (this.tempGroupIndex || this.tempNewGroupLabel) {
      return;
    }

    const lastItem = cart.items[cart.items.length - 1];
    const groupType = lastItem?.groupType || 1;
    this.currentGroupIndex = groupType;
    this.tempNewGroup = groupType;
    this.tempGroupIndex = false;
    this.tempNewGroupLabel = lastItem?.groupLabel || '';
  }

  private addGroup(groupIndex: number, cart: Cart) {
    if (cart?.items?.[cart.items.length - 1]?.groupType === undefined) {
      cart.items.forEach((item) => {
        item.groupType = 1;
      });
    } else {
      cart.items.forEach((item) => {
        if (item?.groupType === undefined) {
          item.groupType = groupIndex;
          if (this.tempNewGroupLabel) {
            item.groupLabel = this.tempNewGroupLabel;
          }
        }

        if (item.groupType === this.tempNewGroup) {
          this.tempGroupIndex = false;
        }
      });
    }

    cart.items.sort((a, b) => (a.groupType || 0) - (b.groupType || 0));
    this.addGroupLabel(cart);
  }

  private addGroupLabel(cart: Cart) {
    if (cart.items.length > 1) {
      for (let i = 0; i < cart.items.length - 1; i++) {
        const currentItem = cart.items[i];
        const nextItem = cart.items[i + 1];

        if (currentItem?.groupType === nextItem?.groupType) {
          currentItem.groupLabel = nextItem?.groupLabel;
        }
      }
    }
  }
}

export default new CartService();
