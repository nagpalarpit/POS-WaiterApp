# WaiterApp Refactoring Documentation

## Overview

The WaiterApp has been refactored to improve code organization, readability, and maintainability. The previous monolithic screens have been split into:

1. **Custom Hooks** - Business logic and state management
2. **Reusable Components** - UI components for rendering
3. **Clean Screens** - Simple orchestration and navigation

## File Structure

```
src/
├── hooks/                              # Custom hooks for business logic
│   ├── useMenuData.ts                 # Menu loading and normalization
│   ├── useMenuCart.ts                 # Cart state management
│   ├── useCartDrawerAnimation.ts       # Cart drawer animations
│   ├── useCartNotes.ts                # Cart notes and discount editing
│   ├── useCartFeedback.ts             # Haptic feedback and animations
│   ├── useOrdersData.ts               # Orders fetching and filtering
│   ├── useSettings.ts                 # Settings management
│   ├── useTableStatistics.ts          # Table statistics calculation
│   ├── useOrderSubmit.ts              # Order submission logic
│   └── index.ts                       # Barrel export
│
├── components/
│   ├── MenuScreen/                    # MenuScreen sub-components
│   │   ├── CategoryTabs.tsx           # Category tabs navigation
│   │   ├── MenuItemCard.tsx           # Individual menu item card
│   │   ├── MenuItemsGrid.tsx          # Menu items grid layout
│   │   ├── CartItemRow.tsx            # Individual cart item row
│   │   ├── CartFAB.tsx                # Floating action button
│   │   ├── CartSummary.tsx            # Cart totals and checkout
│   │   ├── CartDrawer.tsx             # Cart drawer modal
│   │   └── index.ts                   # Barrel export
│   │
│   ├── DashboardScreen/               # DashboardScreen sub-components
│   └── CheckoutScreen/                # CheckoutScreen sub-components
│
└── screens/
    ├── MenuScreen-refactored.tsx      # ← New refactored version
    ├── DashboardScreen-refactored.tsx # ← New refactored version
    ├── CheckoutScreen-refactored.tsx  # ← New refactored version
    ├── MenuScreen.tsx                 # (Original - keep for reference)
    ├── DashboardScreen.tsx            # (Original - keep for reference)
    └── CheckoutScreen.tsx             # (Original - keep for reference)
```

## Hook Reference

### useMenuData
Manages menu data loading, normalization, and category selection.

**Usage:**
```tsx
const menuData = useMenuData();
// Returns: { categories, loading, activeCategory, setActiveCategory, loadMenu }
```

**Features:**
- Loads menu from local database
- Normalizes menu items and variants
- Deduplicates categories and items
- Filters out irrelevant categories (cart, voucher)

### useMenuCart
Manages shopping cart operations.

**Usage:**
```tsx
const cartData = useMenuCart();
// Returns: { cart, cartQuantity, addToCartDirect, updateQuantity, removeFromCart, updateItemNote, updateOrderNote, updateDiscount }
```

**Features:**
- Add/remove items from cart
- Update quantities
- Manage item and order notes
- Apply and update discounts

### useCartDrawerAnimation
Manages cart drawer slide-in/out animations.

**Usage:**
```tsx
const cartAnimation = useCartDrawerAnimation(cartDrawerWidth);
// Returns: { showCart, cartDrawerTranslateAnim, cartDrawerBackdropAnim, openCartDrawer, closeCartDrawer, toggleCartDrawer }
```

**Features:**
- Smooth slide-in animation
- Backdrop fade effect
- Hardware back button support

### useCartNotes
Manages cart note and discount editing states.

**Usage:**
```tsx
const cartNotes = useCartNotes(cart, onSaveNote, onSaveDiscount);
// Returns: item note states, order note states, discount states, and handlers
```

**Features:**
- Item-level note editing
- Order-level note editing
- Discount type and value management
- Validation for discount percentage

### useOrdersData
Fetches and separates orders by delivery type.

**Usage:**
```tsx
const ordersData = useOrdersData();
// Returns: { allOrders, dineInTables, deliveryOrders, pickupOrders, loading, fetchOrders }
```

**Features:**
- Fetches from local database
- Separates by delivery type
- Automatic initial load

### useSettings
Loads app settings.

**Usage:**
```tsx
const settingsData = useSettings();
// Returns: { settings, loadingSettings, loadSettings, setSettings }
```

**Features:**
- Default settings available
- Extensible for future configurations

### useTableStatistics
Calculates table occupancy statistics.

**Usage:**
```tsx
const tableStats = useTableStatistics(dineInOrders, settings);
// Returns: { availableTablesCount, bookedTablesCount, semiPaidTablesCount }
```

**Features:**
- Calculates available tables
- Identifies booked tables
- Identifies semi-paid tables

### useOrderSubmit
Handles order submission and validation.

**Usage:**
```tsx
const orderSubmit = useOrderSubmit(cart, tableNo, deliveryType);
// Returns: { loading, submitOrder, prepareOrderItems }
```

