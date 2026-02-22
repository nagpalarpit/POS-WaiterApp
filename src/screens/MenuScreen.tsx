import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    FlatList,
    ActivityIndicator,
    Image,
    Dimensions,
    TextInput,
    Alert,
    Animated,
    Vibration,
    Modal,
    Pressable,
    BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeProvider';
import localDatabase from '../services/localDatabase';
import cartService, {
    CartItem,
    Cart,
    AttributeValue,
    CartDiscountType,
} from '../services/cartService';
import ItemDetailsModal from '../components/ItemDetailsModal';
import ItemNoteModal from '../components/ItemNoteModal';
import CartNoteModal from '../components/CartNoteModal';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import {
    getAttributeValueName,
    getAttributeValuePrice,
    getAttributeValueQuantity,
    getCartItemQuantity,
    getCartSubtotal,
    getDiscountAmount,
    getDiscountLabel,
    getDiscountTypeLabel,
    getItemLineTotal,
    getItemOptionsSummary,
    getItemUnitTotal,
} from '../utils/cartCalculations';

const { width } = Dimensions.get('window');

interface MenuCategory {
    id: number;
    name: string;
    imagePath?: string;
    menuItems?: MenuItem[];
    categoryType?: string;
    tax?: any;
}

interface MenuItem {
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

interface MenuItemVariant {
    id: number;
    name: string;
    price: number;
    description?: string;
    menuItemVariantAttributes?: any[];
}

interface MenuScreenProps {
    navigation: any;
    route: any;
}

const getCategoryIdentity = (category: Partial<MenuCategory>, fallback = 0): string =>
    `${category.id ?? 'category'}-${category.name ?? `unknown-${fallback}`}`;

const getMenuItemIdentity = (item: Partial<MenuItem>, fallback = 0): string =>
    `${item.id ?? 'item'}-${item.customId ?? 'custom'}-${item.name ?? `unknown-${fallback}`}`;

const normalizeMenuItemVariants = (item: any): MenuItemVariant[] => {
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

const normalizeMenuItemForOptions = (item: MenuItem): MenuItem => ({
    ...item,
    menuItemVariants: normalizeMenuItemVariants(item),
});

export default function MenuScreen({ navigation, route }: MenuScreenProps) {
    const { colors } = useTheme();
    const { tableNo = null, deliveryType = 0 } = route.params || {};
    const cartDrawerWidth = Math.min(width * 0.84, 400);

    // State
    const [categories, setCategories] = useState<MenuCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState(0);
    const [cart, setCart] = useState<Cart>({ items: [], orderNote: '', discount: null });
    const [showCart, setShowCart] = useState(false);
    const [showItemDetail, setShowItemDetail] = useState(false);
    const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
    const [editingItemNoteId, setEditingItemNoteId] = useState<string | null>(null);
    const [itemNoteDraft, setItemNoteDraft] = useState('');
    const [isEditingOrderNote, setIsEditingOrderNote] = useState(false);
    const [orderNoteDraft, setOrderNoteDraft] = useState('');
    const [isEditingDiscount, setIsEditingDiscount] = useState(false);
    const [discountTypeDraft, setDiscountTypeDraft] = useState<CartDiscountType>('PERCENTAGE');
    const [discountValueDraft, setDiscountValueDraft] = useState('');
    const [showItemNoteModal, setShowItemNoteModal] = useState(false);
    const [showCartNoteModal, setShowCartNoteModal] = useState(false);
    const cartFabScaleAnim = useRef(new Animated.Value(1)).current;
    const cartBadgeScaleAnim = useRef(new Animated.Value(1)).current;
    const cartDrawerTranslateAnim = useRef(new Animated.Value(cartDrawerWidth)).current;
    const cartDrawerBackdropAnim = useRef(new Animated.Value(0)).current;
    const isCartDrawerAnimatingRef = useRef(false);
    const previousCartQuantityRef = useRef<number | null>(null);

    useLayoutEffect(() => {
        navigation.setOptions({
            headerTitle: 'Menu',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '700' },
            headerLeft: () => (
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <MaterialIcons name="chevron-left" size={24} color={colors.text} />
                        {
                            tableNo ? (
                                <Text>
                                    Table {tableNo}
                                </Text>
                            )
                                : deliveryType === 1 ? (
                                    <Text>Delivery</Text>
                                )
                                    : (
                                        <Text>Pickup</Text>
                                    )
                        }
                    </View>
                </TouchableOpacity>
            ),
            // headerRight: () => (
            //     <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 100 }}>
            //         <TouchableOpacity onPress={() => { /* search placeholder */ }} style={{ padding: 8, borderRadius: 100 }}>
            //             <MaterialIcons name="search" size={20} color={colors.text} />
            //         </TouchableOpacity>

            //         {activeTab !== DELIVERY_TYPE.DINE_IN && (
            //             <TouchableOpacity onPress={() => navigation.navigate('Menu', { tableNo: null, deliveryType: activeTab })} style={{ padding: 8 }}>
            //                 <MaterialIcons name="add-circle-outline" size={22} color={colors.primary} />
            //             </TouchableOpacity>
            //         )}
            //     </View>
            // ),
        });
    }, [navigation, colors]);

    const cartQuantity = useMemo(
        () =>
            cart.items.reduce(
                (sum, item) => sum + getCartItemQuantity(item),
                0
            ),
        [cart.items]
    );

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

            console.log('MenuScreen: User data retrieved:', { userData, companyId });

            if (!companyId) {
                console.warn('MenuScreen: No companyId found, fetching all menus');
            }

            // Fetch menu from local server with companyId filter
            // Local server menu model stores menu data in 'menuDetails' field
            const response = await localDatabase.select('menu', {
                where: companyId ? { companyId } : {},
            });

            console.log('MenuScreen: Raw menu response:', response);

            if (response && Array.isArray(response) && response.length > 0) {
                // Handle two possible data structures:
                // 1. Array of menu documents with menuDetails field (local server structure)
                // 2. Array of menu objects directly (POS_V2 structure)

                let menuCategories: MenuCategory[] = [];

                for (const doc of response) {
                    if (doc.menuDetails && Array.isArray(doc.menuDetails)) {
                        // Local server structure: menuDetails IS AN ARRAY of categories
                        // Each item contains { id, name, categoryType, menuItems[], tax, ... }
                        menuCategories.push(...doc.menuDetails);
                    } else if (doc.id || doc.name) {
                        // POS_V2 structure or direct menu object
                        menuCategories.push(doc);
                    }
                }

                console.log('MenuScreen: Processed categories:', menuCategories.length);
                console.log('MenuScreen: Categories data:', menuCategories.map((cat: any) => ({
                    id: cat.id,
                    name: cat.name,
                    categoryType: cat.categoryType,
                    itemsCount: cat.menuItems?.length || 0
                })));

                // Filter out 'cart' and 'voucher' category types (POS_V2 pattern)
                const filteredCategories = menuCategories.filter(
                    (cat: any) =>
                        cat.categoryType !== 'cart' && cat.categoryType !== 'voucher'
                );

                // Some payloads can contain repeated categories/items across menu docs.
                // Merge and dedupe so list keys stay unique and UI does not duplicate tabs/items.
                const categoryMap = new Map<string, MenuCategory>();
                filteredCategories.forEach((category: MenuCategory, categoryIndex: number) => {
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

                console.log('MenuScreen: Filtered categories:', filteredCategories.length);
                console.log('MenuScreen: Filtered categories details:', filteredCategories.map((cat: any) => ({
                    id: cat.id,
                    name: cat.name,
                    categoryType: cat.categoryType
                })));

                // Debug: Log the first category's full structure to see what fields contain the items
                if (normalizedCategories.length > 0) {
                    console.log('MenuScreen: First category full structure:', normalizedCategories[0]);
                    console.log('MenuScreen: First category menuItems:', normalizedCategories[0].menuItems);
                }

                setCategories(normalizedCategories);
                if (normalizedCategories.length > 0) {
                    setActiveCategory(0);
                }
            } else {
                console.warn('MenuScreen: No menu data returned from server');
                setCategories([]);
            }
        } catch (error) {
            console.error('MenuScreen: Error loading menu:', error);
            setCategories([]);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Load cart from AsyncStorage using CartService
     */
    const loadCart = async () => {
        try {
            const loadedCart = await cartService.loadCart();
            setCart(loadedCart);
        } catch (error) {
            console.error('Error loading cart:', error);
        }
    };

    useEffect(() => {
        loadMenu();
        loadCart();
    }, []);

    /**
     * Add item to cart - Opens modal if variants exist, otherwise adds directly
     */
    const addToCart = (category: MenuCategory, item: MenuItem) => {
        const normalizedItem = normalizeMenuItemForOptions(item);
        const hasVariants =
            Array.isArray(normalizedItem.menuItemVariants) &&
            normalizedItem.menuItemVariants.length > 0;

        console.log('MenuScreen: addToCart called for:', {
            itemName: normalizedItem.name,
            hasVariants,
            variantsCount: normalizedItem.menuItemVariants?.length || 0,
        });

        // Check if item has variants that require selection
        if (hasVariants) {
            // Open modal for variant/attribute selection
            console.log('MenuScreen: Opening ItemDetailsModal for item with variants');
            setSelectedMenuItem(normalizedItem);
            setShowItemDetail(true);
        } else {
            // No variants, add directly to cart
            console.log('MenuScreen: Adding item directly (no variants)');
            addToCartDirect(category, normalizedItem, null, null, undefined);
        }
    };

    /**
     * Handle modal confirmation - Add item to cart with selected options
     */
    const handleModalConfirm = async (
        variant: any,
        attribute: any,
        attributeValues: AttributeValue[]
    ) => {
        if (selectedMenuItem) {
            await addToCartDirect(
                categories[activeCategory],
                selectedMenuItem,
                variant,
                attribute,
                attributeValues
            );
        }
    };

    /**
     * Add item to cart with all selected options (variants, attributes)
     */
    const addToCartDirect = async (
        category: MenuCategory,
        item: MenuItem,
        variant: any,
        attribute: any,
        attributeValues?: AttributeValue[]
    ) => {
        try {
            console.log('MenuScreen: addToCartDirect called with:', {
                itemName: item.name,
                variant: variant ? { id: variant.id, name: variant.name } : null,
                attribute: attribute ? { id: attribute.id, name: attribute.name } : null,
                attributeValuesCount: attributeValues?.length || 0,
                attributeValues: attributeValues,
            });

            const updatedCart = await cartService.addToCart(
                category,
                item,
                variant,
                attribute,
                attributeValues
            );
            setCart(updatedCart);
            console.log('MenuScreen: Cart updated:', updatedCart);
        } catch (error) {
            console.error('Error adding to cart:', error);
        }
    };

    /**
     * Update item quantity
     */
    const updateQuantity = async (cartId: string, quantity: number) => {
        try {
            if (quantity <= 0) {
                await removeFromCart(cartId);
                return;
            }
            const updatedCart = await cartService.updateQuantity(cartId, quantity);
            setCart(updatedCart);
        } catch (error) {
            console.error('Error updating quantity:', error);
        }
    };

    /**
     * Remove item from cart
     */
    const removeFromCart = async (cartId: string) => {
        try {
            const updatedCart = await cartService.removeFromCart(cartId);
            setCart(updatedCart);
        } catch (error) {
            console.error('Error removing from cart:', error);
        }
    };

    const calculateSubtotal = (): number => {
        return getCartSubtotal(cart);
    };

    const calculateDiscount = (): number => {
        return getDiscountAmount(calculateSubtotal(), cart.discount);
    };

    const calculateTotal = (): number => {
        return Math.max(calculateSubtotal() - calculateDiscount(), 0);
    };

    const triggerCartAddedFeedback = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
            Vibration.vibrate(10);
        });

        Animated.parallel([
            Animated.sequence([
                Animated.timing(cartFabScaleAnim, {
                    toValue: 1.1,
                    duration: 120,
                    useNativeDriver: true,
                }),
                Animated.spring(cartFabScaleAnim, {
                    toValue: 1,
                    friction: 5,
                    tension: 180,
                    useNativeDriver: true,
                }),
            ]),
            Animated.sequence([
                Animated.timing(cartBadgeScaleAnim, {
                    toValue: 1.2,
                    duration: 110,
                    useNativeDriver: true,
                }),
                Animated.spring(cartBadgeScaleAnim, {
                    toValue: 1,
                    friction: 5,
                    tension: 180,
                    useNativeDriver: true,
                }),
            ]),
        ]).start();
    };

