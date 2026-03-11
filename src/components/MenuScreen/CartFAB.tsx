import React from 'react';
import { View, TouchableOpacity, Animated } from 'react-native';
import { Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface CartFABProps {
  cartQuantity: number;
  totalAmount: number;
  onPress: () => void;
  scaleAnim: Animated.Value;
  badgeScaleAnim: Animated.Value;
  colors: any;
}

/**
 * Floating action button for cart
 */
export const CartFAB: React.FC<CartFABProps> = ({
  cartQuantity,
  totalAmount,
  onPress,
  scaleAnim,
  badgeScaleAnim,
  colors,
}) => {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 22 + insets.bottom,
        right: 16,
        transform: [{ scale: scaleAnim }],
        elevation: 8,
        overflow: 'visible',
      }}
    >
      <View style={{ position: 'relative' }}>
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.9}
          style={{
            backgroundColor: colors.primary,
            borderWidth: 1.5,
            borderColor: `${colors.textInverse}22`,
            height: 58,
            minWidth: 58,
            paddingHorizontal: 14,
            borderRadius: 16,
            flexDirection: 'row',
            alignItems: 'center',
            shadowColor: colors.primary,
            shadowOpacity: 0.24,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 3 },
          }}
        >
          <MaterialCommunityIcons name="cart-outline" size={23} color={colors.textInverse || '#fff'} />
        </TouchableOpacity>
        {cartQuantity > 0 && (
          <Animated.View
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              minWidth: 30,
              height: 30,
              borderRadius: 15,
              paddingHorizontal: 8,
              backgroundColor: colors.error,
              borderWidth: 2,
              borderColor: colors.surface,
              justifyContent: 'center',
              alignItems: 'center',
              transform: [{ scale: badgeScaleAnim }],
            }}
          >
            <Text style={{ color: colors.textInverse || '#fff', fontSize: 12, fontWeight: '700', lineHeight: 14 }}>
              {cartQuantity > 99 ? '99+' : cartQuantity}
            </Text>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
};
