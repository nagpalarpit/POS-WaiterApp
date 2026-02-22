import type {
  AttributeValue,
  Cart,
  CartDiscount,
  CartDiscountType,
  CartItem,
} from '../services/cartService';

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
};

const roundToTwo = (value: number): number => Number(value.toFixed(2));

export const getCartItemQuantity = (item: CartItem): number => {
  const quantity = toNumber(item.quantity, 1);
  return quantity > 0 ? quantity : 1;
};

export const getAttributeValueName = (attributeValue: AttributeValue): string => {
  return attributeValue.attributeValueName || attributeValue.name || '';
};

export const getAttributeValueQuantity = (
  attributeValue: AttributeValue
): number => {
  const quantity = toNumber(
    attributeValue.attributeValueQuantity ?? attributeValue.quantity,
    1
  );
  return quantity > 0 ? quantity : 1;
};

export const getAttributeValuePrice = (attributeValue: AttributeValue): number => {
  return toNumber(
    attributeValue.attributeValuePrice ?? attributeValue.price ?? attributeValue.unitPrice,
    0
  );
};

export const getItemUnitTotal = (item: CartItem): number => {
  let total = toNumber(item.itemPrice, 0);
  total += toNumber(item.variantPrice, 0);
  total += toNumber(item.attributePrice, 0);

  if (Array.isArray(item.attributeValues) && item.attributeValues.length > 0) {
    item.attributeValues.forEach((attributeValue) => {
      total +=
        getAttributeValuePrice(attributeValue) *
        getAttributeValueQuantity(attributeValue);
    });
  }

  return total;
};

export const getItemLineTotal = (item: CartItem): number => {
  return getItemUnitTotal(item) * getCartItemQuantity(item);
};

export const getCartSubtotal = (cart: Cart): number => {
  return (cart.items || []).reduce((sum, item) => sum + getItemLineTotal(item), 0);
};

export const getItemOptionsSummary = (item: CartItem): string => {
  const parts: string[] = [];
  const variantName = item.variantName?.trim();

  if (variantName && variantName !== item.itemName) {
    parts.push(variantName);
  }

  const selectedValueNames = (item.attributeValues || [])
    .map((attributeValue) => getAttributeValueName(attributeValue))
    .filter(Boolean);

  if (selectedValueNames.length > 0) {
    const attributeName = item.attributeName?.trim();
    parts.push(
      attributeName
        ? `${attributeName}: ${selectedValueNames.join(', ')}`
        : selectedValueNames.join(', ')
    );
  }

  return parts.join(' · ');
};

export const getDiscountLabel = (discount: CartDiscount): string => {
  if (discount.discountType === 'PERCENTAGE') {
    return `${discount.discountValue}%`;
  }
  return `₹${roundToTwo(discount.discountValue).toFixed(2)}`;
};

export const getDiscountAmount = (
  subtotal: number,
  discount?: CartDiscount | null
): number => {
  if (!discount) return 0;

  const subTotalValue = Math.max(toNumber(subtotal, 0), 0);
  const discountValue = Math.max(toNumber(discount.discountValue, 0), 0);
  if (discountValue <= 0 || subTotalValue <= 0) return 0;

  if (discount.discountType === 'PERCENTAGE') {
    return roundToTwo(Math.min((subTotalValue * discountValue) / 100, subTotalValue));
  }

  return roundToTwo(Math.min(discountValue, subTotalValue));
};

export const getDiscountTypeLabel = (discountType: CartDiscountType): string => {
  return discountType === 'PERCENTAGE' ? 'Percentage' : 'Flat';
};
