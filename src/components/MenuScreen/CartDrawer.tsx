import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { useMenuCart } from '../../hooks/useMenuCart';
import { useCartNotes } from '../../hooks/useCartNotes';
import { useToast } from '../ToastProvider';
import { useConnection } from '../../contexts/ConnectionProvider';
import cartService from '../../services/cartService';
import { CartItemRow } from './CartItemRow';
import { CartSummary } from './CartSummary';
import ItemNoteModal from '../ItemNoteModal';
import CartNoteModal from '../CartNoteModal';
import PinModal from '../PinModal';
import {
    getCartSubtotal,
    getDiscountAmount,
    getCartItemQuantity,
} from '../../utils/cartCalculations';
import { formatCurrency } from '../../utils/currency';

type CartRouteParams = {
    tableNo?: number;
    deliveryType: number;
    existingOrder?: any;
    tableArea?: any;
};

/**
 * Cart screen - full page flow (formerly drawer)
 */
export default function CartScreen({ navigation, route }: any) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { showToast } = useToast();
    const { canModifyOrders } = useConnection();
    const params: CartRouteParams = route?.params || {};
    const {
        tableNo = null,
        deliveryType = 0,
        tableArea = null,
        existingOrder = null,
    } = params;

    const cartData = useMenuCart();
    const cartNotes = useCartNotes(
        cartData.cart,
        cartData.updateItemNote,
        cartData.updateDiscount,
    );

    const subtotal = getCartSubtotal(cartData.cart);
    const discount = getDiscountAmount(subtotal, cartData.cart.discount);
    const total = Math.max(subtotal - discount, 0);

    const { groupedItems, sortedGroupTypes, latestGroupType } = useMemo(() => {
        const groups = cartData.cart.items.reduce(
            (acc: Record<number, typeof cartData.cart.items>, item) => {
                const groupType = item.groupType || 1;
                if (!acc[groupType]) acc[groupType] = [];
                acc[groupType].push(item);
                return acc;
            },
            {},
        );
        const types = Object.keys(groups)
            .map((key) => Number(key))
            .sort((a, b) => a - b);
        const latest = types.length > 0 ? types[types.length - 1] : null;
        return { groupedItems: groups, sortedGroupTypes: types, latestGroupType: latest };
    }, [cartData.cart.items]);

    const groupCount = sortedGroupTypes.length;
    const [expandedGroupType, setExpandedGroupType] = useState<number | null>(
        latestGroupType ?? null,
    );

    useEffect(() => {
        if (!groupCount) {
            setExpandedGroupType(null);
            return;
        }
        setExpandedGroupType(latestGroupType ?? null);
    }, [groupCount, latestGroupType]);

    const [decreasePinChecked, setDecreasePinChecked] = useState(false);
    const [pinModalVisible, setPinModalVisible] = useState(false);
    const pendingDecreaseRef = useRef<
        { type: 'update' | 'remove'; cartId: string; quantity?: number } | null
    >(null);

    useLayoutEffect(() => {
        navigation.setOptions({
            headerTitle: 'Order Summary',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '700' },
        });
    }, [navigation, colors]);

    const ensureCanModify = (message?: string) => {
        if (canModifyOrders) return true;
        showToast('error', message || 'Local server is offline. Orders are view-only.');
        return false;
    };

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

    const handleSelectGroup = (groupType: number, groupLabel?: string) => {
        cartService.setActiveGroup(groupType, groupLabel || '');
    };

    const proceedToCheckout = async () => {
        if (!ensureCanModify()) return;
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
        });
    };

    const footerHeight = 88;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
            >
                <View style={{ flex: 1 }}>
                    {/* Header */}
                    <View
                        style={{
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            backgroundColor: colors.background,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.border,
                        }}
                    >
                        <View
                            style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <TouchableOpacity
                                onPress={() => navigation.goBack()}
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 10,
                                    backgroundColor: colors.surfaceHover,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                }}
                            >
                                <MaterialIcons name="arrow-back" size={20} color={colors.text} />
                            </TouchableOpacity>
                            <View
                                style={{
                                    flex: 1,
                                    alignItems: 'center',
                                    marginHorizontal: 12,
                                }}
                            >
                                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                                    Order Summary
                                </Text>
                                <Text
                                    style={{
                                        fontSize: 12,
                                        color: colors.textSecondary,
                                        marginTop: 2,
                                    }}
                                >
                                    {cartData.cartQuantity}{' '}
                                    {cartData.cartQuantity === 1 ? 'item' : 'items'} -{' '}
                                    {formatCurrency(total)}
                                </Text>
                            </View>
                            <View
                                style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 10,
                                    backgroundColor: colors.primary + '15',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                }}
                            >
                                <MaterialCommunityIcons name="cart" size={18} color={colors.primary} />
                            </View>
                        </View>
                    </View>

                    {/* Cart Items or Empty State */}
                    {cartData.cart.items.length > 0 ? (
                        <ScrollView
                            style={{ flex: 1 }}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={{
                                paddingHorizontal: 12,
                                paddingVertical: 12,
                                paddingBottom: insets.bottom + footerHeight,
                            }}
                            scrollIndicatorInsets={{ right: 4 }}
                        >
                            {sortedGroupTypes.map((groupType) => {
                                const items = groupedItems[groupType] || [];
                                const label =
                                    items.find((item) => item.groupLabel)?.groupLabel ||
                                    `Gange ${groupType}`;
                                const isExpanded = groupCount <= 1 || expandedGroupType === groupType;
                                return (
                                    <View key={`group-${groupType}`} style={{ marginBottom: 14 }}>
                                        <TouchableOpacity
                                            onPress={() => {
                                                if (groupCount > 1) {
                                                    setExpandedGroupType(groupType);
                                                }
                                                handleSelectGroup(groupType, label);
                                            }}
                                            style={{
                                                paddingHorizontal: 12,
                                                paddingVertical: 8,
                                                borderRadius: 10,
                                                borderWidth: 1,
                                                borderColor: colors.border,
                                                backgroundColor: colors.surfaceHover || colors.surface,
                                                marginBottom: 8,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                            }}
                                        >
                                            <Text style={{ color: colors.text, fontWeight: '700' }}>
                                                {label}
                                            </Text>
                                            {groupCount > 1 ? (
                                                <MaterialCommunityIcons
                                                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                                    size={18}
                                                    color={colors.textSecondary}
                                                />
                                            ) : null}
                                        </TouchableOpacity>
                                        {isExpanded
                                            ? items.map((item) => (
                                                <View
                                                    key={item.cartId}
                                                    style={{
                                                        marginBottom: 12,
                                                        borderRadius: 12,
                                                        backgroundColor: colors.surface,
                                                        borderWidth: 1,
                                                        borderColor: colors.border,
                                                        overflow: 'hidden',
                                                    }}
                                                >
                                                    <CartItemRow
                                                        item={item}
                                                        onOpenNoteModal={(noteItem) =>
                                                            cartNotes.openItemNoteModal(
                                                                noteItem.cartId || '',
                                                                noteItem.orderItemNote || '',
                                                            )
                                                        }
                                                        onUpdateQuantity={handleUpdateQuantity}
                                                        onRemoveItem={handleRemoveItem}
                                                        colors={colors}
                                                    />
                                                </View>
                                            ))
                                            : null}
                                    </View>
                                );
                            })}

                            {/* Cart Summary (without checkout button) */}
                            <CartSummary
                                cart={cartData.cart}
                                cartQuantity={cartData.cartQuantity}
                                onEditOrderMeta={() => {
                                    if (!ensureCanModify()) return;
                                    cartNotes.setShowCartNoteModal(true);
                                }}
                                onCheckout={proceedToCheckout}
                                colors={colors}
                                isOrderNoteOrDiscountPresent={false}
                                showCheckout={false}
                            />
                        </ScrollView>
                    ) : (
                        /* Empty State */
                        <View
                            style={{
                                flex: 1,
                                justifyContent: 'center',
                                alignItems: 'center',
                                paddingHorizontal: 24,
                            }}
                        >
                            <View
                                style={{
                                    width: 80,
                                    height: 80,
                                    borderRadius: 40,
                                    backgroundColor: colors.primary + '10',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    marginBottom: 24,
                                }}
                            >
                                <MaterialCommunityIcons
                                    name="cart-outline"
                                    size={36}
                                    color={colors.primary}
                                />
                            </View>
                            <Text
                                style={{
                                    fontSize: 18,
                                    fontWeight: '700',
                                    color: colors.text,
                                    textAlign: 'center',
                                    marginBottom: 8,
                                }}
                            >
                                Cart is Empty
                            </Text>
                            <Text
                                style={{
                                    fontSize: 14,
                                    color: colors.textSecondary,
                                    textAlign: 'center',
                                    lineHeight: 20,
                                }}
                            >
                                Add items from the menu to get started
                            </Text>
                            <View
                                style={{
                                    marginTop: 28,
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                    borderRadius: 8,
                                    backgroundColor: colors.primary + '08',
                                }}
                            >
                                <Text
                                    style={{
                                        fontSize: 12,
                                        color: colors.primary,
                                        fontWeight: '600',
                                        textAlign: 'center',
                                    }}
                                >
                                    Tap on items to add them
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* Fixed Checkout Button */}
                    <View
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            bottom: 0,
                            paddingHorizontal: 12,
                            paddingTop: 12,
                            paddingBottom: insets.bottom,
                            borderTopWidth: 1,
                            borderTopColor: colors.border,
                            backgroundColor: colors.background,
                        }}
                    >
                        <TouchableOpacity
                            onPress={proceedToCheckout}
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
                                Continue to Checkout ({cartData.cartQuantity}{' '}
                                {cartData.cartQuantity === 1 ? 'item' : 'items'})
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>

            <ItemNoteModal
                visible={cartNotes.showItemNoteModal}
                initialNote={cartNotes.itemNoteDraft}
                onClose={() => cartNotes.setShowItemNoteModal(false)}
                onSave={cartNotes.saveItemNoteModal}
            />

            <CartNoteModal
                visible={cartNotes.showCartNoteModal}
                initialNote={cartData.cart.orderNote || ''}
                initialDiscount={cartData.cart.discount || null}
                onClose={() => cartNotes.setShowCartNoteModal(false)}
                onSave={async (note: string, discount: any) => {
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
                }}
            />

            <PinModal
                visible={pinModalVisible}
                onClose={() => {
                    setPinModalVisible(false);
                    pendingDecreaseRef.current = null;
                }}
                onVerified={handlePinVerified}
            />
        </SafeAreaView>
    );
}
