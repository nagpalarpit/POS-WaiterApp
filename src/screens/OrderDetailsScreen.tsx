import React, { useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, TouchableOpacity, ScrollView, Alert, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Card from '../components/Card';
import orderService from '../services/orderService';
import { getOrderStatusLabel } from '../utils/orderUtils';
import {
    getAttributeValueName,
    getAttributeValuePrice,
    getAttributeValueQuantity,
    getCartItemQuantity,
    getItemLineTotal,
    getItemOptionsSummary,
    getItemUnitTotal,
} from '../utils/cartCalculations';
import PaymentModal from '../components/PaymentModal';

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

const normalizeAttributeValues = (values: any[] = []) => {
    return values
        .filter(Boolean)
        .map((value: any) => ({
            attributeValueId:
                value.menuItemVariantAttributeValueId ??
                value.attributeValueId ??
                value.id,
            attributeValueName:
                value.menuItemVariantAttributeValue?.name ??
                value.attributeValueName ??
                value.name ??
                '',
            attributeValuePrice: toNumber(
                value.unitPrice ??
                value.attributeValuePrice ??
                value.price ??
                value.menuItemVariantAttributeValue?.price,
                0
            ),
            attributeValueQuantity: Math.max(
                toNumber(value.quantity ?? value.attributeValueQuantity, 1),
                1
            ),
        }));
};

const extractFromVariants = (variants: any[] = []) => {
    const variantNames = new Set<string>();
    let variantPrice = 0;
    const attributeNames = new Set<string>();
    const attributeValues: any[] = [];

    variants.forEach((variant: any) => {
        const variantName =
            variant?.menuItemVariant?.name ||
            variant?.name ||
            variant?.variantName ||
            '';
        if (variantName) variantNames.add(variantName);

        variantPrice += toNumber(
            variant?.unitPrice ??
            variant?.price ??
            variant?.variantPrice ??
            variant?.menuItemVariant?.price,
            0
        );

        const variantAttributes = Array.isArray(variant?.orderItemVariantAttributes)
            ? variant.orderItemVariantAttributes
            : Array.isArray(variant?.menuItemVariantAttributes)
                ? variant.menuItemVariantAttributes
                : [];

        variantAttributes.forEach((attribute: any) => {
            const attributeName =
                attribute?.menuItemVariantAttribute?.name ||
                attribute?.attributeName ||
                attribute?.name ||
                '';
            if (attributeName) attributeNames.add(attributeName);

            const values = Array.isArray(attribute?.orderItemVariantAttributeValues)
                ? attribute.orderItemVariantAttributeValues
                : Array.isArray(attribute?.menuItemVariantAttributeValues)
                    ? attribute.menuItemVariantAttributeValues
                    : Array.isArray(attribute?.attributeValues)
                        ? attribute.attributeValues
                        : [];
            attributeValues.push(...normalizeAttributeValues(values));
        });
    });

    return {
        variantName: Array.from(variantNames).join(', '),
        variantPrice,
        attributeName: attributeNames.size === 1 ? Array.from(attributeNames)[0] : undefined,
        attributeValues,
    };
};

const normalizeOrderItem = (item: any, index: number) => {
    const variantCandidates = Array.isArray(item?.orderItemVariants)
        ? item.orderItemVariants
        : item?.orderItemVariant
            ? [item.orderItemVariant]
            : [];

    const variantDetails = extractFromVariants(variantCandidates);
    const directAttributeValues = normalizeAttributeValues(item?.attributeValues || []);
    const quantity = Math.max(toNumber(item?.quantity, 1), 1);

    return {
        ...item,
        cartId:
            item?.cartId ||
            item?._id ||
            `order-item-${item?.menuItemId || item?.itemId || item?.customId || index}-${index}`,
        quantity,
        itemName: item?.itemName || item?.name || '',
        itemPrice: toNumber(item?.itemPrice ?? item?.unitPrice ?? item?.price, 0),
        variantName:
            item?.variantName ||
            item?.orderItemVariant?.name ||
            variantDetails.variantName,
        variantPrice: toNumber(
            item?.variantPrice ??
            item?.orderItemVariant?.variantPrice ??
            item?.orderItemVariant?.price ??
            item?.orderItemVariant?.unitPrice,
            variantDetails.variantPrice
        ),
        attributeName: item?.attributeName || variantDetails.attributeName,
        attributeValues:
            directAttributeValues.length > 0
                ? directAttributeValues
                : variantDetails.attributeValues,
        orderItemNote: item?.orderItemNote || item?.note || '',
    };
};

export default function OrderDetailsScreen({ navigation, route }: any) {
    const { colors } = useTheme();
    const [activeSection, setActiveSection] = useState<'items' | 'notes'>('items');
    const order = route.params?.order;
    const [marking, setMarking] = useState(false);

    const PAYMENT_METHOD_LABELS: Record<number, string> = {
        0: 'Cash',
        1: 'Card',
        2: 'Cash + Card',
        3: 'Split Payment',
        4: 'Gift Card',
        5: 'Debitor',
        6: 'Liefernado',
        7: 'Uber',
        8: 'Wolt',
        9: 'Bolt',
        10: 'Schlemmerblock',
    };

    if (!order) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: colors.textSecondary }}>No order provided</Text>
                </View>
            </SafeAreaView>
        );
    }

    const rawItems = order.orderDetails?.orderItem || [];
    const items = useMemo(
        () => rawItems.map((item: any, index: number) => normalizeOrderItem(item, index)),
        [rawItems]
    );

    const footerHeight = 170;

    const totals = useMemo(() => {
        const od = order.orderDetails || {};
        const subtotal = Number(od.orderSubTotal ?? od.orderCartSubTotal ?? 0) || 0;
        const discount = Number(od.orderDiscountTotal ?? 0) || 0;
        const tax = Number(od.orderTaxTotal ?? od.orderCartTaxAndChargesTotal ?? 0) || 0;
        const total = Number(od.orderTotal ?? (subtotal - discount + tax)) || 0;
        return { subtotal, discount, tax, total };
    }, [order]);

    const paymentProcessorId = order.orderDetails?.orderPaymentSummary?.paymentProcessorId;
    const paymentLabel = PAYMENT_METHOD_LABELS[paymentProcessorId] || 'Not set';
    const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(
        paymentProcessorId ?? null
    );
    const [paymentModalVisible, setPaymentModalVisible] = useState(false);
    const [pendingSettle, setPendingSettle] = useState(false);

    const onEdit = () => {
        navigation.navigate('Menu', {
            tableNo: order.orderDetails?.tableNo,
            deliveryType: order.orderDetails?.orderDeliveryTypeId ?? 0,
            existingOrder: order,
        });
    };

    const onMarkPaid = async () => {
        Alert.alert('Confirm', 'Mark this order as paid?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Mark Paid',
                onPress: async () => {
                    try {
                        setMarking(true);
                        await orderService.markOrderAsPaid(order._id || order.id || order.orderId);
                        setMarking(false);
                        navigation.goBack();
                    } catch (err) {
                        setMarking(false);
                        console.error('Error marking order paid:', err);
                        Alert.alert('Error', 'Unable to mark order paid');
                    }
                },
            },
        ]);
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
                <Card rounded={14} style={{ padding: 12, marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1, marginLeft: 12, marginRight: 12 }}>
                            <Text style={{ textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.text }}>
                                {order.customOrderId || order._id}
                            </Text>
                        </View>

                        <View style={{ width: 40 }} />
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
                        <Text style={{ color: colors.textSecondary }}>Status: {getOrderStatusLabel(order)}</Text>
                        <Text style={{ color: colors.text, fontWeight: '700' }}>₹{totals.total.toFixed(2)}</Text>
                    </View>

                    {/* Tabs */}
                    <View style={{ flexDirection: 'row', marginTop: 12 }}>
                        <TouchableOpacity onPress={() => setActiveSection('items')} style={{ flex: 1, paddingVertical: 8, borderRadius: 20, backgroundColor: activeSection === 'items' ? colors.primary : colors.surface, borderWidth: 1, borderColor: activeSection === 'items' ? colors.primary : colors.border, marginRight: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                                <MaterialCommunityIcons name="clipboard-list" size={16} color={activeSection === 'items' ? colors.textInverse : colors.text} style={{ marginRight: 8 }} />
                                <Text style={{ color: activeSection === 'items' ? colors.textInverse : colors.text, fontWeight: '600' }}>Items</Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setActiveSection('notes')} style={{ flex: 1, paddingVertical: 8, borderRadius: 20, backgroundColor: activeSection === 'notes' ? colors.primary : colors.surface, borderWidth: 1, borderColor: activeSection === 'notes' ? colors.primary : colors.border }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                                <MaterialCommunityIcons name="note-text" size={16} color={activeSection === 'notes' ? colors.textInverse : colors.text} style={{ marginRight: 8 }} />
                                <Text style={{ color: activeSection === 'notes' ? colors.textInverse : colors.text, fontWeight: '600' }}>Notes</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </Card>
            </View>

            <ScrollView style={{ flex: 1, paddingHorizontal: 12 }} contentContainerStyle={{ paddingBottom: footerHeight + 20 }}>
                {items.length === 0 ? (
                    <Text style={{ color: colors.textSecondary }}>No items in this order</Text>
                ) : (
                    activeSection === 'items' ? (
                        items.map((it: any) => {
                            const quantity = getCartItemQuantity(it);
                            const itemUnitTotal = getItemUnitTotal(it);
                            const itemLineTotal = getItemLineTotal(it);
                            const optionsSummary = getItemOptionsSummary(it);

                            return (
                                <Card key={it.cartId} style={{ marginBottom: 12 }}>
                                    <View style={styles.itemRow}>
                                        <View style={styles.itemContent}>
                                            <Text style={[styles.itemName, { color: colors.text }]}>
                                                {it.customId ? `${it.customId}. ` : ''}{it.itemName}
                                            </Text>

                                            {!!optionsSummary && (
                                                <Text style={[styles.optionText, { color: colors.textSecondary }]}>
                                                    {optionsSummary}
                                                </Text>
                                            )}

                                            {Array.isArray(it.attributeValues) && it.attributeValues.length > 0 && (
                                                <View style={styles.attributesList}>
                                                    {it.attributeValues.map((attributeValue: any, valueIndex: number) => {
                                                        const name = getAttributeValueName(attributeValue);
                                                        const valueQuantity = getAttributeValueQuantity(attributeValue);
                                                        const valuePrice = getAttributeValuePrice(attributeValue);
                                                        if (!name) return null;

                                                        return (
                                                            <Text
                                                                key={`${it.cartId}-value-${valueIndex}`}
                                                                style={[styles.attributeValueText, { color: colors.textSecondary }]}
                                                            >
                                                                • {valueQuantity} x {name}
                                                                {valuePrice > 0 ? ` (+₹${valuePrice.toFixed(2)})` : ''}
                                                            </Text>
                                                        );
                                                    })}
                                                </View>
                                            )}

                                            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                                                ₹{itemUnitTotal.toFixed(2)} × {quantity}
                                            </Text>

                                            {it.orderItemNote ? (
                                                <Text style={[styles.note, { color: colors.textSecondary }]}>
                                                    Note: {it.orderItemNote}
                                                </Text>
                                            ) : null}
                                        </View>

                                        <Text style={[styles.lineTotal, { color: colors.text }]}>
                                            ₹{itemLineTotal.toFixed(2)}
                                        </Text>
                                    </View>
                                </Card>
                            );
                        })
                    ) : (
                        <Card style={{ padding: 12, marginBottom: 12 }}>
                            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Notes</Text>
                            <Text style={{ color: colors.textSecondary }}>{order.orderDetails?.orderNotes || '—'}</Text>
                        </Card>
                    )
                )}
            </ScrollView>

            <PaymentModal
                visible={paymentModalVisible}
                onClose={() => setPaymentModalVisible(false)}
                onSelect={async (option: any) => {
                    // always update selection
                    setSelectedPaymentId(option.id);
                    setPaymentModalVisible(false);

                    if (!pendingSettle) return;

                    // perform settle flow after user selected payment method
                    setPendingSettle(false);
                    try {
                        setMarking(true);

                        const paymentPayload: any = {
                            paymentProcessorId: option.id,
                            paymentMethodLabel: PAYMENT_METHOD_LABELS[option.id] || option.label,
                            amount: totals.total,
                            paidAt: new Date().toISOString(),
                        };

                        // include tip or gift card if provided by the modal
                        if ((option as any).tip) {
                            paymentPayload.tip = (option as any).tip;
                        }
                        if ((option as any).giftCard) {
                            paymentPayload.giftCard = (option as any).giftCard;
                        }

                        const settlePayload: any = {
                            orderId: order._id || order.id || order.orderId,
                            orderInfo: order.orderDetails || {},
                            orderPaymentSummary: paymentPayload,
                            orderPaymentDetails: [
                                {
                                    paymentProcessorId: option.id,
                                    paymentTotal: totals.total - (paymentPayload.tip || 0),
                                    ...(option.giftCard ? { giftCard: option.giftCard } : {}),
                                },
                            ],
                            // include tip on the settle object too
                            tip: paymentPayload.tip || 0,
                        };

                        await orderService.settleOrder(order._id || order.id || order.orderId, settlePayload);
                        setMarking(false);
                        navigation.goBack();
                    } catch (err) {
                        setMarking(false);
                        console.error('Error settling order after payment selection:', err);
                        Alert.alert('Error', 'Unable to complete payment');
                    }
                }}
                orderTotal={totals.total}
            />

            <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
                <View style={styles.summaryWrap}>
                    <View style={styles.summaryRow}>
                        <Text style={{ color: colors.textSecondary }}>Subtotal</Text>
                        <Text style={{ color: colors.text, fontWeight: '700' }}>₹{totals.subtotal.toFixed(2)}</Text>
                    </View>
                    {totals.tax > 0 && (
                        <View style={styles.summaryRow}>
                            <Text style={{ color: colors.textSecondary }}>Tax</Text>
                            <Text style={{ color: colors.text, fontWeight: '700' }}>₹{totals.tax.toFixed(2)}</Text>
                        </View>
                    )}
                    {totals.discount > 0 && (
                        <View style={styles.summaryRow}>
                            <Text style={{ color: colors.textSecondary }}>Discount</Text>
                            <Text style={{ color: colors.error, fontWeight: '700' }}>-₹{totals.discount.toFixed(2)}</Text>
                        </View>
                    )}
                    <View style={styles.summaryRow}>
                        <Text style={{ color: colors.text, fontWeight: '700' }}>Total</Text>
                        <Text style={{ color: colors.text, fontWeight: '700' }}>₹{totals.total.toFixed(2)}</Text>
                    </View>
                </View>

                <View style={styles.footerActions}>
                    <TouchableOpacity onPress={onEdit} style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Text style={{ textAlign: 'center', color: colors.text }}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => {
                            // always prompt for payment method before settling
                            setPendingSettle(true);
                            setPaymentModalVisible(true);
                        }}
                        disabled={marking}
                        style={[styles.actionBtnPrimary, { backgroundColor: colors.primary }]}
                    >
                        <Text style={{ textAlign: 'center', color: colors.textInverse }}>{marking ? 'Marking...' : 'Mark Paid'}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { padding: 16, borderBottomWidth: 1 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 20, fontWeight: '700' },
    sub: { marginTop: 6 },
    itemCard: { paddingVertical: 10, borderBottomWidth: 1 },
    itemRow: { flexDirection: 'row', justifyContent: 'space-between' },
    itemContent: { flex: 1, paddingRight: 12 },
    itemName: { fontWeight: '600', fontSize: 16 },
    lineTotal: { fontWeight: '600', fontSize: 15 },
    optionText: { marginTop: 6, fontSize: 13 },
    attributesList: { marginTop: 4 },
    attributeValueText: { fontSize: 12, marginTop: 2 },
    metaText: { marginTop: 6, fontSize: 12 },
    note: { marginTop: 8, fontStyle: 'italic' },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 14, borderTopWidth: 1 },
    summaryWrap: { paddingBottom: 8, gap: 4 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
    footerActions: { flexDirection: 'row', gap: 8 },
    actionBtn: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1 },
    actionBtnPrimary: { flex: 1, padding: 12, borderRadius: 8 },
});