    useEffect(() => {
        const previousQuantity = previousCartQuantityRef.current;
        if (previousQuantity === null) {
            previousCartQuantityRef.current = cartQuantity;
            return;
        }

        if (cartQuantity > previousQuantity) {
            triggerCartAddedFeedback();
        }

        previousCartQuantityRef.current = cartQuantity;
    }, [cartQuantity]);

    const startEditItemNote = (item: CartItem) => {
        if (!item.cartId) return;
        setEditingItemNoteId(item.cartId);
        setItemNoteDraft(item.orderItemNote || '');
    };

    const cancelItemNoteEdit = () => {
        setEditingItemNoteId(null);
        setItemNoteDraft('');
    };

    const saveItemNote = async () => {
        if (!editingItemNoteId) return;
        try {
            const updatedCart = await cartService.updateItemNote(editingItemNoteId, itemNoteDraft);
            setCart(updatedCart);
            cancelItemNoteEdit();
        } catch (error) {
            console.error('Error saving item note:', error);
        }
    };

    const openItemNoteModal = (item: CartItem) => {
        if (!item.cartId) return;
        setEditingItemNoteId(item.cartId);
        setItemNoteDraft(item.orderItemNote || '');
        setShowItemNoteModal(true);
    };

    const saveItemNoteModal = async (note: string) => {
        if (!editingItemNoteId) return;
        try {
            const updated = await cartService.updateItemNote(editingItemNoteId, note);
            setCart(updated);
            setShowItemNoteModal(false);
            setEditingItemNoteId(null);
            setItemNoteDraft('');
        } catch (err) {
            console.error('Error saving item note via modal:', err);
        }
    };

