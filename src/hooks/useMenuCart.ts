import { useState, useEffect, useMemo } from 'react';
import cartService, { Cart, CartItem, AttributeValue } from '../services/cartService';
import { getCartItemQuantity } from '../utils/cartCalculations';
import { MenuCategory, MenuItem } from './useMenuData';

/**
 * Hook for managing cart operations
 */
export const useMenuCart = () => {
  const [cart, setCart] = useState<Cart>({ items: [], orderNote: '', discount: null });

  /**
   * Load cart from AsyncStorage using CartService
   */
  const loadCart = async () => {
    try {
      const loadedCart = await cartService.loadCart();
      setCart(loadedCart);
    } catch (error) {
      console.error('useMenuCart: Error loading cart:', error);
    }
  };

  useEffect(() => {
    loadCart();
  }, []);

  const cartQuantity = useMemo(
    () =>
      cart.items.reduce(
        (sum, item) => sum + getCartItemQuantity(item),
        0
      ),
    [cart.items]
  );

  /**
   * Add item to cart with variant and attribute options
   */
  const addToCartDirect = async (
    category: MenuCategory,
    item: MenuItem,
    variant: any,
    attribute: any,
    attributeValues?: AttributeValue[]
  ) => {
    try {
      console.log('useMenuCart: addToCartDirect called:', { itemName: item.name });
      const groupType = cartService.currentGroupIndex;
      const groupLabel = cartService.tempNewGroupLabel;
      const updatedCart = await cartService.addToCart(
        category,
        item,
        variant,
        attribute,
        attributeValues,
        groupType,
        groupLabel
      );
      setCart(updatedCart);
    } catch (error) {
      console.error('useMenuCart: Error adding to cart:', error);
      throw error;
    }
  };

  /**
   * Update item quantity
   */
  const updateQuantity = async (cartId: string, quantity: number) => {
    try {
      if (quantity <= 0) {
        await removeFromCart(cartId);
        return;
      }
      const updatedCart = await cartService.updateQuantity(cartId, quantity);
      setCart(updatedCart);
    } catch (error) {
      console.error('useMenuCart: Error updating quantity:', error);
      throw error;
    }
  };

  /**
   * Remove item from cart
   */
  const removeFromCart = async (cartId: string) => {
    try {
      const updatedCart = await cartService.removeFromCart(cartId);
      setCart(updatedCart);
    } catch (error) {
      console.error('useMenuCart: Error removing from cart:', error);
      throw error;
    }
  };

  /**
   * Update item note
   */
  const updateItemNote = async (cartId: string, note: string) => {
    try {
      const updated = await cartService.updateItemNote(cartId, note);
      setCart(updated);
    } catch (error) {
      console.error('useMenuCart: Error saving item note:', error);
      throw error;
    }
  };

  /**
   * Update order note
   */
  const updateOrderNote = async (note: string) => {
    try {
      const updatedCart = await cartService.updateOrderNote(note);
      setCart(updatedCart);
    } catch (error) {
      console.error('useMenuCart: Error saving order note:', error);
      throw error;
    }
  };

  /**
   * Update discount
   */
  const updateDiscount = async (discount: any) => {
    try {
      const updatedCart = await cartService.updateDiscount(discount);
      setCart(updatedCart);
    } catch (error) {
      console.error('useMenuCart: Error saving discount:', error);
      throw error;
    }
  };

  return {
    cart,
    setCart,
    cartQuantity,
    loadCart,
    addToCartDirect,
    updateQuantity,
    removeFromCart,
    updateItemNote,
    updateOrderNote,
    updateDiscount,
  };
};
