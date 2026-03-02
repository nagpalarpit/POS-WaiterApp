# 🗂️ Quick File Reference

A quick lookup guide for all new files created during refactoring.

## 📋 All New Files

### Custom Hooks (9 files in `src/hooks/`)

#### 1. `useMenuData.ts`
**Purpose**: Menu loading and normalization  
**Exports**: Hook + utility functions  
**Key Functions**:
- `useMenuData()` - Main hook
- `normalizeMenuItemVariants()` - Normalize items
- `normalizeMenuItemForOptions()` - Format items for options

**Usage**:
```tsx
const { categories, loading, activeCategory, setActiveCategory } = useMenuData();
```

---

#### 2. `useMenuCart.ts`
**Purpose**: Shopping cart state management  
**Key Functions**:
- `useMenuCart()` - Main hook
- Returns: cart, cartQuantity, addToCartDirect, updateQuantity, removeFromCart, etc.

**Usage**:
```tsx
const { cart, cartQuantity, addToCartDirect } = useMenuCart();
```

---

#### 3. `useCartDrawerAnimation.ts`
**Purpose**: Cart drawer slide animations  
**Key Functions**:
- `useCartDrawerAnimation()` - Main hook
- Returns: showCart, animations, open/close/toggle functions

**Usage**:
```tsx
const { showCart, toggleCartDrawer, cartDrawerTranslateAnim } = useCartDrawerAnimation(400);
```

---

#### 4. `useCartNotes.ts`
**Purpose**: Cart note and discount editing states  
**Key Functions**:
- `useCartNotes()` - Main hook
- Returns: item note states, order note states, discount states

**Usage**:
```tsx
const cartNotes = useCartNotes(cart, onSaveNote, onSaveDiscount);
// cartNotes.editingItemNoteId, cartNotes.discountValueDraft, etc.
```

---

#### 5. `useCartFeedback.ts`
**Purpose**: Haptic feedback and cart animations  
**Key Functions**:
- `useCartFeedback()` - Main hook
- Returns: scale animations, feedback trigger function

**Usage**:
```tsx
const { cartFabScaleAnim, triggerCartAddedFeedback } = useCartFeedback();
```

---

#### 6. `useOrdersData.ts`
**Purpose**: Orders fetching and separation by delivery type  
**Exports**: Hook + constants + interfaces  
**Key Functions**:
- `useOrdersData()` - Main hook
- Returns: allOrders, dineInTables, deliveryOrders, pickupOrders

**Usage**:
```tsx
const { dineInTables, deliveryOrders, pickupOrders, loading } = useOrdersData();
```

---

#### 7. `useSettings.ts`
**Purpose**: App settings management  
**Key Functions**:
- `useSettings()` - Main hook
- Returns: settings, loadSettings, etc.

**Usage**:
```tsx
const { settings, loadingSettings } = useSettings();
```

---

#### 8. `useTableStatistics.ts`
**Purpose**: Table occupancy statistics calculation  
**Key Functions**:
- `useTableStatistics()` - Main hook
- Returns: availableTablesCount, bookedTablesCount, semiPaidTablesCount

**Usage**:
```tsx
const { availableTablesCount, bookedTablesCount } = useTableStatistics(orders, settings);
```

---

#### 9. `useOrderSubmit.ts`
**Purpose**: Order submission logic  
**Key Functions**:
- `useOrderSubmit()` - Main hook
- Returns: loading, submitOrder, prepareOrderItems

**Usage**:
```tsx
const { submitOrder, loading } = useOrderSubmit(cart, tableNo, deliveryType);
await submitOrder(taxAmount);
```

---

#### 10. `index.ts` (Barrel Export)
**Purpose**: Export all hooks for easy importing  
**Usage**:
```tsx
// Instead of:
import { useMenuData } from '../hooks/useMenuData';
import { useMenuCart } from '../hooks/useMenuCart';

// You can do:
import { useMenuData, useMenuCart } from '../hooks';
```

---

### UI Components (8 files in `src/components/MenuScreen/`)

#### 1. `CategoryTabs.tsx` (68 lines)
**Purpose**: Horizontal scrollable category tabs  
**Props**:
- `categories: MenuCategory[]`
- `activeCategory: number`
- `onCategorySelect: Function`
- `colors: any`

**Usage**:
```tsx
<CategoryTabs
  categories={categories}
  activeCategory={0}
  onCategorySelect={(index) => setActiveCategory(index)}
  colors={colors}
/>
```

---

#### 2. `MenuItemCard.tsx` (82 lines)
**Purpose**: Individual menu item display card  
**Props**: item, itemIndex, onAddToCart, colors  
**Features**: Image, price, add button

---

#### 3. `MenuItemsGrid.tsx` (72 lines)
**Purpose**: Grid layout for menu items  
**Props**: categories, activeCategory, onAddToCart, colors  
**Features**: Empty states, responsive grid

---

#### 4. `CartItemRow.tsx` (142 lines)
**Purpose**: Individual cart item in drawer  
**Props**: item, editing states, handlers, colors  
**Features**: Quantity controls, notes, attribute display

---

#### 5. `CartFAB.tsx` (56 lines)
**Purpose**: Floating action button for cart  
**Props**: cartQuantity, onPress, scaleAnim, badgeScaleAnim, colors  
**Features**: Badge with item count, animated scale

---

#### 6. `CartSummary.tsx` (114 lines)
**Purpose**: Cart totals and checkout button  
**Props**: cart, cartQuantity, handlers, colors  
**Features**: Pricing breakdown, checkout action

