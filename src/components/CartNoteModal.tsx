import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeProvider';
import { getCurrencySymbol } from '../utils/currency';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Card from './Card';
import PinModal from './PinModal';
import { CartDiscount } from '../services/cartService';
import { DiscountOption, fetchDiscountsForCompany, loadCachedDiscounts } from '../services/discountService';
import { useToast } from '../components/ToastProvider';

interface Props {
    visible: boolean;
    initialNote?: string;
    initialDiscount?: CartDiscount | null;
    onClose: () => void;
    onSave: (note: string, discount: CartDiscount | null) => void;
}

export default function CartNoteModal({ visible, initialNote = '', initialDiscount = null, onClose, onSave }: Props) {
    const { colors } = useTheme();
    const { showToast } = useToast();
    const [note, setNote] = useState(initialNote || '');
    const [discounts, setDiscounts] = useState<DiscountOption[]>([]);
    const [discountsLoading, setDiscountsLoading] = useState(false);
    const [selectedDiscountId, setSelectedDiscountId] = useState<string | number | null>(initialDiscount?.discountId ?? null);
    const [customDiscountValue, setCustomDiscountValue] = useState(String(initialDiscount?.discountValue || ''));
    const [pinModalVisible, setPinModalVisible] = useState(false);
    const [pinVerified, setPinVerified] = useState(false);
    const [pendingDiscountId, setPendingDiscountId] = useState<string | number | null>(null);
    const [hasPendingDiscountSelection, setHasPendingDiscountSelection] = useState(false);
    const [discountChanged, setDiscountChanged] = useState(false);

    useEffect(() => {
        if (visible) {
            setNote(initialNote || '');
            setSelectedDiscountId(initialDiscount?.discountId ?? null);
            setCustomDiscountValue(String(initialDiscount?.discountValue || ''));
            setPinVerified(false);
            setPendingDiscountId(null);
            setHasPendingDiscountSelection(false);
            setDiscountChanged(false);
        }
    }, [initialNote, initialDiscount, visible]);

    useEffect(() => {
        const loadDiscounts = async () => {
            if (!visible) return;
            setDiscountsLoading(true);
            try {
                const userDataStr = await AsyncStorage.getItem('userData');
                const userData = userDataStr ? JSON.parse(userDataStr) : null;
                const companyId =
                    Number(
                        userData?.companyId ||
                        userData?.company?.id ||
                        userData?.company?.companyId ||
                        0
                    ) || 0;

                let list = companyId ? await loadCachedDiscounts(companyId) : [];
                if (companyId && list.length === 0) {
                    list = await fetchDiscountsForCompany(companyId);
                }
                setDiscounts(list);

                if (initialDiscount?.discountId) {
                    setSelectedDiscountId(initialDiscount.discountId);
                } else if (initialDiscount) {
                    const matchIndex = list.findIndex((d) => {
                        const name = d.discountName || d.name || '';
                        return (
                            (name && name === initialDiscount.discountName) ||
                            (d.discountValue === initialDiscount.discountValue &&
                                d.discountType === initialDiscount.discountType)
                        );
                    });
                    if (matchIndex >= 0) {
                        const match = list[matchIndex];
                        setSelectedDiscountId(match.id ?? match._id ?? `index-${matchIndex}`);
                    }
                }
            } catch (error) {
                console.error('CartNoteModal: Failed to load discounts:', error);
            } finally {
                setDiscountsLoading(false);
            }
        };

        loadDiscounts();
    }, [visible, initialDiscount]);

    const getDiscountKey = (discount: DiscountOption, index: number) =>
        discount.id ?? discount._id ?? `index-${index}`;

    const selectedDiscount = useMemo(() => {
        if (!selectedDiscountId) return null;
        return (
            discounts.find(
                (discount, index) =>
                    getDiscountKey(discount, index) === selectedDiscountId
            ) || null
        );
    }, [discounts, selectedDiscountId]);

    const requestPinForDiscount = (nextId: string | number | null) => {
        if (!pinVerified) {
            setPendingDiscountId(nextId);
            setHasPendingDiscountSelection(true);
            setPinModalVisible(true);
            return;
        }

        if (nextId === selectedDiscountId) return;
        setSelectedDiscountId(nextId);
        setDiscountChanged(true);
    };

    const handlePinVerified = () => {
        setPinVerified(true);
        if (hasPendingDiscountSelection) {
            setSelectedDiscountId(pendingDiscountId);
            setDiscountChanged(true);
        }
        setPendingDiscountId(null);
        setHasPendingDiscountSelection(false);
    };

    const handlePinClose = () => {
        setPinModalVisible(false);
        setPendingDiscountId(null);
        setHasPendingDiscountSelection(false);
    };

    const getDiscountValueLabel = (discount: DiscountOption) => {
        if (discount.discountType === 'PERCENTAGE' || discount.discountType === 'CUSTOM') {
            return `${discount.discountValue}%`;
        }
        return `${getCurrencySymbol()}${discount.discountValue}`;
    };

    const save = (): boolean => {
        if (!selectedDiscount) {
            onSave(note, null);
            return true;
        }

        if (discountChanged && !pinVerified) {
            showToast('Please enter PIN to apply discount.', { type: 'error' });
            return false;
        }

        let discountValue = selectedDiscount.discountValue;
        if (selectedDiscount.discountType === 'CUSTOM') {
            const parsed = parseFloat(customDiscountValue || '0');
            if (!Number.isFinite(parsed) || parsed <= 0) {
                showToast('Enter a valid custom discount percentage.', { type: 'error' });
                return false;
            }
            if (parsed > 100) {
                showToast('Custom discount cannot exceed 100%.', { type: 'error' });
                return false;
            }
            discountValue = parsed;
        }

        const discount: CartDiscount = {
            discountId: selectedDiscount.id ?? selectedDiscount._id,
            discountName: selectedDiscount.discountName || selectedDiscount.name || 'Discount',
            discountType: selectedDiscount.discountType,
            discountValue,
        };
        onSave(note, discount);
        return true;
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                {/* Backdrop Pressable */}
                <Pressable
                    onPress={onClose}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
                />
                
                {/* Modal Content */}
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}>
                    <Card style={{ width: '100%', maxWidth: 400 }} rounded={12}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>Notes & Discounts</Text>
                            <TouchableOpacity onPress={onClose}><MaterialCommunityIcons name="close" size={24} color={colors.text} /></TouchableOpacity>
                        </View>

                        {/* Order Note Section */}
                        <View style={{ marginBottom: 16 }}>
                            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>Order Note</Text>
                            <TextInput
                                value={note}
                                onChangeText={setNote}
                                placeholder="Add a note for this order..."
                                placeholderTextColor={colors.textSecondary}
                                style={{ minHeight: 80, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, backgroundColor: colors.surface }}
                                multiline
                            />
                        </View>

                        {/* Discount Section */}
                        <View style={{ marginBottom: 16 }}>
                            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>Discount</Text>

                            {discountsLoading ? (
                                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Loading discounts...</Text>
                            ) : discounts.length === 0 ? (
                                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                                    No discounts available for this company.
                                </Text>
                            ) : (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                    <TouchableOpacity
                                        onPress={() => requestPinForDiscount(null)}
                                        style={{
                                            paddingHorizontal: 12,
                                            paddingVertical: 8,
                                            borderRadius: 999,
                                            borderWidth: 1.5,
                                            borderColor: !selectedDiscountId ? colors.primary : colors.border,
                                            backgroundColor: !selectedDiscountId ? colors.primary + '20' : colors.surface,
                                        }}
                                    >
                                        <Text style={{ color: !selectedDiscountId ? colors.primary : colors.text, fontWeight: '600', fontSize: 12 }}>
                                            No Discount
                                        </Text>
                                    </TouchableOpacity>
                                    {discounts.map((discount, index) => {
                                        const discountId = getDiscountKey(discount, index);
                                        const selected = selectedDiscountId === discountId;
                                        const label = discount.discountName || discount.name || 'Discount';
                                        return (
                                            <TouchableOpacity
                                                key={`${discountId}`}
                                                onPress={() => requestPinForDiscount(discountId ?? null)}
                                                style={{
                                                    paddingHorizontal: 12,
                                                    paddingVertical: 8,
                                                    borderRadius: 999,
                                                    borderWidth: 1.5,
                                                    borderColor: selected ? colors.primary : colors.border,
                                                    backgroundColor: selected ? colors.primary + '20' : colors.surface,
                                                }}
                                            >
                                                <Text style={{ color: selected ? colors.primary : colors.text, fontWeight: '600', fontSize: 12 }}>
                                                    {label} · {getDiscountValueLabel(discount)}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            )}

                            {selectedDiscount?.discountType === 'CUSTOM' && (
                                <View style={{ marginTop: 10 }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 6 }}>
                                        Custom Discount (%)
                                    </Text>
                                    <TextInput
                                        value={customDiscountValue}
                                        onChangeText={setCustomDiscountValue}
                                        editable={pinVerified || discountChanged}
                                        placeholder="Enter custom percentage"
                                        placeholderTextColor={colors.textSecondary}
                                        keyboardType="decimal-pad"
                                        style={{
                                            color: colors.text,
                                            borderWidth: 1,
                                            borderColor: colors.border,
                                            borderRadius: 8,
                                            padding: 10,
                                            backgroundColor: colors.surface,
                                            fontWeight: '600',
                                        }}
                                    />
                                </View>
                            )}
                        </View>

                        {/* Buttons */}
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity onPress={onClose} style={{ flex: 1, padding: 12, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface }}>
                                <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '600' }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => {
                                const didSave = save();
                                if (didSave) {
                                    onClose();
                                }
                            }} style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: colors.primary }}>
                                <Text style={{ textAlign: 'center', color: colors.textInverse, fontWeight: '700' }}>Save Changes</Text>
                            </TouchableOpacity>
                        </View>
                    </Card>
                </View>

                <PinModal
                    visible={pinModalVisible}
                    onClose={handlePinClose}
                    onVerified={handlePinVerified}
                />
            </KeyboardAvoidingView>
        </Modal>
    );
}
