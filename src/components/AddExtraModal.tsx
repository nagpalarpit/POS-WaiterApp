import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import Card from './Card';
import { useToast } from './ToastProvider';

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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <Pressable
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
          }}
        />

        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 16,
          }}
        >
          <Card style={{ width: '100%', maxWidth: 400 }} rounded={14}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <Text
                style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}
              >
                Add Extra
              </Text>
              <TouchableOpacity onPress={onClose}>
                <MaterialCommunityIcons
                  name="close"
                  size={24}
                  color={colors.text}
                />
              </TouchableOpacity>
            </View>

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
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
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
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  backgroundColor: colors.surface,
                }}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {[ 
                { id: EXTRA_CATEGORY.FOOD, label: 'Food' },
                { id: EXTRA_CATEGORY.DRINK, label: 'Drink' },
                { id: EXTRA_CATEGORY.ZERO, label: '0%' },
              ].map((entry) => {
                const selected = extraCategory === entry.id;
                return (
                  <TouchableOpacity
                    key={entry.id}
                    onPress={() => setExtraCategory(entry.id)}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
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

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                  opacity: isValid ? 1 : 0.5,
                }}
              >
                <Text style={{ color: colors.textInverse || '#fff', fontWeight: '700' }}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