---

#### 7. `CartDrawer.tsx` (140 lines)
**Purpose**: Modal drawer for cart display  
**Props**: visible, cart, animations, handlers, colors  
**Features**: Smooth animations, item list, summary

---

#### 8. `index.ts` (Barrel Export)
**Purpose**: Export all components  
**Usage**:
```tsx
import {
  CategoryTabs,
  MenuItemCard,
  CartDrawer,
  // ...
} from '../components/MenuScreen';
```

---

### Refactored Screens (3 files in `src/screens/`)

#### 1. `MenuScreen-refactored.tsx` (~300 lines)
**Purpose**: Main menu screen with cart  
**Uses Hooks**: useMenuData, useMenuCart, useCartDrawerAnimation, useCartNotes, useCartFeedback  
**Uses Components**: CategoryTabs, MenuItemsGrid, CartFAB, CartDrawer  
**Key Exports**: Default export (MenuScreen component)

---

#### 2. `DashboardScreen-refactored.tsx` (~400 lines)
**Purpose**: Order dashboard with table grid  
**Uses Hooks**: useOrdersData, useSettings, useTableStatistics  
**Key Functions**: Tab navigation, table grid, order display

---

#### 3. `CheckoutScreen-refactored.tsx` (~300 lines)
**Purpose**: Order checkout and summary  
**Uses Hooks**: useOrderSubmit  
**Key Features**: Order review, pricing, place order

---

### Documentation (4 files in root)

#### 1. `REFACTORING_GUIDE.md`
Comprehensive guide with:
- Complete hook reference
- Component documentation
- Common patterns
- Best practices
- Troubleshooting

---

#### 2. `REFACTORING_SUMMARY.md`
Project summary with:
- What was completed
- Line count statistics
- List of all new files
- Benefits and improvements
- Implementation checklist

---

#### 3. `MIGRATION_GUIDE.md`
Step-by-step migration with:
- Quick reference table
- Before/after code
- Testing checklist
- Common issues
- Integration examples

---

#### 4. `REFACTORING_COMPLETE.md`
Complete overview with:
- Impact by numbers
- New architecture diagram
- File structure
- Next steps
- Key insights

---

## 📍 Where to Find What

### If you need to...

**...understand a specific hook:**
1. Look at `src/hooks/[hookName].ts`
2. Read JSDoc comments
3. Check REFACTORING_GUIDE.md

**...understand a specific component:**
1. Look at `src/components/MenuScreen/[ComponentName].tsx`
2. Read the interface props
3. Check usage examples

**...implement something new:**
1. Check REFACTORING_GUIDE.md for patterns
2. Look at similar hook/component
3. Follow the same structure

**...debug an issue:**
1. Check hook dependencies
2. Verify state is passed correctly
3. Use React DevTools
4. Check console logs

**...migrate to new screens:**
1. Start with MIGRATION_GUIDE.md
2. Update imports
3. Run tests
4. Verify functionality

---

## 🔍 Quick Lookup

### Hook File → What It Does

| File | What | Line Count |
|------|------|-----------|
| useMenuData.ts | Menu loading | ~150 |
| useMenuCart.ts | Cart ops | ~100 |
| useCartDrawerAnimation.ts | Animations | ~80 |
| useCartNotes.ts | Notes form | ~130 |
| useCartFeedback.ts | Haptics | ~60 |
| useOrdersData.ts | Order fetch | ~90 |
| useSettings.ts | Settings | ~50 |
| useTableStatistics.ts | Table stats | ~65 |
| useOrderSubmit.ts | Order submit | ~200 |

### Component File → What It Renders

| File | What | Line Count |
|------|------|-----------|
| CategoryTabs.tsx | Tab nav | ~70 |
| MenuItemCard.tsx | Item card | ~80 |
| MenuItemsGrid.tsx | Grid layout | ~70 |
| CartItemRow.tsx | Cart row | ~140 |
| CartFAB.tsx | FAB button | ~60 |
| CartSummary.tsx | Totals | ~115 |
| CartDrawer.tsx | Drawer | ~140 |

### Screen File → What It Orchestrates

| File | Dependencies | Renders |
|------|--------------|---------|
| MenuScreen-refactored.tsx | 5 hooks, 7 components | Menu + Cart |
| DashboardScreen-refactored.tsx | 3 hooks | Orders + Tables |
| CheckoutScreen-refactored.tsx | 1 hook | Order review |

---

## 🚀 Getting Started

1. **First time?**
   - Start with MIGRATION_GUIDE.md
   - Then REFACTORING_GUIDE.md

2. **Need quick reference?**
   - Look at this file
   - Then check specific hook/component

3. **Implementing feature?**
   - Find similar hook/component
   - Copy structure
   - Adapt for your needs

4. **Debugging?**
   - Check hook dependencies
   - Verify state flow
   - Use React DevTools
   - Check console logs

---

## 💾 File Locations

```
WaiterApp/
├── src/
│   ├── hooks/                ← All 9 hooks here
│   ├── components/MenuScreen/ ← All 7 components here
│   ├── screens/              ← 3 refactored screens + originals
│   └── ...
├── REFACTORING_GUIDE.md      ← Comprehensive reference
├── REFACTORING_SUMMARY.md    ← What was done
├── MIGRATION_GUIDE.md        ← How to migrate
├── REFACTORING_COMPLETE.md   ← Overview
└── QUICK_REFERENCE.md        ← This file!
```

---

**Happy coding!** 🎉
