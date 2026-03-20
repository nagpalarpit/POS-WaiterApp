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
  availableCategories?: any[];
  onClose: () => void;
  onConfirm: (payload: {
    item: any;
    variant?: any;
    attribute?: any;
    attributeValues?: any[];
  }) => void;
};

type VoucherSlot = {
  id: string;
  categoryId: number;
  categoryName: string;
  attributeSelectionLimit: number;
  attributeSelectionTypeId: number;
  items: any[];
};

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const cloneData = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const normalizeOptionVariants = (item: any) =>
  normalizeMenuItemVariants(item)
    .map((variant: any, variantIndex: number) => ({
      ...variant,
      id: variant?.id ?? variant?.menuItemVariantId ?? variantIndex + 1,
      name: variant?.name ?? variant?.menuItemVariant?.name ?? `Variant ${variantIndex + 1}`,
      price: toNumber(variant?.price ?? variant?.unitPrice ?? variant?.menuItemVariant?.price, 0),
      menuItemVariantAttributes: (Array.isArray(variant?.menuItemVariantAttributes)
        ? variant.menuItemVariantAttributes
        : Array.isArray(variant?.attributes)
          ? variant.attributes
          : []
      )
        .filter(Boolean)
        .map((attribute: any, attributeIndex: number) => ({
          ...attribute,
          id: attribute?.id ?? attribute?.menuItemVariantAttributeId ?? attributeIndex + 1,
          name:
            attribute?.name ??
            attribute?.menuItemVariantAttribute?.name ??
            `Option ${attributeIndex + 1}`,
          selectionTypeId: Number(attribute?.selectionTypeId ?? 0),
          menuItemVariantAttributeValues: (Array.isArray(attribute?.menuItemVariantAttributeValues)
            ? attribute.menuItemVariantAttributeValues
            : Array.isArray(attribute?.attributeValues)
              ? attribute.attributeValues
              : []
          ).map((value: any, valueIndex: number) => ({
            ...value,
            id: value?.id ?? value?.menuItemVariantAttributeValueId ?? valueIndex + 1,
            name:
              value?.name ??
              value?.menuItemVariantAttributeValue?.name ??
              `Value ${valueIndex + 1}`,
            price: toNumber(
              value?.price ?? value?.unitPrice ?? value?.menuItemVariantAttributeValue?.price,
              0,
            ),
          })),
        })),
    }))
    .sort((a: any, b: any) => String(a?.name || '').localeCompare(String(b?.name || '')));

const buildVoucherSlots = (item: any, availableCategories: any[]): VoucherSlot[] => {
  const voucherCategories = Array.isArray(item?.vouchers?.customerBuys?.categories)
    ? item.vouchers.customerBuys.categories
    : [];
  if (!voucherCategories.length || !availableCategories.length) return [];

  const slots: VoucherSlot[] = [];
  voucherCategories.forEach((voucherCategory: any, voucherCategoryIndex: number) => {
    const matchedCategory = availableCategories.find(
      (entry: any) => Number(entry?.id) === Number(voucherCategory?.categoryId),
    );
    if (!matchedCategory) return;

    const allowedItemIds = Array.isArray(voucherCategory?.items)
      ? voucherCategory.items.map((entry: any) => Number(entry?.itemId ?? 0)).filter(Boolean)
      : [];

    const items = (Array.isArray(matchedCategory?.menuItems) ? matchedCategory.menuItems : [])
      .filter((menuItem: any) =>
        allowedItemIds.length > 0 ? allowedItemIds.includes(Number(menuItem?.id)) : true,
      )
      .map((menuItem: any) => ({
        ...menuItem,
        menuItemVariants: normalizeOptionVariants(menuItem),
      }))
      .sort((a: any, b: any) => Number(a?.customId ?? 0) - Number(b?.customId ?? 0));

    const quantity = Math.max(toNumber(voucherCategory?.quantity, 1), 1);
    for (let slotIndex = 0; slotIndex < quantity; slotIndex += 1) {
      slots.push({
        id: `${voucherCategoryIndex}-${slotIndex}-${matchedCategory.id}`,
        categoryId: Number(matchedCategory.id),
        categoryName: String(matchedCategory.name || ''),
        attributeSelectionLimit: Math.max(
          toNumber(voucherCategory?.attributeValueSelectionLimit, 0),
          0,
        ),
        attributeSelectionTypeId: toNumber(voucherCategory?.attributeSelectionTypeId, 0),
        items: items.map((entry: any) => cloneData(entry)),
      });
    }
  });

  return slots;
};

