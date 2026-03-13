import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import localDatabase from '../services/localDatabase';

export interface MenuCategory {
  id: number;
  name: string;
  imagePath?: string;
  menuItems?: MenuItem[];
  categoryType?: string;
  tax?: any;
}

export interface MenuItem {
  id: number;
  customId: number;
  name: string;
  description?: string;
  imagePath?: string;
  price: number;
  sku?: string;
  menuItemVariants?: MenuItemVariant[];
  variants?: MenuItemVariant[];
  menuItemVariant?: MenuItemVariant;
}

export interface MenuItemVariant {
  id: number;
  name: string;
  price: number;
  description?: string;
  menuItemVariantAttributes?: any[];
}

/**
 * Generate unique key for category deduplication
 */
export const getCategoryIdentity = (
  category: Partial<MenuCategory>,
  fallback = 0
): string =>
  `${category.id ?? 'category'}-${category.name ?? `unknown-${fallback}`}`;

/**
 * Generate unique key for menu item deduplication
 */
export const getMenuItemIdentity = (item: Partial<MenuItem>, fallback = 0): string =>
  `${item.id ?? 'item'}-${item.customId ?? 'custom'}-${item.name ?? `unknown-${fallback}`}`;

/**
 * Normalize variants handling from different data structures
 */
export const normalizeMenuItemVariants = (item: any): MenuItemVariant[] => {
  let rawVariants = Array.isArray(item?.menuItemVariants)
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

  if (rawVariants.length === 0 && topLevelAttributes.length > 0) {
    rawVariants = [
      {
        id: item?.id ?? 1,
        name: item?.name ?? 'Default',
        price: 0,
        menuItemVariantAttributes: topLevelAttributes,
      },
    ];
  }

  return rawVariants
    .filter((variant: any) => !!variant)
    .map((variant: any, index: number) => ({
      ...variant,
      id: variant.id ?? variant.menuItemVariantId ?? index + 1,
      name: variant.name ?? variant.menuItemVariant?.name ?? `Variant ${index + 1}`,
      price: parseFloat(
        (
          variant.price ??
          variant.unitPrice ??
          variant.menuItemVariant?.price ??
          0
        ).toString()
      ),
      menuItemVariantAttributes: Array.isArray(variant.menuItemVariantAttributes)
        ? variant.menuItemVariantAttributes
        : Array.isArray(variant.attributes)
          ? variant.attributes
          : [],
    }));
};

/**
 * Normalize menu item with proper variant structure
 */
export const normalizeMenuItemForOptions = (item: MenuItem): MenuItem => ({
  ...item,
  menuItemVariants: normalizeMenuItemVariants(item),
});

/**
 * Hook for loading and managing menu data
 */
export const useMenuData = () => {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [cartCategories, setCartCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(0);

  /**
   * Load menu from local database with companyId filter
   */
  const loadMenu = async () => {
    try {
      setLoading(true);

      // Get user info from AsyncStorage to retrieve companyId
      const userDataStr = await AsyncStorage.getItem('userData');
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      const companyId = userData?.companyId;

      console.log('MenuData: User data retrieved:', { companyId });

      // Fetch menu from local server with companyId filter
      const response = await localDatabase.select('menu', {
        where: companyId ? { companyId } : {},
      });

      console.log('MenuData: Raw menu response received');

      if (response && Array.isArray(response) && response.length > 0) {
        let menuCategories: MenuCategory[] = [];

        for (const doc of response) {
          if (doc.menuDetails && Array.isArray(doc.menuDetails)) {
            // Local server structure: menuDetails IS AN ARRAY of categories
            menuCategories.push(...doc.menuDetails);
          } else if (doc.id || doc.name) {
            // POS_V2 structure or direct menu object
            menuCategories.push(doc);
          }
        }

        console.log('MenuData: Processed categories:', menuCategories.length);

        // Deduplicate categories and items
        const categoryMap = new Map<string, MenuCategory>();
        menuCategories.forEach((category: MenuCategory, categoryIndex: number) => {
          const categoryKey = getCategoryIdentity(category, categoryIndex);
          const existingCategory = categoryMap.get(categoryKey);
          const incomingItems = Array.isArray(category.menuItems) ? category.menuItems : [];

          if (!existingCategory) {
            categoryMap.set(categoryKey, {
              ...category,
              menuItems: [...incomingItems],
            });
            return;
          }

          const mergedItems = [...(existingCategory.menuItems || []), ...incomingItems];
          const itemMap = new Map<string, MenuItem>();
          mergedItems.forEach((menuItem: MenuItem, itemIndex: number) => {
            const itemKey = getMenuItemIdentity(menuItem, itemIndex);
            if (!itemMap.has(itemKey)) {
              itemMap.set(itemKey, menuItem);
            }
          });

          categoryMap.set(categoryKey, {
            ...existingCategory,
            ...category,
            menuItems: Array.from(itemMap.values()),
          });
        });

        const normalizedCategories = Array.from(categoryMap.values());
        const menuDisplayCategories = normalizedCategories.filter(
          (cat: any) => cat.categoryType !== 'cart' && cat.categoryType !== 'voucher'
        );
        const cartExtraCategories = normalizedCategories.filter(
          (cat: any) => cat.categoryType === 'cart'
        );
        setCategories(menuDisplayCategories);
        setCartCategories(cartExtraCategories);
        if (menuDisplayCategories.length > 0) {
          setActiveCategory(0);
        }

        console.log('MenuData: Categories loaded:', menuDisplayCategories.length);
      } else {
        console.warn('MenuData: No menu data returned');
        setCategories([]);
        setCartCategories([]);
      }
    } catch (error) {
      console.error('MenuData: Error loading menu:', error);
      setCategories([]);
      setCartCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMenu();
  }, []);

  return {
    categories,
    cartCategories,
    setCategories,
    loading,
    setLoading,
    activeCategory,
    setActiveCategory,
    loadMenu,
  };
};
