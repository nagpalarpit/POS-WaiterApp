export const DEFAULT_CURRENCY = 'EUR';
export const DEFAULT_LOCALE = 'de-DE';

export const formatCurrency = (
  value: number,
  currency: string = DEFAULT_CURRENCY,
  locale: string = DEFAULT_LOCALE
): string => {
  const safeValue = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeValue);
  } catch (error) {
    const rounded = safeValue.toFixed(2);
    return currency === 'EUR' ? `€${rounded}` : `${rounded} ${currency}`;
  }
};

export const getCurrencySymbol = (
  currency: string = DEFAULT_CURRENCY,
  locale: string = DEFAULT_LOCALE
): string => {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    const symbol = parts.find((part) => part.type === 'currency')?.value;
    return symbol || (currency === 'EUR' ? '€' : currency);
  } catch (error) {
    return currency === 'EUR' ? '€' : currency;
  }
};
