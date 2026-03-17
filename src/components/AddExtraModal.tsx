import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useToast } from './ToastProvider';
import AppBottomSheet from './AppBottomSheet';
import AppBottomSheetTextInput from './AppBottomSheetTextInput';

const EXTRA_CATEGORY = {
  FOOD: 1,
  DRINK: 2,
  ZERO: 3,
} as const;

type ExtraCategoryType = typeof EXTRA_CATEGORY[keyof typeof EXTRA_CATEGORY];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSave: (payload: { itemName: string; price: number; extraCategory: number }) => void;
}

const parsePriceValue = (value: string): number => {
  if (!value) return 0;
  const normalized = value.replace(/,/g, '.');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function AddExtraModal({ visible, onClose, onSave }: Props) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const [itemName, setItemName] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [extraCategory, setExtraCategory] = useState<ExtraCategoryType>(
    EXTRA_CATEGORY.FOOD,
  );

  useEffect(() => {
    if (visible) {
      setItemName('');
      setPriceInput('');
      setExtraCategory(EXTRA_CATEGORY.FOOD);
    }
  }, [visible]);

  const parsedPrice = useMemo(() => parsePriceValue(priceInput), [priceInput]);
  const isValid = useMemo(
    () => itemName.trim().length > 0 && parsedPrice > 0,
    [itemName, parsedPrice],
  );

  const handleSave = () => {
    if (!isValid) {
      showToast('error', 'Enter item name and valid price.');
      return;
    }
    onSave({
      itemName: itemName.trim(),
      price: parsedPrice,
      extraCategory,
    });
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
        <Text style={[styles.secondaryButtonText, { color: colors.textSecondary || colors.text }]}>
          Cancel
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleSave}
        activeOpacity={0.85}
        style={[
          styles.primaryButton,
          {
            backgroundColor: colors.primary,
            opacity: isValid ? 1 : 0.5,
          },
        ]}
      >
        <MaterialIcons name="add-circle-outline" size={18} color={colors.textInverse || '#fff'} />
        <Text style={[styles.primaryButtonText, { color: colors.textInverse || '#fff' }]}>
          Save Extra
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="Add Extra"
      subtitle="Create an extra item with a name, price, and category."
      snapPoints={['70%']}
      footer={footer}
    >
      <View style={styles.formSection}>
        <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>Item Name</Text>
        <View
          style={[
            styles.inputWrap,
            {
              borderColor: colors.border,
              backgroundColor: colors.searchBackground || colors.surface,
            },
          ]}
        >
          <MaterialIcons
            name="fastfood"
            size={18}
            color={colors.textSecondary || colors.text}
            style={styles.inputIcon}
          />
          <AppBottomSheetTextInput
            value={itemName}
            onChangeText={setItemName}
            placeholder="Enter extra item name"
            placeholderTextColor={colors.textSecondary || colors.text}
            style={[styles.input, { color: colors.text }]}
          />
        </View>
      </View>

      <View style={styles.formSection}>
        <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>Price</Text>
        <View
          style={[
            styles.inputWrap,
            {
              borderColor: colors.border,
              backgroundColor: colors.searchBackground || colors.surface,
            },
          ]}
        >
          <MaterialIcons
            name="euro-symbol"
            size={18}
            color={colors.textSecondary || colors.text}
            style={styles.inputIcon}
          />
          <AppBottomSheetTextInput
            value={priceInput}
            onChangeText={setPriceInput}
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary || colors.text}
            keyboardType="decimal-pad"
            style={[styles.input, { color: colors.text }]}
          />
        </View>
      </View>

      <View style={styles.formSection}>
        <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>Category</Text>
        <View style={styles.categoryRow}>
          {[
            { id: EXTRA_CATEGORY.FOOD, label: 'Food' },
            { id: EXTRA_CATEGORY.DRINK, label: 'Drink' },
          ].map((entry) => {
            const selected = extraCategory === entry.id;
            return (
              <TouchableOpacity
                key={entry.id}
                onPress={() => setExtraCategory(entry.id)}
                activeOpacity={0.85}
                style={[
                  styles.categoryChip,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? `${colors.primary}18` : colors.searchBackground || colors.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    { color: selected ? colors.primary : colors.text },
                  ]}
                >
                  {entry.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
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
  inputWrap: {
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 14,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  categoryChip: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  categoryChipText: {
    fontSize: 14,
    fontWeight: '700',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 10,
  },
});
