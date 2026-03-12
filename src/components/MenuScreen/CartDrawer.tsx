import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    Modal,
    Animated,
    Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Cart } from '../../services/cartService';
import { CartItemRow } from './CartItemRow';
import { CartSummary } from './CartSummary';
import {
    getCartSubtotal,
    getDiscountAmount,
} from '../../utils/cartCalculations';
import { formatCurrency } from '../../utils/currency';

interface CartDrawerProps {
    visible: boolean;
    cart: Cart;
    cartQuantity: number;
    cartDrawerWidth: number;
    cartDrawerTranslateAnim: Animated.Value;
    cartDrawerBackdropAnim: Animated.Value;

    // Item note editing
    editingItemNoteId: string | null;
    itemNoteDraft: string;
    onItemNoteDraftChange: (text: string) => void;
    onOpenItemNoteModal: (item: any) => void;
    onCancelItemNoteEdit: () => void;
    onSaveItemNote: () => void;

    // Cart operations
    onUpdateQuantity: (cartId: string, quantity: number) => void;
    onRemoveItem: (cartId: string) => void;
    onEditOrderMeta: () => void;
    onAddGroup?: () => void;
    showAddGroup?: boolean;
    onSelectGroup?: (groupType: number, groupLabel?: string) => void;
    onCheckout: () => void;
    onClose: () => void;

    colors: any;
}

/**
 * Cart drawer component - slide-in drawer from the right
 */
export const CartDrawer: React.FC<CartDrawerProps> = ({
    visible,
    cart,
    cartQuantity,
    cartDrawerWidth,
    cartDrawerTranslateAnim,
    cartDrawerBackdropAnim,
    editingItemNoteId,
    itemNoteDraft,
    onItemNoteDraftChange,
    onOpenItemNoteModal,
    onCancelItemNoteEdit,
    onSaveItemNote,
    onUpdateQuantity,
    onRemoveItem,
    onEditOrderMeta,
    onAddGroup,
    showAddGroup,
    onSelectGroup,
    onCheckout,
    onClose,
    colors,
}) => {
    const subtotal = getCartSubtotal(cart);
    const discount = getDiscountAmount(subtotal, cart.discount);
    const total = Math.max(subtotal - discount, 0);
    const { groupedItems, sortedGroupTypes, latestGroupType } = useMemo(() => {
        const groups = cart.items.reduce((acc: Record<number, Cart['items']>, item) => {
            const groupType = item.groupType || 1;
            if (!acc[groupType]) acc[groupType] = [];
            acc[groupType].push(item);
            return acc;
        }, {});
        const types = Object.keys(groups)
            .map((key) => Number(key))
            .sort((a, b) => a - b);
        const latest = types.length > 0 ? types[types.length - 1] : null;
        return { groupedItems: groups, sortedGroupTypes: types, latestGroupType: latest };
    }, [cart.items]);
    const groupCount = sortedGroupTypes.length;
    const [expandedGroupType, setExpandedGroupType] = useState<number | null>(latestGroupType ?? null);

    useEffect(() => {
        if (!groupCount) {
            setExpandedGroupType(null);
            return;
        }
        setExpandedGroupType(latestGroupType ?? null);
    }, [groupCount, latestGroupType]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
            statusBarTranslucent={false}
            presentationStyle="overFullScreen"
        >
            <View style={{ flex: 1 }}>
                {/* Backdrop */}
                <Animated.View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        bottom: 0,
                        left: 0,
                        backgroundColor: colors.overlay || 'rgba(0,0,0,0.35)',
                        opacity: cartDrawerBackdropAnim,
                    }}
                />

                {/* Touch to close */}
                <Pressable
                    onPress={onClose}
                    style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
                />

                {/* Drawer Content */}
                <Animated.View
                    style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        bottom: 0,
                        width: cartDrawerWidth,
                        backgroundColor: colors.background,
                        borderTopLeftRadius: 20,
                        borderBottomLeftRadius: 20,
                        borderLeftWidth: 1,
                        borderColor: colors.border,
                        overflow: 'hidden',
                        transform: [{ translateX: cartDrawerTranslateAnim }],
                    }}
                >
                    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
                        {/* Enhanced Cart Header */}
                        <View
                            style={{
                                paddingHorizontal: 16,
                                paddingVertical: 12,
                                backgroundColor: colors.background,
                                borderBottomWidth: 1,
                                borderBottomColor: colors.border,
                            }}
                        >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
                                        <MaterialCommunityIcons
                                            name="cart"
                                            size={18}
                                            color={colors.primary}
                                        />
                                    </View>
                                    <View>
                                        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                                            Order Summary
                                        </Text>
                                        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                                            {cartQuantity} {cartQuantity === 1 ? 'item' : 'items'} • {formatCurrency(total)}
                                        </Text>
                                    </View>
                                </View>
                                <TouchableOpacity
                                    onPress={onClose}
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 10,
                                        backgroundColor: colors.surfaceHover,
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                    }}
                                >
                                    <MaterialIcons name="close" size={20} color={colors.text} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Cart Items or Empty State */}
                        {cart.items.length > 0 ? (
                            <>
                                <ScrollView
                                    style={{ flex: 1 }}
                                    nestedScrollEnabled
                                    keyboardShouldPersistTaps="handled"
                                    contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12 }}
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
                                                        onSelectGroup?.(groupType, label);
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
                                                                isEditing={editingItemNoteId === item.cartId}
                                                                editingNote={editingItemNoteId === item.cartId ? itemNoteDraft : ''}
                                                                onNoteChange={onItemNoteDraftChange}
                                                                onEditNote={() => { }}
                                                                onOpenNoteModal={onOpenItemNoteModal}
                                                                onCancelEdit={onCancelItemNoteEdit}
                                                                onSaveNote={onSaveItemNote}
                                                                onUpdateQuantity={onUpdateQuantity}
                                                                onRemoveItem={onRemoveItem}
                                                                colors={colors}
                                                            />
                                                        </View>
                                                    ))
                                                    : null}
                                            </View>
                                        );
                                    })}
                                </ScrollView>

                                {/* Enhanced Cart Summary */}
                                <CartSummary
                                    cart={cart}
                                    cartQuantity={cartQuantity}
                                    onEditOrderMeta={onEditOrderMeta}
                                    onAddGroup={onAddGroup}
                                    showAddGroup={showAddGroup}
                                    onCheckout={onCheckout}
                                    colors={colors}
                                    isOrderNoteOrDiscountPresent={false}
                                />
                            </>
                        ) : (
                            /* Enhanced Empty State - Centered */
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
                                        👈 Tap on items to add them
                                    </Text>
                                </View>
                            </View>
                        )}
                    </SafeAreaView>
                </Animated.View>
            </View>
        </Modal>
    );
};
