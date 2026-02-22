import AsyncStorage from '@react-native-async-storage/async-storage';

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

export type CartDiscountType = 'PERCENTAGE' | 'FLAT';

export interface CartDiscount {
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
  
  // Group & Order info
  tax?: any;
  groupType: number;
  groupLabel?: string;
  isOld?: boolean;
  oldQuantity?: number;
}

export interface Cart {
  items: CartItem[];
  orderNote?: string;
  discount?: CartDiscount | null;
}

const CART_STORAGE_KEY = 'cart';

class CartService {
  /**
   * Load cart from AsyncStorage
   */
  async loadCart(): Promise<Cart> {
    try {
      const cartData = await AsyncStorage.getItem(CART_STORAGE_KEY);
      if (cartData) {
        const parsed = JSON.parse(cartData);
        return {
          items: Array.isArray(parsed?.items) ? parsed.items : [],
          orderNote: parsed?.orderNote || '',
          discount: parsed?.discount || null,
        };
      }
      return { items: [], orderNote: '', discount: null };
    } catch (error) {
      console.error('Error loading cart:', error);
      return { items: [], orderNote: '', discount: null };
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
    attributeValues?: AttributeValue[]
  ): Promise<Cart> {
    try {
      const cart = await this.loadCart();

      const cartItem: CartItem = {
        categoryId: category.id,
        categoryName: category.name,
        customId: item.customId || item.id,
        itemId: item.id,
        itemName: item.name,
        itemPrice: item.price,
        quantity: 1,
        tax: category.tax,
        groupType: 0,
      };

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
      const existingIndex = cart.items.findIndex(
        (i) => i.cartId === cartItem.cartId
      );

      if (existingIndex > -1) {
        // Item exists, increase quantity
        cart.items[existingIndex].quantity += 1;
      } else {
        // New item, add to front
        cart.items.unshift(cartItem);
      }

      await this.saveCart(cart);
      return cart;
    } catch (error) {
      console.error('Error adding to cart:', error);
      throw error;
    }
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
        item.quantity = quantity;
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

  /**
   * Clear cart
   */
  async clearCart(): Promise<Cart> {
    try {
      const emptyCart: Cart = { items: [], orderNote: '', discount: null };
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

      if (item.attributePrice) {
        itemTotal += item.attributePrice;
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
}

export default new CartService();
