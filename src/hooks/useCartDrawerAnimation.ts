import { useState, useEffect, useRef } from 'react';
import { Animated, BackHandler } from 'react-native';

/**
 * Hook for managing cart drawer slide animations
 */
export const useCartDrawerAnimation = (cartDrawerWidth: number) => {
  const [showCart, setShowCart] = useState(false);
  
  const cartDrawerTranslateAnim = useRef(new Animated.Value(cartDrawerWidth)).current;
  const cartDrawerBackdropAnim = useRef(new Animated.Value(0)).current;
  const isCartDrawerAnimatingRef = useRef(false);

  const openCartDrawer = () => {
    if (showCart || isCartDrawerAnimatingRef.current) return;

    setShowCart(true);
    requestAnimationFrame(() => {
      cartDrawerTranslateAnim.stopAnimation();
      cartDrawerBackdropAnim.stopAnimation();
      cartDrawerTranslateAnim.setValue(cartDrawerWidth);
      cartDrawerBackdropAnim.setValue(0);

      isCartDrawerAnimatingRef.current = true;
      Animated.parallel([
        Animated.timing(cartDrawerTranslateAnim, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(cartDrawerBackdropAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        isCartDrawerAnimatingRef.current = false;
      });
    });
  };

  const closeCartDrawer = () => {
    if (!showCart || isCartDrawerAnimatingRef.current) return;

    isCartDrawerAnimatingRef.current = true;
    Animated.parallel([
      Animated.timing(cartDrawerTranslateAnim, {
        toValue: cartDrawerWidth,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.timing(cartDrawerBackdropAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      isCartDrawerAnimatingRef.current = false;
      setShowCart(false);
    });
  };

  const toggleCartDrawer = () => {
    if (showCart) {
      closeCartDrawer();
      return;
    }
    openCartDrawer();
  };

  // Handle hardware back button
  useEffect(() => {
    if (!showCart) return;

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      closeCartDrawer();
      return true;
    });

    return () => backHandler.remove();
  }, [showCart]);

  return {
    showCart,
    setShowCart,
    cartDrawerTranslateAnim,
    cartDrawerBackdropAnim,
    openCartDrawer,
    closeCartDrawer,
    toggleCartDrawer,
  };
};