**Features:**
- Prepares order payload
- Validates required fields
- Clears cart after success

## Component Reference

### MenuScreen Components

**CategoryTabs**
- Horizontal scrollable category list
- Props: categories, activeCategory, onCategorySelect, colors

**MenuItemCard**
- Individual menu item display with add button
- Props: item, itemIndex, onAddToCart, colors

**MenuItemsGrid**
- Grid layout for menu items
- Props: categories, activeCategory, onAddToCart, colors

**CartItemRow**
- Individual cart item with quantity controls
- Props: item, isEditing, editingNote, handlers, colors

**CartFAB**
- Floating action button with badge
- Props: cartQuantity, onPress, animations, colors

**CartSummary**
- Cart totals and checkout button
- Props: cart, cartQuantity, handlers, colors

**CartDrawer**
- Modal drawer for cart display
- Props: visible, cart, animations, handlers, colors

## Migration Guide

### Step 1: Update Navigation

Replace original screen imports with refactored versions:

```tsx
// Before
import MenuScreen from './screens/MenuScreen';
import DashboardScreen from './screens/DashboardScreen';
import CheckoutScreen from './screens/CheckoutScreen';

// After
import MenuScreen from './screens/MenuScreen-refactored';
import DashboardScreen from './screens/DashboardScreen-refactored';
import CheckoutScreen from './screens/CheckoutScreen-refactored';
```

### Step 2: Test Each Screen

1. **MenuScreen**: Verify menu loading, item addition, cart operations
2. **DashboardScreen**: Verify order fetching, table display, stats
3. **CheckoutScreen**: Verify order placement, calculations

### Step 3: Performance Optimization

The refactored version is optimized:
- Reduced re-renders through proper hook dependencies
- Memoized calculations
- Efficient state management
- Lazy component rendering

## Benefits of Refactoring

### 1. **Separation of Concerns**
- Hooks: Business logic and state
- Components: UI rendering
- Screens: Navigation and orchestration

### 2. **Maintainability**
- Easier to find and fix bugs
- Clear responsibility boundaries
- Improved code readability

### 3. **Reusability**
- Hooks can be used in multiple screens
- Components can be composed flexibly

### 4. **Testing**
- Hooks can be unit tested independently
- Components can be tested in isolation
- Better mock-ability

### 5. **Performance**
- Reduced re-renders
- Better state organization
- Optimized animations

## Key Changes from Original

### MenuScreen (from 1442 lines to ~300 lines)

**Before:**
- All logic mixed with rendering
- Heavy state management in component
- Complex normalization functions inline

**After:**
- Logic extracted to hooks
- Components for each section
- Clean, focused screen file
- Better hook-based state management

### DashboardScreen (from 599 lines to ~400 lines)

**Before:**
- Orders, settings, and stats in single component
- Complex filtering and calculations inline

**After:**
- Orders logic in `useOrdersData`
- Settings in `useSettings`
- Stats in `useTableStatistics`
- Clean separation of concerns

### CheckoutScreen (from 498 lines to ~300 lines)

**Before:**
- Order submission logic mixed with UI
- Complex payload preparation inline

**After:**
- Order submission logic in `useOrderSubmit`
- Clean checkout flow
- Better error handling

## Common Patterns

### Creating a New Hook

```tsx
import { useState, useEffect } from 'react';

export const useMyFeature = (deps) => {
  const [state, setState] = useState(initialValue);

  useEffect(() => {
    // Setup logic
    return () => {
      // Cleanup logic
    };
  }, [deps]);

  return {
    state,
    setState,
    // methods
  };
};
```

### Creating a New Component

```tsx
import React from 'react';
import { View, Text } from 'react-native';

interface MyComponentProps {
  prop1: string;
  prop2: number;
  colors: any;
}

export const MyComponent: React.FC<MyComponentProps> = ({
  prop1,
  prop2,
  colors,
}) => {
  return (
    <View style={{ backgroundColor: colors.background }}>
      <Text style={{ color: colors.text }}>{prop1}</Text>
    </View>
  );
};
```

## Next Steps

1. ✅ Replace screen imports in navigation
2. ✅ Test all functionality thoroughly
3. ✅ Performance monitoring and optimization
4. 🔄 Refactor remaining screens (OrderDetailsScreen, etc.)
5. 🔄 Create additional reusable components
6. 🔄 Add unit tests for hooks
7. 🔄 Add component tests with React Testing Library

## Troubleshooting

### Issue: Component not re-rendering
- Check hook dependencies
- Ensure state setters are called
- Verify prop changes propagate

### Issue: Performance degradation
- Check for unnecessary re-renders (React DevTools Profiler)
- Verify hook dependencies
- Consider memoization for expensive computations

### Issue: Animation glitches
- Check animation cleanup in useEffect
- Verify animation value ranges
- Test on different devices

## Questions & Support

For questions about the refactored structure or implementation details, refer to:
1. Hook documentation in hook files
2. Component prop interfaces
3. Example usage in screen files
