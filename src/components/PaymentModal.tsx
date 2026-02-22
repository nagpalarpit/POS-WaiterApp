import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import Card from './Card';

type PaymentOption = {
    id: number;
    label: string;
    tip?: number;
    giftCard?: { code: string; amount: number };
};

type Props = {
    visible: boolean;
    onClose: () => void;
    onSelect: (option: PaymentOption & { print?: boolean }) => void;
    orderTotal?: number;
};

export default function PaymentModal({ visible, onClose, onSelect, orderTotal = 0 }: Props) {
    const { colors, name } = useTheme();

    const primaryTabs = [
        { id: 0, label: 'Cash' },
        { id: 1, label: 'Card' },
        { id: 3, label: 'Split' },
        { id: 99, label: 'Other' },
    ];

    const otherMethods: PaymentOption[] = [
        { id: 5, label: 'Debitor' },
        { id: 6, label: 'Liefernado' },
        { id: 7, label: 'Uber' },
        { id: 8, label: 'Wolt' },
        { id: 9, label: 'Bolt' },
        { id: 10, label: 'Schlemmerblock' },
    ];

    const [activeTab, setActiveTab] = useState<number>(0);
    const [tipValue, setTipValue] = useState('');
    const [giftCode, setGiftCode] = useState('');
    const [giftAmount, setGiftAmount] = useState('');
    const [cashProvided, setCashProvided] = useState('');

    const tipNum = parseFloat(tipValue || '0') || 0;
    const giftNum = parseFloat(giftAmount || '0') || 0;
    const due = Math.max(0, orderTotal + tipNum - giftNum);

    const reset = () => {
        setTipValue('');
        setGiftCode('');
        setGiftAmount('');
        setCashProvided('');
        setActiveTab(0);
    };

    const handleConfirm = (print = false) => {
        const payload: any = {
            id: activeTab === 99 ? 5 : activeTab,
            label: activeTab === 99 ? 'Other' : primaryTabs.find((t) => t.id === activeTab)?.label,
            tip: tipNum,
            giftCard: giftCode ? { code: giftCode, amount: giftNum } : undefined,
            cashProvided: parseFloat(cashProvided || '0') || 0,
            print,
        };

        onSelect(payload);
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} allowSwipeDismissal={true}>
            <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
                <Card padding={0} rounded={16} style={[styles.card, { borderColor: colors.border }]}>
                    <View style={[styles.headerRow, { paddingHorizontal: 18, paddingTop: 0 }]}>
                        <Text style={[styles.title, { color: colors.text }]}>Save & Final Settle</Text>
                        <TouchableOpacity onPress={() => { reset(); onClose(); }}>
                            <Text style={{ color: colors.textSecondary, fontSize: 20 }}>×</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.dragIndicatorContainer}>
                        <View style={[styles.dragIndicator, { backgroundColor: colors.border }]} />
                    </View>

                    <View style={{ flexDirection: 'row', marginTop: 8, marginBottom: 6, gap: 8 }}>
                        {primaryTabs.map((t) => (
                            <TouchableOpacity
                                key={t.id}
                                onPress={() => setActiveTab(t.id)}
                                style={[
                                    styles.tab,
                                    { backgroundColor: activeTab === t.id ? colors.primary : 'transparent', borderColor: colors.border },
                                ]}
                            >
                                <Text style={{ color: activeTab === t.id ? colors.textInverse : colors.text }}>{t.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <ScrollView style={{ marginTop: 6, maxHeight: 340 }}>
                        {activeTab === 99 ? (
                            <View>
                                <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>Other Payments</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                    {otherMethods.map((m) => (
                                        <TouchableOpacity
                                            key={m.id}
                                            onPress={() => onSelect({ id: m.id, label: m.label })}
                                            style={[styles.pill, { borderColor: colors.border }]}
                                        >
                                            <Text style={{ color: colors.text }}>{m.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <View style={{ marginTop: 12 }}>
                                    <Text style={{ color: colors.textSecondary }}>Add Tip (optional)</Text>
                                    <TextInput
                                        keyboardType="numeric"
                                        placeholder="Enter tip amount"
                                        placeholderTextColor={colors.textSecondary}
                                        value={tipValue}
                                        onChangeText={setTipValue}
                                        style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                                    />
                                </View>

                                <View style={{ marginTop: 12 }}>
                                    <Text style={{ color: colors.textSecondary }}>Cash provided</Text>
                                    <TextInput
                                        keyboardType="numeric"
                                        placeholder="Enter cash amount"
                                        placeholderTextColor={colors.textSecondary}
                                        value={cashProvided}
                                        onChangeText={setCashProvided}
                                        style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                                    />
                                </View>
                            </View>
                        ) : (
                            <View>
                                {/* Card / Cash / Split content */}
                                {activeTab === 0 && (
                                    <View>
                                        <Text style={{ color: colors.textSecondary }}>Cash provided</Text>
                                        <TextInput
                                            keyboardType="numeric"
                                            placeholder="Enter cash amount"
                                            placeholderTextColor={colors.textSecondary}
                                            value={cashProvided}
                                            onChangeText={setCashProvided}
                                            style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                                        />

                                        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Cash to return</Text>
                                        <View style={[styles.input, { justifyContent: 'center' }]}>
                                            <Text style={{ color: colors.text }}>{Math.max(0, (parseFloat(cashProvided || '0') || 0) - due).toFixed(2)}</Text>
                                        </View>
                                    </View>
                                )}

                                {activeTab === 1 && (
                                    <View>
                                        <Text style={{ color: colors.textSecondary }}>Card payment selected</Text>
                                    </View>
                                )}

                                {activeTab === 3 && (
                                    <View>
                                        <Text style={{ color: colors.textSecondary }}>Split payment — open split UI (not implemented)</Text>
                                    </View>
                                )}

                                <View style={{ marginTop: 12 }}>
                                    <Text style={{ color: colors.textSecondary }}>Add Tip (optional)</Text>
                                    <TextInput
                                        keyboardType="numeric"
                                        placeholder="Enter tip amount"
                                        placeholderTextColor={colors.textSecondary}
                                        value={tipValue}
                                        onChangeText={setTipValue}
                                        style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                                    />
                                </View>

                                <View style={{ marginTop: 12 }}>
                                    <Text style={{ color: colors.textSecondary }}>Add Gift Card</Text>
                                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 }}>
                                        <TextInput
                                            placeholder="Enter gift card"
                                            placeholderTextColor={colors.textSecondary}
                                            value={giftCode}
                                            onChangeText={setGiftCode}
                                            style={[styles.input, { flex: 1, borderColor: colors.border, color: colors.text, marginTop: 0 }]}
                                        />
                                        <TouchableOpacity
                                            onPress={() => {
                                                const amt = parseFloat(giftAmount || '0') || 0;
                                                onSelect({ id: 4, label: 'Gift Card', giftCard: { code: giftCode, amount: amt } });
                                                setGiftCode('');
                                                setGiftAmount('');
                                            }}
                                            style={[styles.addBtn, { backgroundColor: colors.primary, height: 'auto' }]}
                                        >
                                            <Text style={{ color: colors.textInverse }}>Add</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {
                                        Number(giftAmount) > 0 && (
                                            <TextInput
                                                keyboardType="numeric"
                                                placeholder="Amount"
                                                placeholderTextColor={colors.textSecondary}
                                                value={giftAmount}
                                                onChangeText={setGiftAmount}
                                                readOnly
                                                style={[styles.input, { borderColor: colors.border, color: colors.text, marginTop: 8 }]}
                                            />
                                        )
                                    }
                                </View>
                            </View>
                        )}
                    </ScrollView>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                        <Text style={{ color: colors.text, fontWeight: '700' }}>{due.toFixed(2)}</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity onPress={() => { reset(); onClose(); }} style={[styles.ghostBtn, { borderColor: colors.border }]}>
                                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => { handleConfirm(false); }} style={[styles.payBtn, { backgroundColor: colors.primary }]}>
                                <Text style={{ color: colors.textInverse }}>Pay</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => { handleConfirm(true); }} style={[styles.payBtnPrimary, { backgroundColor: colors.primary }]}>
                                <Text style={{ color: colors.textInverse }}>Pay & Print</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Card>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'transparent',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingBottom: 0,
    },
    card: {
        width: '100%',
        maxHeight: '72%',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderRadius: 16,
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 22,
        borderWidth: 1,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: {
        fontSize: 16,
        fontWeight: '700',
    },
    dragIndicatorContainer: {
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 6,
    },
    dragIndicator: {
        width: 36,
        height: 4,
        borderRadius: 4,
    },
    tab: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 20,
        borderWidth: 1,
    },
    pill: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        marginRight: 8,
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        padding: 10,
        borderRadius: 8,
        marginTop: 6,
    },
    addBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
    ghostBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
    payBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
    payBtnPrimary: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
});
