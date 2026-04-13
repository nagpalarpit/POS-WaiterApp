import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MenuItem, getMenuItemIdentity } from '../../hooks/useMenuData';
import { formatCurrency } from '../../utils/currency';
import { useTranslation } from '../../contexts/LanguageContext';

interface MenuItemCardProps {
  item: MenuItem;
  itemIndex: number;
  category?: any;
  onAddToCart: (item: MenuItem, category?: any) => void;
  colors: any;
}

/**
 * Individual menu item card
 */
export const MenuItemCard: React.FC<MenuItemCardProps> = ({
  item,
  itemIndex,
  category,
  onAddToCart,
  colors,
}) => {
  const { t } = useTranslation();
  const hasVariants =
    Array.isArray(item.menuItemVariants) && item.menuItemVariants.length > 0;
  const hasDescription = !!item.description?.trim();
  const itemCode = item.customId || item.id;

  return (
    <TouchableOpacity
      key={getMenuItemIdentity(item, itemIndex)}
      onPress={() => onAddToCart(item, category)}
      activeOpacity={0.92}
      style={{
        backgroundColor: colors.surface,
        borderRadius: 14,
        padding: 10,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {/* <View style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceHover || colors.background }}>
        {item.imagePath ? (
          <Image
            source={{ uri: item.imagePath }}
            style={{ width: '100%', height: 112 }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              height: 112,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surfaceHover || colors.background,
            }}
          >
            <MaterialCommunityIcons name="food" size={28} color={colors.textSecondary} />
          </View>
        )}
      </View> */}

      <View style={{ marginTop: 10 }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
          {itemCode ? `${itemCode}. ` : ''}
          {item.name}
        </Text>

        {hasDescription ? (
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>
            {item.description}
          </Text>
        ) : ''}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <View>
          <Text style={{ fontSize: 11, color: colors.textSecondary }}>{t('price')}</Text>
          <Text style={{ color: colors.primary, fontSize: 17, fontWeight: '800', marginTop: 1 }}>
            {formatCurrency(item.price)}
          </Text>
        </View>

        {/* {hasVariants ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 4,
              marginRight: 8,
              backgroundColor: colors.surfaceHover || colors.background,
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '700' }}>CUSTOMIZE</Text>
          </View>
        ) : null} */}

        <TouchableOpacity
          onPress={() => onAddToCart(item, category)}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <MaterialCommunityIcons name="plus" size={16} color={colors.textInverse || '#fff'} />
          {/* <Text style={{ color: colors.textInverse || '#fff', fontWeight: '700', marginLeft: 4, fontSize: 12 }}>
            {t('addToCart')}
          </Text> */}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};
