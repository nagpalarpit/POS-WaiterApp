import React from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CartItem, AttributeValue } from '../../services/cartService';
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

interface CartItemRowProps {
  item: CartItem;
  isEditing: boolean;
  editingNote: string;
  onNoteChange: (text: string) => void;
  onEditNote: (item: CartItem) => void;
  onOpenNoteModal: (item: CartItem) => void;
  onCancelEdit: () => void;
  onSaveNote: () => void;
  onUpdateQuantity: (cartId: string, quantity: number) => void;
  onRemoveItem: (cartId: string) => void;
  colors: any;
}

/**
 * Individual cart item row
 */
export const CartItemRow: React.FC<CartItemRowProps> = ({
  item,
  isEditing,
  editingNote,
  onNoteChange,
  onEditNote,
  onOpenNoteModal,
  onCancelEdit,
  onSaveNote,
  onUpdateQuantity,
  onRemoveItem,
  colors,
}) => {
  const quantity = getCartItemQuantity(item);
  const itemUnitTotal = getItemUnitTotal(item);
  const itemLineTotal = getItemLineTotal(item);
  const optionsSummary = getItemOptionsSummary(item);

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

      {/* Variant price */}
      {item.variantName && item.variantPrice ? (
        <Text className="text-xs" style={{ color: colors.textSecondary, marginBottom: 4 }}>
          + Variant: {formatCurrency(item.variantPrice)}
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
          Note: {item.orderItemNote}
        </Text>
      ) : null}

      {/* Note Edit Section */}
      {isEditing ? (
        <View style={{ marginTop: 8 }}>
          <TextInput
            value={editingNote}
            onChangeText={onNoteChange}
            placeholder="Add note for this item"
            multiline
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              fontSize: 12,
              color: colors.text,
              backgroundColor: colors.background,
              minHeight: 60,
              textAlignVertical: 'top',
            }}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              onPress={onCancelEdit}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
            >
              <Text className="text-xs" style={{ color: colors.text }}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSaveNote}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary }}
            >
              <Text className="text-xs font-semibold" style={{ color: colors.textInverse }}>
                Save Note
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity onPress={() => onOpenNoteModal(item)} style={{ marginTop: 8 }}>
          <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
            {item.orderItemNote ? 'Edit Item Note' : 'Add Item Note'}
          </Text>
        </TouchableOpacity>
      )}

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
