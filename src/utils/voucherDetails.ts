import type { CartItem } from '../services/cartService';
import { formatCurrency } from './currency';

export type VoucherDetailLine = {
  key: string;
  text: string;
  indent: number;
  isSection?: boolean;
  isItem?: boolean;
};

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

const getVoucherItemName = (item: any): string =>
  String(item?.name ?? item?.itemName ?? '').trim();

const getVoucherItemLabel = (item: any): string => {
  const name = getVoucherItemName(item);
  const attributeSize = String(item?.attributeSize ?? '').trim();
  return [name, attributeSize].filter(Boolean).join(' ');
};

const getVoucherVariantLabel = (variant: any): string => {
  const name = String(variant?.name ?? variant?.menuItemVariant?.name ?? '').trim();
  const price = toNumber(
    variant?.price ?? variant?.unitPrice ?? variant?.menuItemVariant?.price,
    0,
  );

  if (!name && price <= 0) return '';
  if (!name) return `Variant (+${formatCurrency(price)})`;
  if (price <= 0) return name;
  return `${name} (+${formatCurrency(price)})`;
};

const getVoucherAttributeValues = (attribute: any): any[] => {
  if (Array.isArray(attribute?.menuItemVariantAttributeValues)) {
    return attribute.menuItemVariantAttributeValues;
  }

  if (Array.isArray(attribute?.attributeValues)) {
    return attribute.attributeValues;
  }

  return [];
};

export const getVoucherDetailLines = (
  item: Pick<CartItem, 'discountItems'>,
): VoucherDetailLine[] => {
  const discountItems = Array.isArray(item.discountItems) ? item.discountItems : [];
  if (!discountItems.length) return [];

  const lines: VoucherDetailLine[] = [];

  const pushVoucherItems = (
    voucherItems: any[],
    keyPrefix: string,
    showSectionTitle = false,
    sectionTitle = 'Customer Gets',
  ) => {
    if (!voucherItems.length) return;

    if (showSectionTitle) {
      lines.push({
        key: `${keyPrefix}-section`,
        text: sectionTitle,
        indent: 0,
        isSection: true,
      });
    }

    voucherItems.forEach((voucherItem: any, itemIndex: number) => {
      const itemLabel = getVoucherItemLabel(voucherItem);
      if (itemLabel) {
        lines.push({
          key: `${keyPrefix}-item-${itemIndex}`,
          text: itemLabel,
          indent: showSectionTitle ? 8 : 0,
          isItem: true,
        });
      }

      const variants = Array.isArray(voucherItem?.menuItemVariants)
        ? voucherItem.menuItemVariants
        : [];

      variants.forEach((variant: any, variantIndex: number) => {
        const variantLabel = getVoucherVariantLabel(variant);
        if (variantLabel) {
          lines.push({
            key: `${keyPrefix}-item-${itemIndex}-variant-${variantIndex}`,
            text: variantLabel,
            indent: showSectionTitle ? 20 : 12,
          });
        }

        const variantAttributes = Array.isArray(variant?.menuItemVariantAttributes)
          ? variant.menuItemVariantAttributes
          : [];

        variantAttributes.forEach((attribute: any, attributeIndex: number) => {
          getVoucherAttributeValues(attribute).forEach((value: any, valueIndex: number) => {
            const valueName = String(
              value?.name ??
                value?.attributeValueName ??
                value?.menuItemVariantAttributeValue?.name ??
                '',
            ).trim();
            const valuePrice = toNumber(
              value?.price ??
                value?.unitPrice ??
                value?.attributeValuePrice ??
                value?.menuItemVariantAttributeValue?.price,
              0,
            );

            if (!valueName) return;

            lines.push({
              key: `${keyPrefix}-item-${itemIndex}-variant-${variantIndex}-attribute-${attributeIndex}-value-${valueIndex}`,
              text:
                valuePrice > 0
                  ? `1 x @${valueName} (+${formatCurrency(valuePrice)})`
                  : `1 x @${valueName}`,
              indent: showSectionTitle ? 32 : 24,
            });
          });
        });
      });
    });
  };

  discountItems.forEach((discountItem: any, discountIndex: number) => {
    const customerBuys = Array.isArray(discountItem?.customerBuys)
      ? discountItem.customerBuys
      : [];
    const customerGets = Array.isArray(discountItem?.customerGets)
      ? discountItem.customerGets
      : [];

    pushVoucherItems(customerBuys, `discount-${discountIndex}-buy`);
    pushVoucherItems(
      customerGets,
      `discount-${discountIndex}-get`,
      customerGets.length > 0,
    );
  });

  return lines;
};