    const saveCartNoteAndDiscount = async (note: string, discount: any) => {
        try {
            await cartService.updateOrderNote(note || '');
            if (discount) {
                await cartService.updateDiscount(discount);
            } else {
                await cartService.updateDiscount(null);
            }
            const refreshed = await cartService.loadCart();
            setCart(refreshed);
        } catch (err) {
            console.error('Error saving cart note/discount via modal:', err);
        }
    };

    const startEditOrderNote = () => {
        setOrderNoteDraft(cart.orderNote || '');
        setIsEditingOrderNote(true);
    };

    const cancelOrderNoteEdit = () => {
        setIsEditingOrderNote(false);
        setOrderNoteDraft('');
    };

    const saveOrderNote = async () => {
        try {
            const updatedCart = await cartService.updateOrderNote(orderNoteDraft);
            setCart(updatedCart);
            cancelOrderNoteEdit();
        } catch (error) {
            console.error('Error saving cart note:', error);
        }
    };

    const startDiscountEdit = () => {
        setDiscountTypeDraft(cart.discount?.discountType || 'PERCENTAGE');
        setDiscountValueDraft(
            cart.discount?.discountValue !== undefined
                ? String(cart.discount.discountValue)
                : ''
        );
        setIsEditingDiscount(true);
    };