export default function VoucherOptionsModal({
  visible,
  item,
  category,
  availableCategories = [],
  onClose,
  onConfirm,
}: VoucherOptionsModalProps) {
  const { colors } = useTheme();
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [selectedAttribute, setSelectedAttribute] = useState<any>(null);
  const [selectedAttributeValues, setSelectedAttributeValues] = useState<any[]>([]);
  const [selectedVoucherItems, setSelectedVoucherItems] = useState<any[]>([]);
  const [selectedVoucherVariants, setSelectedVoucherVariants] = useState<any[]>([]);
  const [selectedVoucherAttributes, setSelectedVoucherAttributes] = useState<any[][]>([]);
  const [selectedVoucherExtra, setSelectedVoucherExtra] = useState<number[]>([]);

  const normalizedVariants = useMemo(() => normalizeOptionVariants(item), [item]);
  const voucherSlots = useMemo(
    () => buildVoucherSlots(item, availableCategories),
    [availableCategories, item],
  );
  const isDiscountVoucher = voucherSlots.length > 0;
  const hasRegularVariants = normalizedVariants.length > 0;
  const isVariantVisible = normalizedVariants.length > 1;

  useEffect(() => {
    if (!visible) return;
    setSelectedVariant(normalizedVariants[0] ?? null);
    setSelectedAttribute(null);
    setSelectedAttributeValues([]);
    setSelectedVoucherItems(voucherSlots.map(() => null));
    setSelectedVoucherVariants(voucherSlots.map(() => null));
    setSelectedVoucherAttributes(voucherSlots.map(() => []));
    setSelectedVoucherExtra(voucherSlots.map(() => 0));
  }, [visible, normalizedVariants, voucherSlots]);

  const checkAttributeValueSelected = (attributeValue: any) =>
    selectedAttributeValues.findIndex((value: any) => value?.id === attributeValue?.id) > -1;

  const selectVariant = (variant: any) => {
    setSelectedVariant(variant);
    setSelectedAttribute(null);
    setSelectedAttributeValues([]);
  };

  const selectAttributeValue = (attribute: any, attributeValue: any) => {
    setSelectedAttribute(attribute);
    if (
      checkAttributeValueSelected(attributeValue) &&
      Number(attribute?.selectionTypeId ?? 0) !== 0
    ) {
      const nextQuantity = Math.max(toNumber(attributeValue?.quantity, 1), 1) + 1;
      setSelectedAttributeValues((prev) =>
        prev.map((value: any) =>
          value.id === attributeValue.id ? { ...value, quantity: nextQuantity } : value,
        ),
      );
      return;
    }

    const nextValue = { ...attributeValue, quantity: 1 };
    if (Number(attribute?.selectionTypeId ?? 0) === 0) {
      setSelectedAttributeValues([nextValue]);
      return;
    }
    setSelectedAttributeValues((prev) => [nextValue, ...prev]);
  };

  const getTotal = () =>
    selectedAttributeValues.reduce(
      (sum: number, value: any) =>
        sum + toNumber(value?.price, 0) * Math.max(toNumber(value?.quantity, 1), 1),
      toNumber(item?.price, 0) + toNumber(selectedVariant?.price, 0),
    );

  const getVoucherVariant = (index: number) =>
    selectedVoucherVariants[index] || selectedVoucherItems[index]?.menuItemVariants?.[0] || null;

  const isVoucherVariantVisible = (index: number) =>
    Array.isArray(selectedVoucherItems[index]?.menuItemVariants) &&
    selectedVoucherItems[index].menuItemVariants.length > 1;

  const updateVoucherExtra = (index: number, nextValues: any[], slot: VoucherSlot) => {
    const selectionLimit = Math.max(toNumber(slot?.attributeSelectionLimit, 0), 0);
    const extra = nextValues.reduce((sum, value, valueIndex) => {
      if (valueIndex < selectionLimit) {
        value.newPrice = 0;
        return sum;
      }
      const price = toNumber(value?.price, 0);
      value.newPrice = price;
      return sum + price;
    }, 0);
    setSelectedVoucherExtra((prev) => {
      const next = [...prev];
      next[index] = extra;
      return next;
    });
  };

  const selectVoucherItem = (selectedItem: any, index: number, slot: VoucherSlot) => {
    const nextItem = cloneData(selectedItem);
    const nextVariant =
      Array.isArray(nextItem?.menuItemVariants) && nextItem.menuItemVariants.length <= 1
        ? nextItem.menuItemVariants[0] || null
        : null;

    setSelectedVoucherItems((prev) => {
      const next = [...prev];
      next[index] = nextItem;
      return next;
    });
    setSelectedVoucherVariants((prev) => {
      const next = [...prev];
      next[index] = nextVariant;
      return next;
    });
    setSelectedVoucherAttributes((prev) => {
      const next = [...prev];
      next[index] = [];
      return next;
    });
    setSelectedVoucherExtra((prev) => {
      const next = [...prev];
      next[index] = 0;
      return next;
    });

    const defaultVariant = nextVariant || nextItem?.menuItemVariants?.[0];
    const defaultAttributeValue =
      defaultVariant?.menuItemVariantAttributes?.[0]?.menuItemVariantAttributeValues?.[0] || null;
    if (
      defaultAttributeValue &&
      (Number(nextItem?.menuCategoryId) === 45 || Number(slot?.categoryId) === 48)
    ) {
      const nextValues = [{ ...defaultAttributeValue }];
      setSelectedVoucherAttributes((prev) => {
        const next = [...prev];
        next[index] = nextValues;
        return next;
      });
      updateVoucherExtra(index, nextValues, slot);
    }
  };

  useEffect(() => {
    if (!visible || !isDiscountVoucher) return;
    voucherSlots.forEach((slot, index) => {
      if (slot.items.length === 1 && !selectedVoucherItems[index]) {
        selectVoucherItem(slot.items[0], index, slot);
      }
    });
  }, [visible, isDiscountVoucher, selectedVoucherItems, voucherSlots]);

  const selectVoucherVariant = (variant: any, index: number) => {
    setSelectedVoucherVariants((prev) => {
      const next = [...prev];
      next[index] = cloneData(variant);
      return next;
    });
    setSelectedVoucherAttributes((prev) => {
      const next = [...prev];
      next[index] = [];
      return next;
    });
    setSelectedVoucherExtra((prev) => {
      const next = [...prev];
      next[index] = 0;
      return next;
    });
  };

  const toggleVoucherValue = (attributeValue: any, index: number, slot: VoucherSlot) => {
    const allowMulti = Number(slot?.attributeSelectionTypeId ?? 0) === 1;
    const current = Array.isArray(selectedVoucherAttributes[index])
      ? selectedVoucherAttributes[index]
      : [];
    const exists = current.some((entry: any) => entry?.id === attributeValue?.id);
    const nextValues = allowMulti
      ? exists
        ? current.filter((entry: any) => entry?.id !== attributeValue?.id)
        : [...current, { ...attributeValue }]
      : exists
        ? []
        : [{ ...attributeValue }];

    setSelectedVoucherAttributes((prev) => {
      const next = [...prev];
      next[index] = nextValues;
      return next;
    });
    updateVoucherExtra(index, nextValues, slot);
  };

  const getVoucherTotal = () =>
    selectedVoucherExtra.reduce(
      (sum, value) => sum + toNumber(value, 0),
      toNumber(item?.price, 0) +
        selectedVoucherVariants.reduce((sum, variant) => sum + toNumber(variant?.price, 0), 0),
    );

  const voucherReady = voucherSlots.every((slot, index) => {
    if (!selectedVoucherItems[index]) return false;
    if (isVoucherVariantVisible(index)) return !!selectedVoucherVariants[index];
    return true;
  });

  const handleRegularSave = () => {
    onConfirm({
      item,
      variant: selectedVariant ?? normalizedVariants[0] ?? null,
      attribute: selectedAttribute,
      attributeValues: selectedAttributeValues,
    });
    onClose();
  };

  const handleVoucherSave = () => {
    if (!voucherReady) return;

    const voucherItem = cloneData(item);
    const selectedItems = selectedVoucherItems.map((selectedItem: any, index: number) => {
      const nextItem = cloneData(selectedItem);
      const selectedVariantForIndex = getVoucherVariant(index);
      const selectedValues = selectedVoucherAttributes[index] || [];

      nextItem.menuItemVariants = selectedVariantForIndex ? [cloneData(selectedVariantForIndex)] : [];
      nextItem.menuItemVariants = nextItem.menuItemVariants.map((variant: any) => ({
        ...variant,
        menuItemVariantAttributes: (Array.isArray(variant?.menuItemVariantAttributes)
          ? variant.menuItemVariantAttributes
          : []
        ).map((attribute: any) => ({
          ...attribute,
          menuItemVariantAttributeValues: (Array.isArray(attribute?.menuItemVariantAttributeValues)
            ? attribute.menuItemVariantAttributeValues
            : []
          )
            .filter((value: any) =>
              selectedValues.some((selectedValue: any) => selectedValue?.id === value?.id),
            )
            .map((value: any) => {
              const matched = selectedValues.find(
                (selectedValue: any) => selectedValue?.id === value?.id,
              );
              return { ...value, price: matched?.newPrice ?? value?.price ?? 0 };
            }),
        })),
      }));

      return nextItem;
    });

    const preservedGets = Array.isArray(voucherItem?.discountItems)
      ? voucherItem.discountItems.filter((entry: any) => Array.isArray(entry?.customerGets))
      : [];
    voucherItem.discountItems = [...preservedGets, { customerBuys: selectedItems }];
    voucherItem.price = getVoucherTotal();

    onConfirm({ item: voucherItem, variant: null, attribute: null, attributeValues: [] });
    onClose();
  };

  const footer = (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}
        >
          TOTAL
        </Text>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 4 }}>
          {formatCurrency(isDiscountVoucher ? getVoucherTotal() : getTotal())}
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
        onPress={isDiscountVoucher ? handleVoucherSave : handleRegularSave}
        disabled={isDiscountVoucher ? !voucherReady : hasRegularVariants ? !selectedVariant : false}
        activeOpacity={0.85}
        style={{
          minHeight: 48,
          borderRadius: 999,
          paddingHorizontal: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor:
            (isDiscountVoucher
              ? !voucherReady
              : hasRegularVariants
                ? !selectedVariant
                : false)
              ? colors.border
              : colors.primary,
        }}
      >
        <Text style={{ color: colors.textInverse || '#fff', fontWeight: '800' }}>
          {isDiscountVoucher ? 'Add to Cart' : 'Continue'}
        </Text>
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
        {isDiscountVoucher ? (
          <View style={{ gap: 20 }}>
            {voucherSlots.map((slot, index) => {
              const selectedItem = selectedVoucherItems[index];
              const activeVariant = getVoucherVariant(index);
              const selectedValues = selectedVoucherAttributes[index] || [];

              return (
                <View key={`voucher-slot-${slot.id}`} style={{ marginBottom: 8 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 16,
                      fontWeight: '800',
                      marginBottom: 10,
                    }}
                  >
                    {slot.categoryName}
                  </Text>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {slot.items.map((menuItem: any) => {
                      const selected = selectedItem?.id === menuItem?.id;
                      return (
                        <TouchableOpacity
                          key={`voucher-slot-item-${slot.id}-${menuItem.id}`}
                          onPress={() => selectVoucherItem(menuItem, index, slot)}
                          activeOpacity={0.85}
                          style={{
                            width: '48%',
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: selected ? colors.primary : colors.border,
                            backgroundColor: selected ? `${colors.primary}1a` : colors.surface,
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                          }}
                        >
                          <Text style={{ color: selected ? colors.primary : colors.text, fontWeight: '700' }}>
                            {menuItem?.customId ? `${menuItem.customId}. ` : ''}
                            {menuItem?.name}
                          </Text>
                          <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 12 }}>
                            {formatCurrency(toNumber(menuItem?.price, 0))}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {selectedItem && isVoucherVariantVisible(index) ? (
                    <View style={{ marginTop: 16 }}>
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
                        {selectedItem.menuItemVariants.map((variant: any) => {
                          const selected = activeVariant?.id === variant?.id;
                          return (
                            <TouchableOpacity
                              key={`voucher-slot-variant-${slot.id}-${variant.id}`}
                              onPress={() => selectVoucherVariant(variant, index)}
                              activeOpacity={0.85}
                              style={{
                                width: '48%',
                                borderRadius: 16,
                                borderWidth: 1,
                                borderColor: selected ? colors.primary : colors.border,
                                backgroundColor: selected ? `${colors.primary}1a` : colors.surface,
                                paddingHorizontal: 14,
                                paddingVertical: 12,
                              }}
                            >
                              <Text style={{ color: selected ? colors.primary : colors.text, fontWeight: '700' }}>
                                {variant?.name}
                              </Text>
                              <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 12 }}>
                                {formatCurrency(toNumber(variant?.price, 0))}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  {activeVariant?.menuItemVariantAttributes?.length ? (
                    <View style={{ marginTop: 16, gap: 16 }}>
                      {activeVariant.menuItemVariantAttributes.map((attribute: any) => (
                        <View key={`voucher-slot-attribute-${slot.id}-${attribute.id}`}>
                          <Text
                            style={{
                              color: colors.textSecondary,
                              fontSize: 11,
                              fontWeight: '700',
                              letterSpacing: 0.6,
                              marginBottom: 10,
                            }}
                          >
                            {attribute?.name}
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                            {attribute.menuItemVariantAttributeValues?.map((attributeValue: any) => {
                              const selected = selectedValues.some(
                                (value: any) => value?.id === attributeValue?.id,
                              );
                              return (
                                <TouchableOpacity
                                  key={`voucher-slot-value-${slot.id}-${attribute.id}-${attributeValue.id}`}
                                  onPress={() => toggleVoucherValue(attributeValue, index, slot)}
                                  activeOpacity={0.85}
                                  style={{
                                    width: '48%',
                                    borderRadius: 16,
                                    borderWidth: 1,
                                    borderColor: selected ? colors.primary : colors.border,
                                    backgroundColor: selected ? `${colors.primary}1a` : colors.surface,
                                    paddingHorizontal: 14,
                                    paddingVertical: 12,
                                  }}
                                >
                                  <Text style={{ color: selected ? colors.primary : colors.text, fontWeight: '600' }}>
                                    {attributeValue?.name}
                                  </Text>
                                  <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 12 }}>
                                    {formatCurrency(toNumber(attributeValue?.price, 0))}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <>
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
                                <Text
                                  style={{ color: colors.textInverse || '#fff', fontSize: 11, fontWeight: '700' }}
                                >
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
          </>
        )}
      </ScrollView>
    </AppBottomSheet>
  );
}
