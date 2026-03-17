import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useToast } from './ToastProvider';
import BottomDrawer from './BottomDrawer';

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
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <TouchableOpacity
        onPress={onClose}
        style={{
          flex: 1,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>
          Cancel
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleSave}
        style={{
          flex: 1,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 12,
          backgroundColor: isValid ? colors.primary : colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: colors.textInverse, fontWeight: '700' }}>
          Save Extra
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <BottomDrawer
      visible={visible}
      onClose={onClose}
      title="Add Extra"
      subtitle="Create a quick extra item for this order."
      footer={footer}
      maxHeightRatio={0.78}
      keyboardBehavior="expand"
    >
      <View style={{ marginBottom: 12 }}>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 12,
            fontWeight: '600',
            marginBottom: 6,
          }}
        >
          Item Name
        </Text>
        <TextInput
          value={itemName}
          onChangeText={setItemName}
          placeholder="Enter extra item name"
          placeholderTextColor={colors.textSecondary}
          style={{
            color: colors.text,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: colors.surface,
          }}
        />
      </View>

      <View style={{ marginBottom: 16 }}>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 12,
            fontWeight: '600',
            marginBottom: 6,
          }}
        >
          Price
        </Text>
        <TextInput
          value={priceInput}
          onChangeText={setPriceInput}
          placeholder="0.00"
          placeholderTextColor={colors.textSecondary}
          keyboardType="decimal-pad"
          style={{
            color: colors.text,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: colors.surface,
          }}
        />
      </View>

      <View style={{ marginBottom: 8 }}>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 12,
            fontWeight: '600',
            marginBottom: 8,
          }}
        >
          Category
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { id: EXTRA_CATEGORY.FOOD, label: 'Food' },
            { id: EXTRA_CATEGORY.DRINK, label: 'Drink' },
          ].map((entry) => {
            const selected = extraCategory === entry.id;
            return (
              <TouchableOpacity
                key={entry.id}
                onPress={() => setExtraCategory(entry.id)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected
                    ? `${colors.primary}20`
                    : colors.surface,
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    color: selected ? colors.primary : colors.text,
                    fontWeight: '600',
                    fontSize: 12,
                  }}
                >
                  {entry.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </BottomDrawer>
  );
}