    const cancelDiscountEdit = () => {
        setIsEditingDiscount(false);
        setDiscountValueDraft('');
        setDiscountTypeDraft('PERCENTAGE');
    };

    const saveDiscount = async () => {
        try {
            const discountValue = parseFloat(discountValueDraft || '0');
            if (!Number.isFinite(discountValue) || discountValue <= 0) {
                const updatedCart = await cartService.updateDiscount(null);
                setCart(updatedCart);
                cancelDiscountEdit();
                return;
            }

            if (discountTypeDraft === 'PERCENTAGE' && discountValue > 100) {
                Alert.alert('Invalid Discount', 'Percentage discount cannot exceed 100.');
                return;
            }

            const updatedCart = await cartService.updateDiscount({
                discountName: getDiscountTypeLabel(discountTypeDraft),
                discountType: discountTypeDraft,
                discountValue,
            });
            setCart(updatedCart);
            cancelDiscountEdit();
        } catch (error) {
            console.error('Error saving discount:', error);
        }
    };

    const clearDiscount = async () => {
        try {
            const updatedCart = await cartService.updateDiscount(null);
            setCart(updatedCart);
            cancelDiscountEdit();
        } catch (error) {
            console.error('Error clearing discount:', error);
        }
    };

    /**
     * Proceed to checkout
     */
    const proceedToCheckout = async () => {
        if (cart.items.length === 0) {
            alert('Please add items to cart');
            return;
        }

        if (showCart) {
            cartDrawerTranslateAnim.stopAnimation();
            cartDrawerBackdropAnim.stopAnimation();
            cartDrawerTranslateAnim.setValue(cartDrawerWidth);
            cartDrawerBackdropAnim.setValue(0);
            setShowCart(false);
        }

        // Navigate to checkout screen
        navigation.navigate('Checkout', {
            cart,
            tableNo,
            deliveryType,
        });
    };

