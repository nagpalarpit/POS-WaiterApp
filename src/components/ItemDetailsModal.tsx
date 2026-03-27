import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    FlatList,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { formatCurrency } from '../utils/currency';
import AppBottomSheet from './AppBottomSheet';
import { useTranslation } from '../contexts/LanguageContext';

interface MenuItemVariant {
    id: number;
    name: string;
    price?: number;
    description?: string;
    menuItemVariantAttributes?: MenuItemVariantAttribute[];
}

interface MenuItemVariantAttribute {
    id: number;
    name: string;
    price?: number;
    selectionTypeId: number;
    menuItemVariantAttributeValues?: AttributeValue[];
}

interface AttributeValue {
    id: number;
    name: string;
    price?: number;
    description?: string;
    quantity?: number;
}

interface ItemDetailsModalProps {
    visible: boolean;
    item: any;
    category: any;
    onClose: () => void;
    onConfirm: (variant: MenuItemVariant | null, attribute: MenuItemVariantAttribute | null, attributeValues: AttributeValue[]) => void;
}

export default function ItemDetailsModal({
    visible,
    item,
    category,
    onClose,
    onConfirm,
}: ItemDetailsModalProps) {
    const { colors } = useTheme();
    const { t } = useTranslation();

    const [selectedVariant, setSelectedVariant] = useState<MenuItemVariant | null>(null);
    const [selectedAttribute, setSelectedAttribute] = useState<MenuItemVariantAttribute | null>(null);
    const [selectedAttributeValues, setSelectedAttributeValues] = useState<AttributeValue[]>([]);

    const normalizedVariants = useMemo<MenuItemVariant[]>(() => {
        const rawVariants = Array.isArray(item?.menuItemVariants)
            ? item.menuItemVariants
            : Array.isArray(item?.variants)
                ? item.variants
                    : item?.menuItemVariant
                        ? [item.menuItemVariant]
                        : [];

        const topLevelAttributes = Array.isArray(item?.menuItemVariantAttributes)
            ? item.menuItemVariantAttributes
            : Array.isArray(item?.attributes)
                ? item.attributes
                : [];

        const variants =
            rawVariants.length > 0
                ? rawVariants
                : topLevelAttributes.length > 0
                    ? [
                        {
                            id: item?.id ?? 1,
                            name: item?.name ?? t('default'),
                            price: 0,
                            menuItemVariantAttributes: topLevelAttributes,
                        },
                    ]
                    : [];

        return variants
            .map((variant: any, variantIndex: number) => {
                const rawAttributes = Array.isArray(variant?.menuItemVariantAttributes)
                    ? variant.menuItemVariantAttributes
                    : Array.isArray(variant?.attributes)
                        ? variant.attributes
                        : [];

                const menuItemVariantAttributes = rawAttributes.map(
                    (attribute: any, attributeIndex: number) => {
                        const rawValues = Array.isArray(attribute?.menuItemVariantAttributeValues)
                            ? attribute.menuItemVariantAttributeValues
                            : Array.isArray(attribute?.attributeValues)
                                ? attribute.attributeValues
                                : Array.isArray(attribute?.values)
                                    ? attribute.values
                                    : [];

                        return {
                            ...attribute,
                            id: attribute?.id ?? attribute?.menuItemVariantAttributeId ?? attributeIndex + 1,
                            name:
                                attribute?.name ??
                                attribute?.menuItemVariantAttribute?.name ??
                                `${t('option')} ${attributeIndex + 1}`,
                            price: parseFloat(
                                (
                                    attribute?.price ??
                                    attribute?.unitPrice ??
                                    attribute?.menuItemVariantAttribute?.price ??
                                    0
                                ).toString()
                            ),
                            selectionTypeId: Number(attribute?.selectionTypeId ?? 0),
                            menuItemVariantAttributeValues: rawValues.map((value: any, valueIndex: number) => ({
                                ...value,
                                id: value?.id ?? value?.menuItemVariantAttributeValueId ?? valueIndex + 1,
                                name:
                                    value?.name ??
                                    value?.menuItemVariantAttributeValue?.name ??
                                    `${t('value')} ${valueIndex + 1}`,
                                price: parseFloat(
                                    (
                                        value?.price ??
                                        value?.unitPrice ??
                                        value?.menuItemVariantAttributeValue?.price ??
                                        0
                                    ).toString()
                                ),
                            })),
                        };
                    }
                );

                return {
                    ...variant,
                    id: variant?.id ?? variant?.menuItemVariantId ?? variantIndex + 1,
                    name: variant?.name ?? variant?.menuItemVariant?.name ?? `${t('variant')} ${variantIndex + 1}`,
                    price: parseFloat(
                        (
                            variant?.price ??
                            variant?.unitPrice ??
                            variant?.menuItemVariant?.price ??
                            0
                        ).toString()
                    ),
                    menuItemVariantAttributes,
                };
            })
            .sort((a: MenuItemVariant, b: MenuItemVariant) => a.name.localeCompare(b.name));
    }, [item]);

    // Initialize component
    useEffect(() => {
        if (visible) {
            setSelectedVariant(normalizedVariants.length > 0 ? normalizedVariants[0] : null);
            setSelectedAttribute(null);
            setSelectedAttributeValues([]);
        }
    }, [visible, normalizedVariants]);

    const hasMultipleVariants = () => {
        return normalizedVariants.length > 1;
    };

    const selectVariant = (variant: MenuItemVariant) => {
        setSelectedVariant(variant);
        setSelectedAttribute(null);
        setSelectedAttributeValues([]);
    };

    const selectAttributeValue = (attribute: MenuItemVariantAttribute, attributeValue: AttributeValue) => {
        setSelectedAttribute(attribute);

        // Check if already selected
        const isSelected = selectedAttributeValues.some(
            (x: any) => x?.id === attributeValue?.id
        );

        if (isSelected && attribute.selectionTypeId !== 0) {
            // Multi-select: increment quantity
            setSelectedAttributeValues((prev) =>
                prev.map((x: any) => {
                    if (x.id === attributeValue.id) {
                        return {
                            ...x,
                            quantity: (x.quantity || 1) + 1,
                        };
                    }
                    return x;
                })
            );
        } else {
            // Single select or first selection
            const newValue = {
                ...attributeValue,
                quantity: 1,
            };

            if (attribute.selectionTypeId === 0) {
                // Single selection
                setSelectedAttributeValues([newValue]);
            } else {
                // Multi-select
                setSelectedAttributeValues((prev) => [newValue, ...prev]);
            }
        }
    };

    const removeAttributeValue = (attributeValueId: number) => {
        setSelectedAttributeValues((prev) =>
            prev
                .map((x: any) => {
                    if (x.id === attributeValueId) {
                        return {
                            ...x,
                            quantity: (x.quantity || 1) - 1,
                        };
                    }
                    return x;
                })
                .filter((x: any) => (x.quantity || 1) > 0)
        );
    };

    const isAttributeValueSelected = (attributeValue: AttributeValue) => {
        return selectedAttributeValues.some((x: any) => x?.id === attributeValue?.id);
    };

    const calculateTotal = (): number => {
        let total = item.price || 0;

        if (selectedVariant?.price) {
            total += parseFloat(selectedVariant.price.toString());
        }

        selectedAttributeValues.forEach((av: any) => {
            if (av.price) {
                total += parseFloat(av.price.toString()) * (av.quantity || 1);
            }
        });

        return total;
    };

    const handleConfirm = () => {
        console.log('ItemDetailsModal: handleConfirm called with:', {
            variant: selectedVariant ? { id: selectedVariant.id, name: selectedVariant.name } : null,
            attribute: selectedAttribute ? { id: selectedAttribute.id, name: selectedAttribute.name } : null,
            attributeValuesCount: selectedAttributeValues.length,
            attributeValues: selectedAttributeValues,
        });
        onConfirm(selectedVariant, selectedAttribute, selectedAttributeValues);
        onClose();
    };

    if (!item) return null;

    const footer = (
        <View>
            <View style={styles.footerSummary}>
                <Text style={[styles.footerLabel, { color: colors.textSecondary || colors.text }]}>{t('totalPrice')}</Text>
                <Text style={[styles.footerTotal, { color: colors.primary }]}>
                    {formatCurrency(calculateTotal())}
                </Text>
            </View>
            <TouchableOpacity
                onPress={handleConfirm}
                activeOpacity={0.85}
                style={[styles.footerButton, { backgroundColor: colors.primary }]}
            >
                <Text style={[styles.footerButtonText, { color: colors.textInverse || '#fff' }]}>
                    {t('addToCart')}
                </Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <AppBottomSheet
            visible={visible}
            onClose={onClose}
            title={item.name}
            subtitle={category?.name ? `${t('categoryLabel')}: ${category.name}` : t('customizeThisItem')}
            snapPoints={['92%']}
            footer={footer}
        >
                    <ScrollView
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{ paddingBottom: 4 }}
                    >
                        {/* Item Price */}
                        <Text style={{ fontSize: 16, color: colors.textSecondary, marginBottom: 16 }}>
                            {t('basePrice')}: {formatCurrency(item.price || 0)}
                        </Text>

                        {/* Variants */}
                        {hasMultipleVariants() && (
                            <View style={{ marginBottom: 20 }}>
                                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 10 }}>
                                    {t('selectVariant')}
                                </Text>
                                <FlatList
                                    data={normalizedVariants}
                                    scrollEnabled={false}
                                    renderItem={({ item: variant, index }) => (
                                        <TouchableOpacity
                                            key={`variant-${variant.id}-${index}`}
                                            onPress={() => selectVariant(variant)}
                                            style={{
                                                borderRadius: 8,
                                                paddingHorizontal: 12,
                                                paddingVertical: 10,
                                                marginBottom: 8,
                                                borderWidth: 1,
                                                borderColor:
                                                    selectedVariant?.id === variant.id
                                                        ? colors.primary
                                                        : colors.border,
                                                backgroundColor:
                                                    selectedVariant?.id === variant.id
                                                        ? colors.primary + '20'
                                                        : colors.background,
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Text style={{ color: colors.text, fontWeight: '500' }}>
                                                    {variant.name}
                                                </Text>
                                                {(variant.price || 0) > 0 && (
                                                    <Text style={{ color: colors.primary, fontWeight: 'bold' }}>
                                                        +{formatCurrency(Number(variant.price || 0))}
                                                    </Text>
                                                )}
                                            </View>
                                        </TouchableOpacity>
                                    )}
                                    keyExtractor={(variant, index) => `variant-${variant.id}-${index}`}
                                />
                            </View>
                        )}

                        {/* Attributes */}
                        {selectedVariant?.menuItemVariantAttributes && selectedVariant.menuItemVariantAttributes.length > 0 && (
                            <View>
                                {selectedVariant.menuItemVariantAttributes.map((attribute: MenuItemVariantAttribute, attributeIndex: number) => (
                                    <View key={`attribute-${attribute.id}-${attributeIndex}`} style={{ marginBottom: 20 }}>
                                        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 10 }}>
                                            {attribute.name}
                                        {attribute.selectionTypeId === 0
                                            ? ` (${t('required')})`
                                            : ` (${t('optionalMultiple')})`}
                                        </Text>

                                        {attribute.menuItemVariantAttributeValues &&
                                            attribute.menuItemVariantAttributeValues.map((attrValue: AttributeValue, attrIndex: number) => (
                                                <TouchableOpacity
                                                    key={`attribute-value-${attribute.id}-${attrValue.id}-${attrIndex}`}
                                                    onPress={() => selectAttributeValue(attribute, attrValue)}
                                                    style={{
                                                        borderRadius: 8,
                                                        paddingHorizontal: 12,
                                                        paddingVertical: 10,
                                                        marginBottom: 8,
                                                        borderWidth: 1,
                                                        borderColor: isAttributeValueSelected(attrValue)
                                                            ? colors.primary
                                                            : colors.border,
                                                        backgroundColor: isAttributeValueSelected(attrValue)
                                                            ? colors.primary + '20'
                                                            : colors.background,
                                                    }}
                                                >
                                                    <View
                                                        style={{
                                                            flexDirection: 'row',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                        }}
                                                    >
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={{ color: colors.text, fontWeight: '500' }}>
                                                                {attrValue.name}
                                                            </Text>
                                                        </View>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                            {(attrValue.price || 0) > 0 && (
                                                                <Text style={{ color: colors.primary, fontWeight: 'bold', marginRight: 8 }}>
                                                                    {formatCurrency(Number(attrValue.price || 0))}
                                                                </Text>
                                                            )}
                                                            {isAttributeValueSelected(attrValue) && (
                                                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                                    <TouchableOpacity
                                                                        onPress={() => removeAttributeValue(attrValue.id)}
                                                                        style={{
                                                                            backgroundColor: colors.error,
                                                                            borderRadius: 12,
                                                                            width: 24,
                                                                            height: 24,
                                                                            justifyContent: 'center',
                                                                            alignItems: 'center',
                                                                            marginRight: 6,
                                                                        }}
                                                                    >
                                                                        <MaterialCommunityIcons name="minus" size={12} color={colors.textInverse} />
                                                                    </TouchableOpacity>
                                                                    <Text style={{ color: colors.text, fontWeight: 'bold', minWidth: 20, textAlign: 'center' }}>
                                                                        {selectedAttributeValues.find((x) => x.id === attrValue.id)?.quantity || 1}
                                                                    </Text>
                                                                    <TouchableOpacity
                                                                        onPress={() => selectAttributeValue(attribute, attrValue)}
                                                                        style={{
                                                                            backgroundColor: colors.primary,
                                                                            borderRadius: 12,
                                                                            width: 24,
                                                                            height: 24,
                                                                            justifyContent: 'center',
                                                                            alignItems: 'center',
                                                                            marginLeft: 6,
                                                                        }}
                                                                    >
                                                                        <MaterialCommunityIcons name="plus" size={12} color={colors.textInverse} />
                                                                    </TouchableOpacity>
                                                                </View>
                                                            )}
                                                        </View>
                                                    </View>
                                                </TouchableOpacity>
                                            ))}
                                    </View>
                                ))}
                            </View>
                        )}
                    </ScrollView>
        </AppBottomSheet>
    );
}

const styles = {
    footerSummary: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        marginBottom: 12,
    },
    footerLabel: {
        fontSize: 15,
        fontWeight: '600' as const,
    },
    footerTotal: {
        fontSize: 20,
        fontWeight: '800' as const,
    },
    footerButton: {
        minHeight: 56,
        borderRadius: 18,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    footerButtonText: {
        fontSize: 16,
        fontWeight: '800' as const,
    },
};
