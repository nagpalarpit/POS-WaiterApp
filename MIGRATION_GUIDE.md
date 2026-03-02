# Quick Migration Guide

This guide provides quick reference for migrating from old to new refactored screens.

## 🔄 File Replacement Quick Reference

```
BEFORE (Old Structure)                AFTER (New Structure)
─────────────────────────────────────────────────────────────

MenuScreen.tsx (1,442 lines)          MenuScreen-refactored.tsx (~300 lines)
│                                     ├── uses: useMenuData
│                                     ├── uses: useMenuCart
│                                     ├── uses: useCartDrawerAnimation
│                                     ├── uses: useCartNotes
│                                     ├── uses: useCartFeedback
│                                     └── renders: MenuScreen components

DashboardScreen.tsx (599 lines)       DashboardScreen-refactored.tsx (~400 lines)
│                                     ├── uses: useOrdersData
│                                     ├── uses: useSettings
│                                     └── uses: useTableStatistics

CheckoutScreen.tsx (498 lines)        CheckoutScreen-refactored.tsx (~300 lines)
                                      └── uses: useOrderSubmit
```

## 🚀 Step-by-Step Migration

### 1. Update Import Statements

**Before:**
```tsx
import MenuScreen from './screens/MenuScreen';
import DashboardScreen from './screens/DashboardScreen';
import CheckoutScreen from './screens/CheckoutScreen';
```

**After:**
```tsx
import MenuScreen from './screens/MenuScreen-refactored';
import DashboardScreen from './screens/DashboardScreen-refactored';
import CheckoutScreen from './screens/CheckoutScreen-refactored';
```

### 2. Verify Navigation Params

The refactored screens accept the same navigation params:

**MenuScreen params:**
```tsx
navigation.navigate('Menu', {
  tableNo: 5,           // optional
  deliveryType: 0,      // 0=dine-in, 1=delivery, 2=pickup
})
```

**DashboardScreen params:**
```tsx
navigation.navigate('Dashboard')  // No params required
```

**CheckoutScreen params:**
```tsx
navigation.navigate('Checkout', {
  cart: cartObject,
  tableNo: 5,
  deliveryType: 0,
})
```

### 3. Test Each Screen

#### MenuScreen Testing
```javascript
✓ Menu loads correctly
✓ No categories → show empty state
✓ Click category → switches items
✓ Click item → shows options modal OR adds to cart
✓ Item note modal works
✓ Cart FAB animates on add
✓ Cart drawer slides in/out smoothly
✓ Discount validation works
✓ Proceed to checkout passes cart correctly
```

#### DashboardScreen Testing
```javascript
✓ Dashboard loads on first render
✓ Tab switching works (Tables/Delivery/Pickup)
✓ Table grid displays correctly
✓ Click available table → goes to Menu
✓ Click booked table → goes to OrderDetails
✓ Refresh functionality works
✓ Delivery/Pickup orders display correctly
✓ Order status badges show correctly
```

#### CheckoutScreen Testing
```javascript
✓ Order summary displays correctly
✓ Item list shows all details
✓ Pricing calculations are accurate
✓ Discount is applied correctly
✓ Tax calculation works
✓ Edit Order button goes back to menu
✓ Place Order submits successfully
✓ Success message shows
✓ Navigation to Dashboard works
```

## 🔌 Hook Integration Examples

### Using useMenuData in a Custom Component

```tsx
import { useMenuData, normalizeMenuItemForOptions } from '../hooks/useMenuData';

function MyCustomMenuComponent() {
  const { categories, loading, activeCategory, setActiveCategory } = useMenuData();
  
  if (loading) return <ActivityIndicator />;
  
  return (
    <View>
      {categories.map((cat, idx) => (
        <Text key={idx}>{cat.name}</Text>
      ))}
    </View>
  );
}
```

### Using useMenuCart in a Modal

```tsx
import { useMenuCart } from '../hooks/useMenuCart';

function CartModal() {
  const { cart, addToCartDirect, updateQuantity, removeFromCart } = useMenuCart();
  
  return (
    <View>
      <Text>Cart Items: {cart.items.length}</Text>
      {/* Render cart items */}
    </View>
  );
}
```

### Using useOrdersData in a Dashboard Widget

```tsx
import { useOrdersData } from '../hooks/useOrdersData';

function OrdersSummaryWidget() {
  const { dineInTables, deliveryOrders, pickupOrders, loading } = useOrdersData();
  
  return (
    <View>
      <Text>Dine In: {dineInTables.length}</Text>
      <Text>Delivery: {deliveryOrders.length}</Text>
      <Text>Pickup: {pickupOrders.length}</Text>
    </View>
  );
}
```

## 🎨 Component Integration Examples

### Using MenuItemCard Standalone

```tsx
import { MenuItemCard } from '../components/MenuScreen';

function CustomMenu() {
  const { colors } = useTheme();
  
  return (
    <MenuItemCard
      item={menuItem}
      itemIndex={0}
      onAddToCart={(item) => handleAdd(item)}
      colors={colors}
    />
  );
}
```

