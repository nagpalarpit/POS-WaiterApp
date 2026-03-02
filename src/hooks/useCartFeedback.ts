import { useEffect, useRef } from 'react';
import { Animated, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Hook for managing haptic feedback and animations when items are added to cart
 */
export const useCartFeedback = () => {
  const cartFabScaleAnim = useRef(new Animated.Value(1)).current;
  const cartBadgeScaleAnim = useRef(new Animated.Value(1)).current;
  const previousCartQuantityRef = useRef<number | null>(null);

  const triggerCartAddedFeedback = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
      Vibration.vibrate(10);
    });

    Animated.parallel([
      Animated.sequence([
        Animated.timing(cartFabScaleAnim, {
          toValue: 1.1,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.spring(cartFabScaleAnim, {
          toValue: 1,
          friction: 5,
          tension: 180,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(cartBadgeScaleAnim, {
          toValue: 1.2,
          duration: 110,
          useNativeDriver: true,
        }),
        Animated.spring(cartBadgeScaleAnim, {
          toValue: 1,
          friction: 5,
          tension: 180,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  };

  const trackQuantityChange = (currentQuantity: number) => {
    useEffect(() => {
      const previousQuantity = previousCartQuantityRef.current;
      if (previousQuantity === null) {
        previousCartQuantityRef.current = currentQuantity;
        return;
      }

      if (currentQuantity > previousQuantity) {
        triggerCartAddedFeedback();
      }

      previousCartQuantityRef.current = currentQuantity;
    }, [currentQuantity]);
  };

  return {
    cartFabScaleAnim,
    cartBadgeScaleAnim,
    triggerCartAddedFeedback,
    trackQuantityChange,
  };
};
