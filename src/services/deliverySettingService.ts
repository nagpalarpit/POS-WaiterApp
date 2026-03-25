import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import localDatabase from './localDatabase';
import { API_ENDPOINTS } from '../config/apiEndpoints';
import { STORAGE_KEYS } from '../constants/storageKeys';

export type DeliverySettingRecord = {
  id: number | string | null;
  pincode: string;
  city: string;
  minimumOrderValue: number | null;
  deliveryCharge: number | null;
};

const toTrimmedString = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const toNumber = (value: unknown, fallback: number | null = null): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
};

const normalizeDeliverySetting = (item: any): DeliverySettingRecord | null => {
  const pincode = toTrimmedString(
    item?.pincode ?? item?.pinCode ?? item?.zipCode ?? item?.deliveryAreaPinCode,
  );
  const city = toTrimmedString(
    item?.city ?? item?.name ?? item?.deliveryAreaName,
  );

  if (!pincode && !city) {
    return null;
  }

  return {
    id: item?.id ?? item?._id ?? null,
    pincode,
    city,
    minimumOrderValue: toNumber(item?.minimumOrderValue),
    deliveryCharge: toNumber(item?.deliveryCharge),
  };
};

const normalizeDeliverySettingList = (items: any[]): DeliverySettingRecord[] =>
  items
    .map(normalizeDeliverySetting)
    .filter((item): item is DeliverySettingRecord => Boolean(item));

class DeliverySettingService {
  private async getCompanyId(): Promise<number | null> {
    const userDataStr = await AsyncStorage.getItem(STORAGE_KEYS.authUser);
    const userData = userDataStr ? JSON.parse(userDataStr) : null;
    const companyId = userData?.companyId ?? userData?.company?.id ?? null;
    return companyId != null ? Number(companyId) : null;
  }

  async listDeliverySettings(): Promise<DeliverySettingRecord[]> {
    const companyId = await this.getCompanyId();
    if (!companyId) {
      return [];
    }

    try {
      const localRes = await localDatabase.select('deliverySetting', {
        where: { companyId },
      });
      const topLevelRecord = Array.isArray(localRes) ? localRes[0] : localRes;
      const topLevelList = Array.isArray(topLevelRecord?.deliverySettingDetails)
        ? topLevelRecord.deliverySettingDetails
        : Array.isArray(localRes)
          ? localRes
          : [];
      const normalizedLocal = normalizeDeliverySettingList(topLevelList);
      if (normalizedLocal.length > 0) {
        return normalizedLocal;
      }
    } catch (error) {
      console.warn('deliverySettingService: Local deliverySetting load failed:', error);
    }

    try {
      const cloudRes = await api.post(API_ENDPOINTS.settings.GET_ALL, {
        companyId,
      });
      const raw = cloudRes?.data?.data ?? cloudRes?.data ?? cloudRes;
      const record = Array.isArray(raw) ? raw[0] : raw;
      const settingsList = Array.isArray(record?.deliverySettingDetails)
        ? record.deliverySettingDetails
        : Array.isArray(record?.settingInfo?.deliverySettingDetails)
          ? record.settingInfo.deliverySettingDetails
          : [];
      return normalizeDeliverySettingList(settingsList);
    } catch (error) {
      console.warn('deliverySettingService: Cloud deliverySetting load failed:', error);
      return [];
    }
  }
}

export default new DeliverySettingService();