### Using CartItemRow Standalone

```tsx
import { CartItemRow } from '../components/MenuScreen';

function CustomCartList() {
  const { colors } = useTheme();
  
  return (
    <CartItemRow
      item={cartItem}
      isEditing={editMode}
      editingNote={noteText}
      onNoteChange={setNoteText}
      onOpenNoteModal={openNoteModal}
      onUpdateQuantity={updateQty}
      onRemoveItem={removeItem}
      colors={colors}
      {...other props}
    />
  );
}
```

## 🔍 Debugging Quick Tips

### Check Hook Output
```tsx
const menuData = useMenuData();
console.log('Menu data:', menuData);
// Should show: { categories, loading, activeCategory, ... }
```

### Verify State Updates
```tsx
const { cart } = useMenuCart();
console.log('Current cart:', cart);
console.log('Cart items:', cart.items.length);
```

### Check Animation Values
```tsx
const { cartDrawerTranslateAnim } = useCartDrawerAnimation(400);
console.log('Animation value:', cartDrawerTranslateAnim);
```

## 📊 Before/After Code Comparison

### MenuScreen - Adding Item to Cart

**BEFORE (Original):**
```tsx
// In 1,442 line file:
const addToCart = (category: MenuCategory, item: MenuItem) => {
  const normalizedItem = normalizeMenuItemForOptions(item);
  const hasVariants = Array.isArray(normalizedItem.menuItemVariants) && 
                      normalizedItem.menuItemVariants.length > 0;
  if (hasVariants) {
    setSelectedMenuItem(normalizedItem);
    setShowItemDetail(true);
  } else {
    addToCartDirect(category, normalizedItem, null, null, undefined);
  }
};

// Plus all the cart logic mixed in the same file...
```

**AFTER (Refactored):**
```tsx
// In screen (~300 lines):
const addToCart = (item: any) => {
  const normalizedItem = normalizeMenuItemForOptions(item);
  const hasVariants = Array.isArray(normalizedItem.menuItemVariants) &&
                      normalizedItem.menuItemVariants.length > 0;
  if (hasVariants) {
    setSelectedMenuItem(normalizedItem);
    setShowItemDetail(true);
  } else {
    handleAddToCartDirect(item, null, null, undefined);
  }
};

// Cart logic is in useMenuCart hook - clean separation!
```

### DashboardScreen - Order Fetching

**BEFORE (Original):**
```tsx
// In 599 line file:
const fetchOrders = async () => {
  try {
    setLoading(true);
    const orders = await localDatabase.select('order', { where: {} });
    if (orders && Array.isArray(orders)) {
      setAllOrders(orders);
      const dineIn = orders.filter(o => o.orderDetails?.orderDeliveryTypeId === 0);
      const delivery = orders.filter(o => o.orderDetails?.orderDeliveryTypeId === 1);
      // ... more filtering code
    }
  } catch (error) {
    console.log('Error:', error);
  } finally {
    setLoading(false);
  }
};

// Plus all state management in same file
```

**AFTER (Refactored):**
```tsx
// In screen (~400 lines):
const ordersData = useOrdersData();
// Now access:
// ordersData.dineInTables
// ordersData.deliveryOrders
// ordersData.pickupOrders
// ordersData.fetchOrders()

// Hook handles all the logic - screen stays clean!
```

## ✅ Verification Checklist

After migration, verify:

- [ ] All imports resolve without errors
- [ ] App compiles successfully
- [ ] MenuScreen displays menu correctly
- [ ] Can add items to cart
- [ ] Cart drawer animations work
- [ ] DashboardScreen shows orders
- [ ] Table grid displays
- [ ] CheckoutScreen shows order summary
- [ ] Can place orders
- [ ] No console errors
- [ ] No TypeScript compilation errors
- [ ] Navigation between screens works
- [ ] No performance regressions

## 🎯 Key Takeaways

1. **Functionality**: Refactored screens have 100% feature parity
2. **Performance**: Better organization enables better optimization
3. **Maintainability**: Much easier to understand and modify
4. **Testability**: Hooks can be unit tested independently
5. **Reusability**: Hooks and components can be used elsewhere

## 🆘 If Something Breaks

1. Check the stack trace for which screen/hook failed
2. Look at REFACTORING_GUIDE.md for hook documentation
3. Compare with original screen for what changed
4. Check hook dependencies and state management
5. Use React DevTools to inspect component tree

## 📞 Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "Cannot read property of undefined" | Check if data is loaded, add null checks |
| Animations not working | Verify `useNativeDriver: true` is set |
| State not updating | Check hook dependencies, verify setter is called |
| Component not rendering | Check hooks return values, verify props |
| Navigation broken | Verify screen names haven't changed |
| Colors undefined | Ensure `useTheme()` is called in component |

---

**Ready to migrate?** Start with step 1 (Update imports), then test each screen systematically! 🚀
