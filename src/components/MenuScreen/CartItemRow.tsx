import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CartItem, AttributeValue } from '../../services/cartService';
import { useTranslation } from '../../contexts/LanguageContext';
import {
  getAttributeValueName,
  getAttributeValuePrice,
  getAttributeValueQuantity,
  getCartItemQuantity,
  getItemLineTotal,
  getItemOptionsSummary,
  getItemUnitTotal,
} from '../../utils/cartCalculations';
import { formatCurrency } from '../../utils/currency';
import { getVoucherDetailLines } from '../../utils/voucherDetails';

interface CartItemRowProps {
  item: CartItem;
  onOpenNoteModal: (item: CartItem) => void;
  onUpdateQuantity: (cartId: string, quantity: number) => void;
  onRemoveItem: (cartId: string) => void;
  colors: any;
}

/**
 * Individual cart item row
 */
export const CartItemRow: React.FC<CartItemRowProps> = ({
  item,
  onOpenNoteModal,
  onUpdateQuantity,
  onRemoveItem,
  colors,
}) => {
  const { t } = useTranslation();
  const quantity = getCartItemQuantity(item);
  const itemUnitTotal = getItemUnitTotal(item);
  const itemLineTotal = getItemLineTotal(item);
  const optionsSummary = getItemOptionsSummary(item);
  const voucherDetailLines = getVoucherDetailLines(item);

  return (
    <View
      style={{ paddingHorizontal: 12, paddingVertical: 12 }}
    >
      {/* Item Name */}
      <Text className="font-semibold text-sm" style={{ color: colors.text, marginBottom: 6 }}>
        {item.customId ? `${item.customId}. ` : ''}{item.itemName}
      </Text>

      {/* Options Summary */}
      {!!optionsSummary && (
        <Text className="text-xs" style={{ color: colors.textSecondary, marginBottom: 4 }}>
          {optionsSummary}
        </Text>
      )}

      {voucherDetailLines.length > 0 && (
        <View style={{ marginBottom: 6 }}>
          {voucherDetailLines.map((line) => (
            <Text
              key={line.key}
              className="text-xs"
              style={{
                color: line.isSection ? colors.textSecondary : colors.textSecondary,
                marginBottom: 3,
                marginLeft: line.indent,
                fontSize: line.isSection ? 10 : 12,
                fontWeight: line.isSection || line.isItem ? '600' : '400',
                textTransform: line.isSection ? 'uppercase' : 'none',
                letterSpacing: line.isSection ? 0.6 : 0,
              }}
            >
              {line.text}
            </Text>
          ))}
        </View>
      )}

      {/* Variant price */}
      {item.variantName && item.variantPrice ? (
        <Text className="text-xs" style={{ color: colors.textSecondary, marginBottom: 4 }}>
          + {t('variant')}: {formatCurrency(item.variantPrice)}
        </Text>
      ) : null}

      {/* Attribute Values */}
      {item.attributeValues && item.attributeValues.length > 0 && (
        <View style={{ marginBottom: 6 }}>
          {item.attributeValues.map((attributeValue: AttributeValue, idx: number) => {
            const name = getAttributeValueName(attributeValue);
            const valueQuantity = getAttributeValueQuantity(attributeValue);
            const valuePrice = getAttributeValuePrice(attributeValue);
            if (!name) return null;

            return (
              <Text key={idx} className="text-xs" style={{ color: colors.textSecondary }}>
                • {valueQuantity} x @{name}
                {valuePrice > 0 ? ` (+${formatCurrency(valuePrice)})` : ''}
              </Text>
            );
          })}
        </View>
      )}

      {/* Unit price snapshot */}
      <Text className="text-xs" style={{ color: colors.textSecondary, marginBottom: 4 }}>
        {formatCurrency(itemUnitTotal)} × {quantity}
      </Text>

      {/* Item note */}
      {item.orderItemNote ? (
        <Text className="text-xs italic" style={{ color: colors.textSecondary, marginBottom: 4 }}>
          {t('note')}: {item.orderItemNote}
        </Text>
      ) : null}

      {/* Note Action */}
      <TouchableOpacity onPress={() => onOpenNoteModal(item)} style={{ marginTop: 8 }}>
        <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
          {item.orderItemNote ? t('editItemNote') : t('addNoteForThisItem')}
        </Text>
      </TouchableOpacity>

      {/* Price and Quantity Controls */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text className="font-semibold text-sm" style={{ color: colors.primary, fontWeight: '800' }}>
          {formatCurrency(itemLineTotal)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            onPress={() => onUpdateQuantity(item.cartId || '', quantity - 1)}
            style={{
              backgroundColor: colors.surfaceHover || colors.background,
              borderRadius: 999,
              padding: 6,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <MaterialCommunityIcons name="minus" size={14} color={colors.text} />
          </TouchableOpacity>
          <View
            style={{
              minWidth: 28,
              height: 28,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 6,
              backgroundColor: colors.surface,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700', textAlign: 'center' }}>{quantity}</Text>
          </View>
          <TouchableOpacity
            onPress={() => onUpdateQuantity(item.cartId || '', quantity + 1)}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 999,
              padding: 6,
            }}
          >
            <MaterialCommunityIcons name="plus" size={14} color={colors.textInverse} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onRemoveItem(item.cartId || '')}
            style={{
              marginLeft: 4,
              backgroundColor: colors.error + '15',
              borderRadius: 999,
              padding: 8,
              justifyContent: 'center',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: colors.error + '30',
            }}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
