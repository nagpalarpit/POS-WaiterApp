import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Cart } from '../../services/cartService';
import {
    getCartSubtotal,
    getDiscountAmount,
    getDiscountLabel,
    getDiscountTypeLabel,
} from '../../utils/cartCalculations';
import { formatCurrency } from '../../utils/currency';

interface CartSummaryProps {
    cart: Cart;
    cartQuantity: number;
    onCheckout: () => void;
    onEditOrderMeta: () => void;
    onAddGroup?: () => void;
    showAddGroup?: boolean;
    colors: any;
    isOrderNoteOrDiscountPresent: boolean;
}

/**
 * Cart summary footer with totals and checkout button
 */
export const CartSummary: React.FC<CartSummaryProps> = ({
    cart,
    cartQuantity,
    onCheckout,
    onEditOrderMeta,
    onAddGroup,
    showAddGroup = false,
    colors,
    isOrderNoteOrDiscountPresent = true,
}) => {
    const insets = useSafeAreaInsets();
    const subtotal = getCartSubtotal(cart);
    const discount = getDiscountAmount(subtotal, cart.discount);
    const total = Math.max(subtotal - discount, 0);

    return (
        <View
            style={{
                paddingHorizontal: 12,
                paddingTop: 16,
                paddingBottom: 16 + Math.max(insets.bottom, 24),
                borderTopWidth: 1,
                borderTopColor: colors.border,
                backgroundColor: colors.background,
            }}
        >
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" scrollEnabled={false}>
                {/* Order Note */}
                {cart.orderNote ? (
                    <View
                        style={{
                            marginBottom: 12,
                            paddingHorizontal: 10,
                            paddingVertical: 10,
                            backgroundColor: colors.surface,
                            borderRadius: 10,
                            borderLeftWidth: 3,
                            borderLeftColor: colors.primary,
                        }}
                    >
                        <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600' }}>
                            Cart Note
                        </Text>
                        <Text style={{ fontSize: 13, marginTop: 4, color: colors.text, lineHeight: 18 }}>
                            {cart.orderNote}
                        </Text>
                    </View>
                ) : null}

                {/* Discount */}
                {cart.discount ? (
                    <View
                        style={{
                            marginBottom: 12,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            backgroundColor: colors.success + '10',
                            borderRadius: 10,
                            borderLeftWidth: 3,
                            borderLeftColor: colors.success,
                        }}
                    >
                        <Text style={{ fontSize: 12, color: colors.success, fontWeight: '600' }}>
                            ✓ Discount Applied: {cart.discount.discountName || getDiscountTypeLabel(cart.discount.discountType)} ({getDiscountLabel(cart.discount)})
                        </Text>
                    </View>
                ) : null}

                {/* Pricing Breakdown */}
                <View style={{ marginBottom: 16, gap: 7 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 14, color: colors.textSecondary }}>Subtotal</Text>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
                            {formatCurrency(subtotal)}
                        </Text>
                    </View>

                    {discount > 0 && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 14, color: colors.textSecondary }}>Discount</Text>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.error }}>
                                {formatCurrency(-discount)}
                            </Text>
                        </View>
                    )}

                    <View
                        style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            paddingTop: 10,
                            borderTopWidth: 1,
                            borderTopColor: colors.border,
                        }}
                    >
                        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                            Total
                        </Text>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.primary }}>
                            {formatCurrency(total)}
                        </Text>
                    </View>
                </View>

                {
                    isOrderNoteOrDiscountPresent && (
                        <TouchableOpacity
                            onPress={onEditOrderMeta}
                            style={{
                                borderWidth: 1,
                                borderColor: colors.border,
                                borderRadius: 10,
                                paddingVertical: 10,
                                paddingHorizontal: 12,
                                marginBottom: 12,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: colors.surface,
                            }}
                        >
                            <MaterialCommunityIcons name="note-edit-outline" size={16} color={colors.text} />
                            <Text style={{ color: colors.text, fontWeight: '600', marginLeft: 6, fontSize: 12 }}>
                                Add Order Note / Discount
                            </Text>
                        </TouchableOpacity>
                    )
                }

                {showAddGroup && (
                    <TouchableOpacity
                        onPress={onAddGroup}
                        style={{
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: 10,
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            marginBottom: 12,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: colors.surface,
                        }}
                    >
                        <MaterialCommunityIcons name="layers-plus" size={16} color={colors.text} />
                        <Text style={{ color: colors.text, fontWeight: '600', marginLeft: 6, fontSize: 12 }}>
                            Add Group
                        </Text>
                    </TouchableOpacity>
                )}
            </ScrollView>

            {/* Checkout Button */}
            <TouchableOpacity
                onPress={onCheckout}
                style={{
                    backgroundColor: colors.primary,
                    borderRadius: 12,
                    paddingVertical: 13,
                    paddingHorizontal: 12,
                    shadowColor: colors.primary,
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    elevation: 4,
                }}
            >
                <Text
                    style={{
                        textAlign: 'center',
                        fontWeight: '800',
                        fontSize: 13,
                        color: colors.textInverse,
                        letterSpacing: 0.3,
                    }}
                >
                    Continue to Checkout ({cartQuantity} {cartQuantity === 1 ? 'item' : 'items'})
                </Text>
            </TouchableOpacity>
        </View>
    );
};
