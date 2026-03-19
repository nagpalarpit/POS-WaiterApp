import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import AppBottomSheet from './AppBottomSheet';
import { useTheme } from '../theme/ThemeProvider';
import { formatCurrency } from '../utils/currency';
import { normalizeMenuItemVariants } from '../hooks/useMenuData';

type VoucherOptionsModalProps = {
  visible: boolean;
  item: any;
  category: any;
  onClose: () => void;
  onConfirm: (variant: any, attribute: any, attributeValues: any[]) => void;
};

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

export default function VoucherOptionsModal({
  visible,
  item,
  category,
  onClose,
  onConfirm,
}: VoucherOptionsModalProps) {
  const { colors } = useTheme();
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [selectedAttribute, setSelectedAttribute] = useState<any>(null);
  const [selectedAttributeValues, setSelectedAttributeValues] = useState<any[]>([]);

  const normalizedVariants = useMemo(() => {
    return normalizeMenuItemVariants(item)
      .map((variant: any, variantIndex: number) => {
        const rawAttributes = Array.isArray(variant?.menuItemVariantAttributes)
          ? variant.menuItemVariantAttributes
          : Array.isArray(variant?.attributes)
            ? variant.attributes
            : [];

        return {
          ...variant,
          id: variant?.id ?? variant?.menuItemVariantId ?? variantIndex + 1,
          name: variant?.name ?? variant?.menuItemVariant?.name ?? `Variant ${variantIndex + 1}`,
          price: toNumber(
            variant?.price ?? variant?.unitPrice ?? variant?.menuItemVariant?.price,
            0,
          ),
          menuItemVariantAttributes: rawAttributes
            .filter(Boolean)
            .map((attribute: any, attributeIndex: number) => ({
              ...attribute,
              id:
                attribute?.id ??
                attribute?.menuItemVariantAttributeId ??
                attributeIndex + 1,
              name:
                attribute?.name ??
                attribute?.menuItemVariantAttribute?.name ??
                `Option ${attributeIndex + 1}`,
              selectionTypeId: Number(attribute?.selectionTypeId ?? 0),
              menuItemVariantAttributeValues: (
                Array.isArray(attribute?.menuItemVariantAttributeValues)
                  ? attribute.menuItemVariantAttributeValues
                  : Array.isArray(attribute?.attributeValues)
                    ? attribute.attributeValues
                    : []
              )
                .filter(Boolean)
                .map((value: any, valueIndex: number) => ({
                  ...value,
                  id:
                    value?.id ??
                    value?.menuItemVariantAttributeValueId ??
                    valueIndex + 1,
                  name:
                    value?.name ??
                    value?.menuItemVariantAttributeValue?.name ??
                    `Value ${valueIndex + 1}`,
                  price: toNumber(
                    value?.price ??
                      value?.unitPrice ??
                      value?.menuItemVariantAttributeValue?.price,
                    0,
                  ),
                  quantity: Number(value?.quantity ?? 0),
                }))
                .sort((a: any, b: any) =>
                  String(a.name || '').localeCompare(String(b.name || '')),
                ),
            }))
            .sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''))),
        };
      })
      .sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [item]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const initialVariant = normalizedVariants[0] ?? null;
    setSelectedVariant(initialVariant);
    setSelectedAttribute(null);
    setSelectedAttributeValues([]);
  }, [visible, normalizedVariants]);

  const isVariantVisible = normalizedVariants.length > 1;

  const selectVariant = (variant: any) => {
    setSelectedVariant(variant);
    setSelectedAttribute(null);
    setSelectedAttributeValues([]);
  };

  const checkAttributeValueSelected = (attributeValue: any) =>
    selectedAttributeValues.findIndex((value: any) => value?.id === attributeValue?.id) > -1;

  const selectAttributeValue = (attribute: any, attributeValue: any) => {
    setSelectedAttribute(attribute);

    if (
      checkAttributeValueSelected(attributeValue) &&
      Number(attribute?.selectionTypeId ?? 0) !== 0
    ) {
      const nextQuantity = Math.max(toNumber(attributeValue?.quantity, 1), 1) + 1;
      attributeValue.quantity = nextQuantity;
      setSelectedAttributeValues((prev) =>
        prev.map((value: any) =>
          value.id === attributeValue.id
            ? {
                ...value,
                quantity: nextQuantity,
              }
            : value,
        ),
      );
      return;
    }

    const nextValue = {
      ...attributeValue,
      quantity: 1,
    };
    attributeValue.quantity = 1;

    if (Number(attribute?.selectionTypeId ?? 0) === 0) {
      setSelectedAttributeValues([nextValue]);
      return;
    }

    setSelectedAttributeValues((prev) => [nextValue, ...prev]);
  };

  const getTotal = () => {
    let total = toNumber(item?.price, 0) + toNumber(selectedVariant?.price, 0);
    total = selectedAttributeValues.reduce(
      (sum: number, value: any) =>
        sum + toNumber(value?.price, 0) * Math.max(toNumber(value?.quantity, 1), 1),
      total,
    );
    return total;
  };

  const handleSave = () => {
    if (!selectedVariant) {
      return;
    }

    onConfirm(selectedVariant, selectedAttribute, selectedAttributeValues);
    onClose();
  };

  const footer = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>
          TOTAL
        </Text>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 4 }}>
          {formatCurrency(getTotal())}
        </Text>
      </View>

      <TouchableOpacity
        onPress={onClose}
        activeOpacity={0.85}
        style={{
          minHeight: 48,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
        }}
      >
        <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>Cancel</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleSave}
        disabled={!selectedVariant}
        activeOpacity={0.85}
        style={{
          minHeight: 48,
          borderRadius: 999,
          paddingHorizontal: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: !selectedVariant ? colors.border : colors.primary,
        }}
      >
        <Text style={{ color: colors.textInverse || '#fff', fontWeight: '800' }}>Continue</Text>
      </TouchableOpacity>
    </View>
  );

  if (!item) {
    return null;
  }

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title={item?.name || 'Options'}
      subtitle={category?.name ? `Category: ${category.name}` : 'Options'}
      snapPoints={['92%']}
      footer={footer}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
        {isVariantVisible ? (
          <View style={{ marginBottom: 22 }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 11,
                fontWeight: '700',
                letterSpacing: 0.6,
                marginBottom: 10,
              }}
            >
              VARIANT
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {normalizedVariants.map((variant: any) => {
                const selected = variant.id === selectedVariant?.id;
                return (
                  <TouchableOpacity
                    key={`voucher-variant-${variant.id}`}
                    onPress={() => selectVariant(variant)}
                    activeOpacity={0.85}
                    style={{
                      width: '48%',
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? `${colors.primary}1f` : colors.surface,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                    }}
                  >
                    <Text style={{ color: selected ? colors.primary : colors.text, fontWeight: '700' }}>
                      {variant.name}
                    </Text>
                    <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 12 }}>
                      {formatCurrency(toNumber(variant.price, 0))}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        {selectedVariant?.menuItemVariantAttributes?.length
          ? selectedVariant.menuItemVariantAttributes.map((attribute: any) => (
              <View key={`voucher-attribute-${attribute.id}`} style={{ marginBottom: 20 }}>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 11,
                    fontWeight: '700',
                    letterSpacing: 0.6,
                    marginBottom: 10,
                  }}
                >
                  {attribute.name}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {attribute.menuItemVariantAttributeValues?.map((attributeValue: any) => {
                    const selected = checkAttributeValueSelected(attributeValue);
                    const selectedEntry = selectedAttributeValues.find(
                      (value: any) => value?.id === attributeValue?.id,
                    );
                    return (
                      <TouchableOpacity
                        key={`voucher-attribute-value-${attribute.id}-${attributeValue.id}`}
                        onPress={() => selectAttributeValue(attribute, attributeValue)}
                        activeOpacity={0.85}
                        style={{
                          width: '48%',
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected ? `${colors.primary}1a` : colors.surface,
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          position: 'relative',
                        }}
                      >
                        {selected && selectedEntry?.quantity ? (
                          <View
                            style={{
                              position: 'absolute',
                              top: -8,
                              right: -8,
                              minWidth: 24,
                              height: 24,
                              borderRadius: 12,
                              backgroundColor: colors.primary,
                              alignItems: 'center',
                              justifyContent: 'center',
                              paddingHorizontal: 6,
                            }}
                          >
                            <Text style={{ color: colors.textInverse || '#fff', fontSize: 11, fontWeight: '700' }}>
                              {selectedEntry.quantity}
                            </Text>
                          </View>
                        ) : null}

                        <Text style={{ color: selected ? colors.primary : colors.text, fontWeight: '600' }}>
                          {attributeValue.name}
                        </Text>
                        <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 12 }}>
                          {formatCurrency(toNumber(attributeValue.price, 0))}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))
          : null}
      </ScrollView>
    </AppBottomSheet>
  );
}
