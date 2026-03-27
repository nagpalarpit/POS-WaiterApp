import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { useTheme } from '../theme/ThemeProvider';
import { getCurrencySymbol } from '../utils/currency';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import PinModal from './PinModal';
import { CartDiscount } from '../services/cartService';
import { DiscountOption, fetchDiscountsForCompany, loadCachedDiscounts } from '../services/discountService';
import { useToast } from '../components/ToastProvider';
import AppBottomSheet from './AppBottomSheet';
import AppBottomSheetTextInput from './AppBottomSheetTextInput';
import { useTranslation } from '../contexts/LanguageContext';

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
    const { t } = useTranslation();
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
                const userDataStr = await AsyncStorage.getItem(STORAGE_KEYS.authUser);
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
            showToast('error', t('enterPinToApplyDiscount'));
            return false;
        }

        let discountValue = selectedDiscount.discountValue;
        if (selectedDiscount.discountType === 'CUSTOM') {
            const parsed = parseFloat(customDiscountValue || '0');
            if (!Number.isFinite(parsed) || parsed <= 0) {
            showToast('error', t('enterValidCustomDiscountPercentage'));
            return false;
        }
        if (parsed > 100) {
            showToast('error', t('customDiscountCannotExceed100'));
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

    const footer = (
        <View style={styles.footerActions}>
            <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.85}
                style={[
                    styles.secondaryButton,
                    {
                        borderColor: colors.border,
                        backgroundColor: colors.searchBackground || colors.surface,
                    },
                ]}
            >
                <Text style={[styles.secondaryButtonText, { color: colors.textSecondary || colors.text }]}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
                onPress={() => {
                    const didSave = save();
                    if (didSave) {
                        onClose();
                    }
                }}
                activeOpacity={0.85}
                style={[
                    styles.primaryButton,
                    {
                        backgroundColor: colors.primary,
                    },
                ]}
            >
                <Text style={[styles.primaryButtonText, { color: colors.textInverse || '#fff' }]}>{t('saveChanges')}</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <AppBottomSheet
            visible={visible}
            onClose={onClose}
            title={t('notesAndDiscounts')}
            subtitle={t('addOrderNoteOrApplyDiscount')}
            snapPoints={['70%']}
            footer={footer}
        >
            <View style={styles.formSection}>
                <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>{t('orderNote')}</Text>
                <AppBottomSheetTextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder={t('addNoteForThisOrder')}
                    placeholderTextColor={colors.textSecondary || colors.text}
                    style={[
                        styles.textArea,
                        {
                            color: colors.text,
                            borderColor: colors.border,
                            backgroundColor: colors.searchBackground || colors.surface,
                        },
                    ]}
                    multiline
                />
            </View>

            <View style={styles.formSection}>
                <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>{t('discount')}</Text>

                {discountsLoading ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('loading')}</Text>
                ) : discounts.length === 0 ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                        {t('noDiscountsAvailable')}
                    </Text>
                ) : (
                    <View style={styles.discountGrid}>
                        <TouchableOpacity
                            onPress={() => requestPinForDiscount(null)}
                            activeOpacity={0.85}
                            style={[
                                styles.discountChip,
                                {
                                    borderColor: !selectedDiscountId ? colors.primary : colors.border,
                                    backgroundColor: !selectedDiscountId ? colors.primary + '18' : colors.searchBackground || colors.surface,
                                },
                            ]}
                        >
                            <Text style={[styles.discountChipText, { color: !selectedDiscountId ? colors.primary : colors.text }]}>
                                {t('noDiscount')}
                            </Text>
                        </TouchableOpacity>
                        {discounts.map((discount, index) => {
                            const discountId = getDiscountKey(discount, index);
                            const selected = selectedDiscountId === discountId;
                            const label = discount.discountName || discount.name || t('discount');
                            return (
                                <TouchableOpacity
                                    key={`${discountId}`}
                                    onPress={() => requestPinForDiscount(discountId ?? null)}
                                    activeOpacity={0.85}
                                    style={[
                                        styles.discountChip,
                                        {
                                            borderColor: selected ? colors.primary : colors.border,
                                            backgroundColor: selected ? colors.primary + '18' : colors.searchBackground || colors.surface,
                                        },
                                    ]}
                                >
                                    <Text style={[styles.discountChipText, { color: selected ? colors.primary : colors.text }]}>
                                        {label} · {getDiscountValueLabel(discount)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                {selectedDiscount?.discountType === 'CUSTOM' && (
                    <View style={styles.customDiscountSection}>
                        <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 6 }}>
                            {t('discount')} (%)
                        </Text>
                        <AppBottomSheetTextInput
                            value={customDiscountValue}
                            onChangeText={setCustomDiscountValue}
                            editable={pinVerified || discountChanged}
                            placeholder={t('enterCustomPercentage')}
                            placeholderTextColor={colors.textSecondary || colors.text}
                            keyboardType="decimal-pad"
                            style={[
                                styles.input,
                                {
                                    color: colors.text,
                                    borderColor: colors.border,
                                    backgroundColor: colors.searchBackground || colors.surface,
                                    fontWeight: '600',
                                },
                            ]}
                        />
                    </View>
                )}
            </View>

            <PinModal
                visible={pinModalVisible}
                onClose={handlePinClose}
                onVerified={handlePinVerified}
            />
        </AppBottomSheet>
    );
}

const styles = StyleSheet.create({
    formSection: {
        marginBottom: 18,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 8,
        letterSpacing: 0.2,
    },
    textArea: {
        minHeight: 96,
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        textAlignVertical: 'top',
        fontSize: 16,
    },
    discountGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    discountChip: {
        width: '48%',
        minHeight: 48,
        paddingHorizontal: 14,
        borderRadius: 16,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    discountChipText: {
        fontSize: 13,
        fontWeight: '700',
        textAlign: 'center',
    },
    customDiscountSection: {
        marginTop: 12,
    },
    input: {
        minHeight: 56,
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: 16,
        fontSize: 16,
    },
    footerActions: {
        flexDirection: 'row',
        gap: 10,
    },
    secondaryButton: {
        flex: 0.42,
        minHeight: 54,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryButtonText: {
        fontSize: 15,
        fontWeight: '700',
    },
    primaryButton: {
        flex: 1,
        minHeight: 56,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryButtonText: {
        fontSize: 16,
        fontWeight: '800',
    },
});