    const openCartDrawer = () => {
        if (showCart || isCartDrawerAnimatingRef.current) return;

        setShowCart(true);
        requestAnimationFrame(() => {
            cartDrawerTranslateAnim.stopAnimation();
            cartDrawerBackdropAnim.stopAnimation();
            cartDrawerTranslateAnim.setValue(cartDrawerWidth);
            cartDrawerBackdropAnim.setValue(0);

            isCartDrawerAnimatingRef.current = true;
            Animated.parallel([
                Animated.timing(cartDrawerTranslateAnim, {
                    toValue: 0,
                    duration: 260,
                    useNativeDriver: true,
                }),
                Animated.timing(cartDrawerBackdropAnim, {
                    toValue: 1,
                    duration: 220,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                isCartDrawerAnimatingRef.current = false;
            });
        });
    };

    const closeCartDrawer = () => {
        if (!showCart || isCartDrawerAnimatingRef.current) return;

        isCartDrawerAnimatingRef.current = true;
        Animated.parallel([
            Animated.timing(cartDrawerTranslateAnim, {
                toValue: cartDrawerWidth,
                duration: 240,
                useNativeDriver: true,
            }),
            Animated.timing(cartDrawerBackdropAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start(() => {
            isCartDrawerAnimatingRef.current = false;
            setShowCart(false);
        });
    };

    const toggleCartDrawer = () => {
        if (showCart) {
            closeCartDrawer();
            return;
        }

        openCartDrawer();
    };

    useEffect(() => {
        if (!showCart) return;

        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            closeCartDrawer();
            return true;
        });

        return () => backHandler.remove();
    }, [showCart]);

    /**
     * Render menu item card
     */
    const renderMenuItemCard = (item: MenuItem, itemIndex: number) => (
        <TouchableOpacity
            key={getMenuItemIdentity(item, itemIndex)}
            onPress={() => addToCart(categories[activeCategory], item)}
            className="bg-surface rounded-lg p-3 border"
            style={{ borderColor: colors.border }}
        >
            {item.imagePath && (
                <Image
                    source={{ uri: item.imagePath }}
                    style={{ width: '100%', height: 120, borderRadius: 8 }}
                />
            )}
            <Text
                className="font-semibold text-sm mt-2"
                style={{ color: colors.text }}
                numberOfLines={2}
            >
                {item.name}
            </Text>
            {item.description && (
                <Text
                    className="text-xs mt-1 line-clamp-2"
                    style={{ color: colors.textSecondary }}
                >
                    {item.description}
                </Text>
            )}
            <View className="flex-row justify-between items-center mt-2 gap-3">
                <Text
                    className="font-bold text-base"
                    style={{ color: colors.primary }}
                >
                    ₹{item.price.toFixed(2)}
                </Text>
                <TouchableOpacity
                    className="bg-primary rounded-full p-2"
                    onPress={() => addToCart(categories[activeCategory], item)}
                >
                    <MaterialCommunityIcons name="plus" size={16} color={colors.textInverse} />
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
    );

    /**
     * Render cart item
     */
    const renderCartItem = (item: CartItem) => {
        const quantity = getCartItemQuantity(item);
        const itemUnitTotal = getItemUnitTotal(item);
        const itemLineTotal = getItemLineTotal(item);
        const optionsSummary = getItemOptionsSummary(item);

        return (
            <View
                key={item.cartId}
                className="bg-surface rounded-lg p-3 mb-2 border"
                style={{ borderColor: colors.border }}
            >
                {/* Item Name (show customId like POS_V2) */}
                <Text className="font-semibold text-sm" style={{ color: colors.text }}>
                    {item.customId ? `${item.customId}. ` : ''}{item.itemName}
                </Text>

                {/* Selected Variant + Values (POS_V2-style summary) */}
                {!!optionsSummary && (
                    <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                        {optionsSummary}
                    </Text>
                )}

                {/* Variant price */}
                {item.variantName && item.variantPrice ? (
                    <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                        + Variant: ₹{item.variantPrice.toFixed(2)}
                    </Text>
                ) : null}

                {/* Attribute Values */}
                {item.attributeValues && item.attributeValues.length > 0 && (
                    <View className="mt-1">
                        {item.attributeValues.map((attributeValue: AttributeValue, idx: number) => {
                            const name = getAttributeValueName(attributeValue);
                            const valueQuantity = getAttributeValueQuantity(attributeValue);
                            const valuePrice = getAttributeValuePrice(attributeValue);
                            if (!name) return null;

                            return (
                                <Text key={idx} className="text-xs" style={{ color: colors.textSecondary }}>
                                    • {valueQuantity} x @{name}
                                    {valuePrice > 0 ? ` (+₹${valuePrice.toFixed(2)})` : ''}
                                </Text>
                            );
                        })}
                    </View>
                )}

                {/* Unit price snapshot */}
                <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                    ₹{itemUnitTotal.toFixed(2)} × {quantity}
                </Text>

                {/* Item note */}
                {item.orderItemNote ? (
                    <Text className="text-xs mt-1 italic" style={{ color: colors.textSecondary }}>
                        Note: {item.orderItemNote}
                    </Text>
                ) : null}

                {editingItemNoteId === item.cartId ? (
                    <View className="mt-2">
                        <TextInput
                            value={itemNoteDraft}
                            onChangeText={setItemNoteDraft}
                            placeholder="Add note for this item"
                            multiline
                            className="border rounded-lg px-3 py-2 text-xs"
                            style={{
                                borderColor: colors.border,
                                color: colors.text,
                                backgroundColor: colors.background,
                                minHeight: 60,
                                textAlignVertical: 'top',
                            }}
                        />
                        <View className="flex-row gap-2 mt-2">
                            <TouchableOpacity
                                onPress={cancelItemNoteEdit}
                                className="px-3 py-2 rounded-lg border"
                                style={{ borderColor: colors.border }}
                            >
                                <Text className="text-xs" style={{ color: colors.text }}>
                                    Cancel
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={saveItemNote}
                                className="px-3 py-2 rounded-lg bg-primary"
                            >
                                <Text className="text-xs font-semibold" style={{ color: colors.textInverse }}>
                                    Save Note
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <TouchableOpacity onPress={() => openItemNoteModal(item)} className="mt-2">
                        <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
                            {item.orderItemNote ? 'Edit Item Note' : 'Add Item Note'}
                        </Text>
                    </TouchableOpacity>
                )}

                {/* Price and Quantity Controls */}
                <View className="flex-row justify-between items-center mt-2">
                    <Text className="font-semibold text-sm" style={{ color: colors.primary }}>
                        ₹{itemLineTotal.toFixed(2)}
                    </Text>
                    <View className="flex-row items-center gap-2">
                        <TouchableOpacity
                            onPress={() => updateQuantity(item.cartId || '', quantity - 1)}
                            className="bg-error rounded-full p-1.5"
                        >
                            <MaterialCommunityIcons name="minus" size={14} color={colors.textInverse} />
                        </TouchableOpacity>
                        <Text
                            className="font-semibold w-6 text-center"
                            style={{ color: colors.text }}
                        >
                            {quantity}
                        </Text>
                        <TouchableOpacity
                            onPress={() => updateQuantity(item.cartId || '', quantity + 1)}
                            className="bg-success rounded-full p-1.5"
                        >
                            <MaterialCommunityIcons name="plus" size={14} color={colors.textInverse} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => removeFromCart(item.cartId || '')}
                            className="ml-2 p-1.5"
                        >
                            <MaterialCommunityIcons name="trash-can" size={16} color={colors.error} />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
                <View className="flex-1 justify-center items-center">
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <View className="flex-row flex-1">
                {/* Menu Section */}
                <View className="flex-1">
                    {/* Category Tabs */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        className="px-4 py-2 border-b"
                        style={{ borderColor: colors.border, maxHeight: 50 }}
                        scrollEnabled={true}
                        contentContainerStyle={{ alignItems: 'center' }}
                    >
                        {categories.length > 0 ? (
                            categories.map((category, index) => (
                                <TouchableOpacity
                                    key={`${getCategoryIdentity(category, index)}-${index}`}
                                    onPress={() => setActiveCategory(index)}
                                    className="mr-3 px-3 py-1 rounded-full border"
                                    style={{
                                        backgroundColor:
                                            activeCategory === index ? colors.primary : colors.surface,
                                        borderColor:
                                            activeCategory === index ? colors.primary : colors.border,
                                    }}
                                >
                                    <Text
                                        className="text-xs font-semibold"
                                        style={{
                                            color:
                                                activeCategory === index
                                                    ? colors.textInverse
                                                    : colors.text,
                                        }}
                                        numberOfLines={1}
                                    >
                                        {category.name}
                                    </Text>
                                </TouchableOpacity>
                            ))
                        ) : (
                            <Text
                                className="text-sm"
                                style={{ color: colors.textSecondary }}
                            >
                                No categories available
                            </Text>
                        )}
                    </ScrollView>

                    {/* Menu Items */}
                    <ScrollView className="flex-1 px-4 py-3">
                        {categories.length === 0 ? (
                            <View className="flex-1 justify-center items-center py-12">
                                <MaterialCommunityIcons
                                    name="clipboard-off"
                                    size={48}
                                    color={colors.textSecondary}
                                    style={{ marginBottom: 12 }}
                                />
                                <Text
                                    className="text-base font-semibold text-center"
                                    style={{ color: colors.text, marginBottom: 4 }}
                                >
                                    No Menu Available
                                </Text>
                                <Text
                                    className="text-sm text-center"
                                    style={{ color: colors.textSecondary }}
                                >
                                    Please check back later or contact support
                                </Text>
                            </View>
                        ) : categories[activeCategory]?.menuItems &&
                            categories[activeCategory].menuItems.length > 0 ? (
                            <View className='flex-row flex-wrap gap-3'>
                                {
                                    categories[activeCategory].menuItems.map((item: MenuItem, itemIndex: number) =>
                                        renderMenuItemCard(item, itemIndex)
                                    )
                                }
                            </View>
                        ) : (
                            <View className="flex-1 justify-center items-center py-12">
                                <Text
                                    className="text-sm text-center"
                                    style={{ color: colors.textSecondary }}
                                >
                                    No items in {categories[activeCategory]?.name}
                                </Text>
                            </View>
                        )}
                    </ScrollView>
                </View>

                {/* Cart Section - Floating or Sidebar */}
                <Animated.View
                    className="absolute bottom-6 right-6"
                    style={{
                        transform: [{ scale: cartFabScaleAnim }],
                        // shadowColor: colors.primary,
                        // shadowOpacity: 0.35,
                        // shadowRadius: 12,
                        // shadowOffset: { width: 0, height: 6 },
                        elevation: 8,
                        overflow: 'visible',
                    }}
                >
                    <View style={{ position: 'relative' }}>
                        <TouchableOpacity
                            onPress={toggleCartDrawer}
                            activeOpacity={0.9}
                            className="rounded-2xl items-center justify-center"
                            style={{
                                backgroundColor: colors.primary,
                                borderWidth: 1.5,
                                borderColor: `${colors.textInverse}22`,
                                height: 56,
                                minWidth: 56,
                                paddingHorizontal: 14,
                            }}
                        >
                            <MaterialCommunityIcons name="cart-outline" size={28} color={colors.textInverse} />
                        </TouchableOpacity>
                        {cartQuantity > 0 && (
                            <Animated.View
                                style={{
                                    position: 'absolute',
                                    top: -6,
                                    right: -6,
                                    minWidth: 30,
                                    height: 30,
                                    borderRadius: 15,
                                    paddingHorizontal: 8,
                                    backgroundColor: colors.error,
                                    borderWidth: 2,
                                    borderColor: colors.surface,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    transform: [{ scale: cartBadgeScaleAnim }],
                                }}
                            >
                                <Text style={{ color: colors.textInverse, fontSize: 12, fontWeight: '700', lineHeight: 14 }}>
                                    {cartQuantity > 99 ? '99+' : cartQuantity}
                                </Text>
                            </Animated.View>
                        )}
                    </View>
                </Animated.View>

                {/* Cart Drawer */}
                <Modal
                    visible={showCart}
                    transparent
                    animationType="none"
                    onRequestClose={closeCartDrawer}
                    statusBarTranslucent
                >
                    <View style={{ flex: 1 }}>
                        <Animated.View
                            pointerEvents="none"
                            style={{
                                position: 'absolute',
                                top: 0,
                                right: 0,
                                bottom: 0,
                                left: 0,
                                backgroundColor: colors.overlay || 'rgba(0,0,0,0.35)',
                                opacity: cartDrawerBackdropAnim,
                            }}
                        />

                        <Pressable
                            onPress={closeCartDrawer}
                            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
                        />

                        <Animated.View
                            style={{
                                position: 'absolute',
                                top: 0,
                                right: 0,
                                bottom: 0,
                                width: cartDrawerWidth,
                                backgroundColor: colors.background,
                                borderTopLeftRadius: 16,
                                borderBottomLeftRadius: 16,
                                borderLeftWidth: 1,
                                borderColor: colors.border,
                                overflow: 'hidden',
                                transform: [{ translateX: cartDrawerTranslateAnim }],
                            }}
                        >
                            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
                                {/* Cart Header */}
                                <View
                                    className="px-4 py-4 border-b flex-row justify-between items-center"
                                    style={{ borderColor: colors.border }}
                                >
                                    <Text className="text-lg font-bold" style={{ color: colors.text }}>
                                        Cart
                                    </Text>
                                    <TouchableOpacity onPress={closeCartDrawer}>
                                        <MaterialCommunityIcons
                                            name="close"
                                            size={24}
                                            color={colors.text}
                                        />
                                    </TouchableOpacity>
                                </View>

                                {/* Cart Items */}
                                <ScrollView
                                    className="flex-1 px-4 py-3"
                                    nestedScrollEnabled
                                    keyboardShouldPersistTaps="handled"
                                    contentContainerStyle={{ paddingBottom: 12 }}
                                >
                                    {cart.items.length > 0 ? (
                                        cart.items.map((item) => renderCartItem(item))
                                    ) : (
                                        <View className="flex-1 justify-center items-center">
                                            <Text style={{ color: colors.textSecondary }}>
                                                Cart is empty
                                            </Text>
                                        </View>
                                    )}
                                </ScrollView>

                                {/* Cart Footer */}
                                {cart.items.length > 0 && (
                                    <View
                                        className="px-4 py-4 border-t"
                                        style={{ borderColor: colors.border, backgroundColor: colors.surface }}
                                    >
                                        {isEditingOrderNote ? (
                                            <View className="mb-3">
                                                <TextInput
                                                    value={orderNoteDraft}
                                                    onChangeText={setOrderNoteDraft}
                                                    placeholder="Add note for this cart/order"
                                                    multiline
                                                    className="border rounded-lg px-3 py-2 text-sm"
                                                    style={{
                                                        borderColor: colors.border,
                                                        color: colors.text,
                                                        backgroundColor: colors.background,
                                                        minHeight: 70,
                                                        textAlignVertical: 'top',
                                                    }}
                                                />
                                                <View className="flex-row gap-2 mt-2">
                                                    <TouchableOpacity
                                                        onPress={cancelOrderNoteEdit}
                                                        className="px-3 py-2 rounded-lg border"
                                                        style={{ borderColor: colors.border }}
                                                    >
                                                        <Text className="text-xs" style={{ color: colors.text }}>
                                                            Cancel
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        onPress={saveOrderNote}
                                                        className="px-3 py-2 rounded-lg bg-primary"
                                                    >
                                                        <Text
                                                            className="text-xs font-semibold"
                                                            style={{ color: colors.textInverse }}
                                                        >
                                                            Save Cart Note
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ) : (
                                            <TouchableOpacity onPress={() => setShowCartNoteModal(true)} className="mb-3">
                                                <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
                                                    {cart.orderNote ? 'Edit Cart Note' : 'Add Cart Note'}
                                                </Text>
                                            </TouchableOpacity>
                                        )}

                                        {/* Discount */}
                                        {cart.discount ? (
                                            <Text className="text-xs mb-2" style={{ color: colors.textSecondary }}>
                                                Discount: {cart.discount.discountName || getDiscountTypeLabel(cart.discount.discountType)} ({getDiscountLabel(cart.discount)})
                                            </Text>
                                        ) : null}
                                        {isEditingDiscount ? (
                                            <View className="mb-3">
                                                <View className="flex-row gap-2 mb-2">
                                                    <TouchableOpacity
                                                        onPress={() => setDiscountTypeDraft('PERCENTAGE')}
                                                        className="px-3 py-2 rounded-lg border"
                                                        style={{
                                                            borderColor:
                                                                discountTypeDraft === 'PERCENTAGE' ? colors.primary : colors.border,
                                                            backgroundColor:
                                                                discountTypeDraft === 'PERCENTAGE'
                                                                    ? `${colors.primary}20`
                                                                    : colors.surface,
                                                        }}
                                                    >
                                                        <Text
                                                            className="text-xs font-semibold"
                                                            style={{
                                                                color:
                                                                    discountTypeDraft === 'PERCENTAGE'
                                                                        ? colors.primary
                                                                        : colors.text,
                                                            }}
                                                        >
                                                            Percentage (%)
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        onPress={() => setDiscountTypeDraft('FLAT')}
                                                        className="px-3 py-2 rounded-lg border"
                                                        style={{
                                                            borderColor:
                                                                discountTypeDraft === 'FLAT' ? colors.primary : colors.border,
                                                            backgroundColor:
                                                                discountTypeDraft === 'FLAT'
                                                                    ? `${colors.primary}20`
                                                                    : colors.surface,
                                                        }}
                                                    >
                                                        <Text
                                                            className="text-xs font-semibold"
                                                            style={{
                                                                color: discountTypeDraft === 'FLAT' ? colors.primary : colors.text,
                                                            }}
                                                        >
                                                            Flat (₹)
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                                <TextInput
                                                    value={discountValueDraft}
                                                    onChangeText={setDiscountValueDraft}
                                                    placeholder={
                                                        discountTypeDraft === 'PERCENTAGE'
                                                            ? 'Discount %'
                                                            : 'Discount amount'
                                                    }
                                                    keyboardType="decimal-pad"
                                                    className="border rounded-lg px-3 py-2 text-sm"
                                                    style={{
                                                        borderColor: colors.border,
                                                        color: colors.text,
                                                        backgroundColor: colors.background,
                                                    }}
                                                />
                                                <View className="flex-row gap-2 mt-2">
                                                    <TouchableOpacity
                                                        onPress={cancelDiscountEdit}
                                                        className="px-3 py-2 rounded-lg border"
                                                        style={{ borderColor: colors.border }}
                                                    >
                                                        <Text className="text-xs" style={{ color: colors.text }}>
                                                            Cancel
                                                        </Text>
                                                    </TouchableOpacity>
                                                    {!!cart.discount && (
                                                        <TouchableOpacity
                                                            onPress={clearDiscount}
                                                            className="px-3 py-2 rounded-lg border"
                                                            style={{ borderColor: colors.error }}
                                                        >
                                                            <Text className="text-xs" style={{ color: colors.error }}>
                                                                Remove
                                                            </Text>
                                                        </TouchableOpacity>
                                                    )}
                                                    <TouchableOpacity
                                                        onPress={saveDiscount}
                                                        className="px-3 py-2 rounded-lg bg-primary"
                                                    >
                                                        <Text
                                                            className="text-xs font-semibold"
                                                            style={{ color: colors.textInverse }}
                                                        >
                                                            Apply Discount
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ) : (
                                            <TouchableOpacity onPress={startDiscountEdit} className="mb-3">
                                                <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
                                                    {cart.discount ? 'Edit Discount' : 'Add Discount'}
                                                </Text>
                                            </TouchableOpacity>
                                        )}

                                        <View className="flex-row justify-between mb-2">
                                            <Text style={{ color: colors.textSecondary }}>Subtotal</Text>
                                            <Text
                                                className="font-semibold"
                                                style={{ color: colors.text }}
                                            >
                                                ₹{calculateSubtotal().toFixed(2)}
                                            </Text>
                                        </View>
                                        {cart.orderNote ? (
                                            <View className="mb-2">
                                                <Text style={{ color: colors.textSecondary }}>Cart Note</Text>
                                                <Text className="text-xs mt-1" style={{ color: colors.text }}>
                                                    {cart.orderNote}
                                                </Text>
                                            </View>
                                        ) : null}
                                        {calculateDiscount() > 0 && (
                                            <View className="flex-row justify-between mb-2">
                                                <Text style={{ color: colors.textSecondary }}>Discount</Text>
                                                <Text className="font-semibold" style={{ color: colors.error }}>
                                                    -₹{calculateDiscount().toFixed(2)}
                                                </Text>
                                            </View>
                                        )}
                                        <View className="flex-row justify-between mb-3">
                                            <Text className="font-semibold" style={{ color: colors.text }}>
                                                Total
                                            </Text>
                                            <Text className="font-bold" style={{ color: colors.primary }}>
                                                ₹{calculateTotal().toFixed(2)}
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            onPress={proceedToCheckout}
                                            className="bg-primary rounded-lg py-3"
                                        >
                                            <Text
                                                className="text-center font-bold text-base"
                                                style={{ color: colors.textInverse }}
                                            >
                                                Proceed ({cartQuantity} items)
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </SafeAreaView>
                        </Animated.View>
                    </View>
                </Modal>
            </View>

            {/* Item Details Modal - For variant and attribute selection */}
            {selectedMenuItem && (
                <ItemDetailsModal
                    visible={showItemDetail}
                    item={selectedMenuItem}
                    category={categories[activeCategory]}
                    onClose={() => {
                        setShowItemDetail(false);
                        setSelectedMenuItem(null);
                    }}
                    onConfirm={handleModalConfirm}
                />
            )}

            {/* Item Note Modal */}
            <ItemNoteModal
                visible={showItemNoteModal}
                initialNote={itemNoteDraft}
                onClose={() => setShowItemNoteModal(false)}
                onSave={saveItemNoteModal}
            />

            {/* Cart Note & Discount Modal */}
            <CartNoteModal
                visible={showCartNoteModal}
                initialNote={cart.orderNote || ''}
                initialDiscount={cart.discount || null}
                onClose={() => setShowCartNoteModal(false)}
                onSave={async (note: string, discount: any) => {
                    await saveCartNoteAndDiscount(note, discount);
                    setShowCartNoteModal(false);
                }}
            />
        </View>
    );
}
