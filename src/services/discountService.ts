import AsyncStorage from '@react-native-async-storage/async-storage';
import localDatabase from './localDatabase';
import serverConnection from './serverConnection';

export type DiscountType = 'FLAT' | 'PERCENTAGE' | 'CUSTOM';

export type DiscountOption = {
  id?: number | string;
  _id?: string;
  discountName?: string;
  name?: string;
  discountType: DiscountType;
  discountValue: number;
  startDate?: string;
  endDate?: string;
  isDeleted?: boolean;
};

const DISCOUNT_CACHE_PREFIX = 'LOCAL_DISCOUNTS_';

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

const normalizeDiscountType = (discountType: any): DiscountType => {
  if (discountType === 1 || discountType === '1' || discountType === 'PERCENTAGE') {
    return 'PERCENTAGE';
  }
  if (discountType === 3 || discountType === '3' || discountType === 'CUSTOM') {
    return 'CUSTOM';
  }
  return 'FLAT';
};

const normalizeDiscount = (raw: any): DiscountOption | null => {
  if (!raw) return null;
  const discountValue = toNumber(raw.discountValue ?? raw.value, 0);
  if (!discountValue && discountValue !== 0) return null;

  return {
    id: raw.id ?? raw.discountId ?? raw._id,
    _id: raw._id,
    discountName: raw.discountName ?? raw.name ?? raw.title ?? '',
    discountType: normalizeDiscountType(raw.discountType),
    discountValue,
    startDate: raw.startDate,
    endDate: raw.endDate,
    isDeleted: raw.isDeleted,
  };
};

const isDiscountActive = (discount: DiscountOption): boolean => {
  if (discount.isDeleted) return false;
  const startDate = discount.startDate ? new Date(discount.startDate) : null;
  const endDate = discount.endDate ? new Date(discount.endDate) : null;
  const now = new Date();

  if (startDate && now < startDate) return false;
  if (endDate && now > endDate) return false;
  return true;
};

const sortDiscounts = (discounts: DiscountOption[]): DiscountOption[] => {
  return discounts.sort((a, b) => {
    if (a.discountValue === 0 && b.discountValue === 0) return 0;
    if (a.discountValue === 0) return 1;
    if (b.discountValue === 0) return -1;
    return a.discountValue - b.discountValue;
  });
};

const getDiscountIdentity = (discount: DiscountOption): string => {
  const id = discount.id ?? discount._id;
  if (id !== undefined && id !== null && String(id).trim() !== '') {
    return `id:${id}`;
  }
  const name = (discount.discountName || discount.name || '').trim().toLowerCase();
  return `meta:${name}|${discount.discountType}|${discount.discountValue}`;
};

const dedupeDiscounts = (discounts: DiscountOption[]): DiscountOption[] => {
  const byKey = new Map<string, DiscountOption>();
  discounts.forEach((discount) => {
    const key = getDiscountIdentity(discount);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, discount);
      return;
    }
    const existingName = (existing.discountName || existing.name || '').trim();
    const nextName = (discount.discountName || discount.name || '').trim();
    if (!existingName && nextName) {
      byKey.set(key, discount);
    }
  });
  return Array.from(byKey.values());
};

const getCacheKey = (companyId: number) => `${DISCOUNT_CACHE_PREFIX}${companyId}`;

export const loadCachedDiscounts = async (companyId: number): Promise<DiscountOption[]> => {
  try {
    if (!companyId) return [];
    const cached = await AsyncStorage.getItem(getCacheKey(companyId));
    if (!cached) return [];
    const parsed = JSON.parse(cached);
    const list = Array.isArray(parsed) ? parsed : [];
    return dedupeDiscounts(list).filter(isDiscountActive);
  } catch (error) {
    console.error('DiscountService: Failed to read cache:', error);
    return [];
  }
};

export const fetchDiscountsForCompany = async (companyId: number): Promise<DiscountOption[]> => {
  try {
    if (!companyId) return [];
    if (!serverConnection.isConnected()) {
      return await loadCachedDiscounts(companyId);
    }

    const rows = await localDatabase.select('discount', {
      where: {
        companyId,
        isDeleted: false,
      },
    });

    const rawDiscounts: any[] = [];
    (rows || []).forEach((row: any) => {
      if (Array.isArray(row?.discountDetails)) {
        rawDiscounts.push(...row.discountDetails);
      } else if (row?.discountDetails) {
        rawDiscounts.push(row.discountDetails);
      } else {
        rawDiscounts.push(row);
      }
    });

    const normalized = rawDiscounts
      .map(normalizeDiscount)
      .filter((discount): discount is DiscountOption => Boolean(discount))
      .filter(isDiscountActive);

    const unique = dedupeDiscounts(normalized);
    const sorted = sortDiscounts(unique);
    await AsyncStorage.setItem(getCacheKey(companyId), JSON.stringify(sorted));
    return sorted;
  } catch (error) {
    console.error('DiscountService: Failed to fetch discounts:', error);
    return await loadCachedDiscounts(companyId);
  }
};
