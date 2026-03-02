import React from 'react';
import { View, Text, FlatList, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MenuCategory, MenuItem } from '../../hooks/useMenuData';
import { MenuItemCard } from './MenuItemCard';
import { getMenuItemIdentity } from '../../hooks/useMenuData';

interface MenuItemsGridProps {
  categories: MenuCategory[];
  activeCategory: number;
  onAddToCart: (item: MenuItem) => void;
  searchQuery?: string;
  colors: any;
}

/**
 * Grid of menu items for the active category
 */
export const MenuItemsGrid: React.FC<MenuItemsGridProps> = ({
  categories,
  activeCategory,
  onAddToCart,
  searchQuery = '',
  colors,
}) => {
  const { width } = useWindowDimensions();
  const numColumns = width >= 960 ? 4 : width >= 700 ? 3 : 2;

  if (categories.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40, paddingHorizontal: 16 }}>
        <MaterialCommunityIcons
          name="clipboard-off"
          size={48}
          color={colors.textSecondary}
          style={{ marginBottom: 12 }}
        />
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>
          No Menu Available
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
          Please check back later or contact support
        </Text>
      </View>
    );
  }

  const currentCategory = categories[activeCategory];
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const menuItems = (currentCategory?.menuItems || []).filter((item) => {
    if (!normalizedSearch) return true;

    const searchable = [
      item.name,
      item.description,
      item.sku,
      String(item.customId ?? ''),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchable.includes(normalizedSearch);
  });

  const renderEmptyState = () => (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 44, paddingHorizontal: 14 }}>
      <MaterialCommunityIcons name="food-off" size={36} color={colors.textSecondary} />
      <Text style={{ color: colors.text, fontWeight: '700', marginTop: 12 }}>
        {normalizedSearch ? 'No matching items' : `No items in ${currentCategory?.name || 'this category'}`}
      </Text>
      <Text style={{ color: colors.textSecondary, marginTop: 6, textAlign: 'center', fontSize: 12 }}>
        {normalizedSearch ? `Try another keyword for "${searchQuery}"` : 'Items will appear here when available'}
      </Text>
    </View>
  );

  return (
    <FlatList
      data={menuItems}
      key={numColumns}
      keyExtractor={(item, index) => getMenuItemIdentity(item, index)}
      numColumns={numColumns}
      contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 120, paddingTop: 14 }}
      ListHeaderComponent={
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {menuItems.length} {menuItems.length === 1 ? 'item' : 'items'} in {currentCategory?.name}
          </Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <View style={{ flex: 1 / numColumns, paddingHorizontal: 4, marginBottom: 10, minWidth: 0 }}>
          <MenuItemCard
            item={item}
            itemIndex={index}
            onAddToCart={onAddToCart}
            colors={colors}
          />
        </View>
      )}
      ListEmptyComponent={renderEmptyState}
      columnWrapperStyle={numColumns > 1 ? { alignItems: 'stretch' } : undefined}
      showsVerticalScrollIndicator={false}
    />
  );
};
