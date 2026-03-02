import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MenuCategory } from '../../hooks/useMenuData';

interface CategoryTabsProps {
    categories: MenuCategory[];
    activeCategory: number;
    onCategorySelect: (index: number) => void;
    colors: any;
}

/**
 * Category tabs for menu section navigation
 */
export const CategoryTabs: React.FC<CategoryTabsProps> = ({
    categories,
    activeCategory,
    onCategorySelect,
    colors,
}) => {
    const getCategoryIdentity = (category: Partial<MenuCategory>, index: number): string =>
        `${category.id ?? 'category'}-${category.name ?? `unknown-${index}`}`;

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{
                borderBottomWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 14,
                paddingVertical: 10,
                maxHeight: 72,
                backgroundColor: colors.background,
            }}
            scrollEnabled={true}
            contentContainerStyle={{ alignItems: 'center' }}
        >
            {categories.length > 0 ? (
                categories.map((category, index) => (
                    <TouchableOpacity
                        key={`${getCategoryIdentity(category, index)}-${index}`}
                        onPress={() => onCategorySelect(index)}
                        style={{
                            marginRight: 10,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 14,
                            borderWidth: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor:
                                activeCategory === index ? colors.primary + '18' : colors.surface,
                            borderColor:
                                activeCategory === index ? colors.primary : colors.border,
                        }}
                    >
                        <View>
                            <Text
                                style={{
                                    color: colors.text,
                                    fontSize: 12,
                                    fontWeight: '700',
                                    maxWidth: 110,
                                }}
                                numberOfLines={1}
                            >
                                {category.name}
                            </Text>
                            <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 1 }}>
                                {(category.menuItems || []).length} items
                            </Text>
                        </View>
                    </TouchableOpacity>
                ))
            ) : (
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    No categories available
                </Text>
            )}
        </ScrollView>
    );
};
