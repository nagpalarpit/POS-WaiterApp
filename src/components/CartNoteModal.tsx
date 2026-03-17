import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { useTheme } from '../theme/ThemeProvider';
import { getCurrencySymbol } from '../utils/currency';
import PinModal from './PinModal';
import { CartDiscount } from '../services/cartService';
import {
  DiscountOption,
  fetchDiscountsForCompany,
  loadCachedDiscounts,
} from '../services/discountService';
import { useToast } from './ToastProvider';
import BottomDrawer from './BottomDrawer';

interface Props {
  visible: boolean;
  initialNote?: string;
  initialDiscount?: CartDiscount | null;
  onClose: () => void;
  onSave: (note: string, discount: CartDiscount | null) => void;
}

export default function CartNoteModal({
  visible,
  initialNote = '',
  initialDiscount = null,
  onClose,
  onSave,
}: Props) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const [note, setNote] = useState(initialNote || '');
  const [discounts, setDiscounts] = useState<DiscountOption[]>([]);
  const [discountsLoading, setDiscountsLoading] = useState(false);
  const [selectedDiscountId, setSelectedDiscountId] = useState<
    string | number | null
  >(initialDiscount?.discountId ?? null);
  const [customDiscountValue, setCustomDiscountValue] = useState(
    String(initialDiscount?.discountValue || ''),
  );
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const [pendingDiscountId, setPendingDiscountId] = useState<
    string | number | null
  >(null);
  const [hasPendingDiscountSelection, setHasPendingDiscountSelection] =
    useState(false);
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
  }, [initialDiscount, initialNote, visible]);

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
          const matchIndex = list.findIndex((discount) => {
            const name = discount.discountName || discount.name || '';
            return (
              (name && name === initialDiscount.discountName) ||
              (discount.discountValue === initialDiscount.discountValue &&
                discount.discountType === initialDiscount.discountType)
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
    if (
      discount.discountType === 'PERCENTAGE' ||
      discount.discountType === 'CUSTOM'
    ) {
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
      showToast('error', 'Please enter PIN to apply discount.');
      return false;
    }

    let discountValue = selectedDiscount.discountValue;
    if (selectedDiscount.discountType === 'CUSTOM') {
      const parsed = parseFloat(customDiscountValue || '0');
      if (!Number.isFinite(parsed) || parsed <= 0) {
        showToast('error', 'Enter a valid custom discount percentage.');
        return false;
      }
      if (parsed > 100) {
        showToast('error', 'Custom discount cannot exceed 100%.');
        return false;
      }
      discountValue = parsed;
    }

    const discount: CartDiscount = {
      discountId: selectedDiscount.id ?? selectedDiscount._id,
      discountName:
        selectedDiscount.discountName || selectedDiscount.name || 'Discount',
      discountType: selectedDiscount.discountType,
      discountValue,
    };
    onSave(note, discount);
    return true;
  };

  const footer = (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <TouchableOpacity
        onPress={onClose}
        style={{
          flex: 1,
          padding: 12,
          borderRadius: 10,
          borderWidth: 1.5,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <Text
          style={{
            textAlign: 'center',
            color: colors.text,
            fontWeight: '600',
          }}
        >
          Cancel
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => {
          const didSave = save();
          if (didSave) {
            onClose();
          }
        }}
        style={{
          flex: 1,
          padding: 12,
          borderRadius: 10,
          backgroundColor: colors.primary,
        }}
      >
        <Text
          style={{
            textAlign: 'center',
            color: colors.textInverse,
            fontWeight: '700',
          }}
        >
          Save Changes
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <>
      <BottomDrawer
        visible={visible}
        onClose={onClose}
        title="Notes & Discounts"
        subtitle="Add order notes and apply discounts safely."
        footer={footer}
        fullHeight
        maxHeightRatio={0.92}
      >
        <View style={{ marginBottom: 16 }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 12,
              fontWeight: '600',
              marginBottom: 8,
            }}
          >
            Order Note
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Add a note for this order..."
            placeholderTextColor={colors.textSecondary}
            style={{
              minHeight: 110,
              color: colors.text,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              padding: 12,
              backgroundColor: colors.surface,
              textAlignVertical: 'top',
            }}
            multiline
          />
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 12,
              fontWeight: '600',
              marginBottom: 8,
            }}
          >
            Discount
          </Text>

          {discountsLoading ? (
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Loading discounts...
            </Text>
          ) : discounts.length === 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              No discounts available for this company.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              <TouchableOpacity
                onPress={() => requestPinForDiscount(null)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: !selectedDiscountId ? colors.primary : colors.border,
                  backgroundColor: !selectedDiscountId
                    ? colors.primary + '20'
                    : colors.surface,
                }}
              >
                <Text
                  style={{
                    color: !selectedDiscountId ? colors.primary : colors.text,
                    fontWeight: '600',
                    fontSize: 12,
                  }}
                >
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
                      backgroundColor: selected
                        ? colors.primary + '20'
                        : colors.surface,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? colors.primary : colors.text,
                        fontWeight: '600',
                        fontSize: 12,
                      }}
                    >
                      {label} · {getDiscountValueLabel(discount)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {selectedDiscount?.discountType === 'CUSTOM' ? (
            <View style={{ marginTop: 12 }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 11,
                  marginBottom: 6,
                }}
              >
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
                  borderRadius: 10,
                  padding: 12,
                  backgroundColor: colors.surface,
                  fontWeight: '600',
                }}
              />
            </View>
          ) : null}
        </View>
      </BottomDrawer>

      <PinModal
        visible={pinModalVisible}
        onClose={handlePinClose}
        onVerified={handlePinVerified}
      />
    </>
  );
}
