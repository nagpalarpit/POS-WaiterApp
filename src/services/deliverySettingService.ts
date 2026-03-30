import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import localApi from './localApi';
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

export type DeliverySettingCreatePayload = {
  companyId: number;
  zipCode: string;
  city: string;
  minimumOrderValue: number;
  deliveryCharge: number;
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

const isNetworkError = (error: any): boolean => {
  const code = `${error?.code || ''}`.toUpperCase();
  const status = error?.response?.status;
  const message = `${error?.message || ''}`.toLowerCase();

  return (
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'ERR_NETWORK' ||
    status === 404 ||
    status === 408 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes('network') ||
    message.includes('timeout')
  );
};

const extractResponseData = (response: any) =>
  response?.data?.data ??
  response?.data?.dataValues ??
  response?.data ??
  response;

class DeliverySettingService {
  private async getCompanyId(): Promise<number | null> {
    const userDataStr = await AsyncStorage.getItem(STORAGE_KEYS.authUser);
    const userData = userDataStr ? JSON.parse(userDataStr) : null;
    const companyId = userData?.companyId ?? userData?.company?.id ?? null;
    return companyId != null ? Number(companyId) : null;
  }

  private async request<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (!isNetworkError(error)) {
        throw error;
      }
      return fallback();
    }
  }

  private async syncLocalDeliverySetting(setting: DeliverySettingRecord): Promise<void> {
    const companyId = await this.getCompanyId();
    if (!companyId) {
      return;
    }

    const localSetting = {
      id: setting.id,
      zipCode: setting.pincode,
      city: setting.city,
      minimumOrderValue: setting.minimumOrderValue,
      deliveryCharge: setting.deliveryCharge,
    };

    try {
      const localRes = await localDatabase.select('deliverySetting', {
        where: { companyId },
      });
      const existingRecord = Array.isArray(localRes) ? localRes[0] : localRes;

      if (existingRecord?.deliverySettingDetails) {
        const existingDetails = Array.isArray(existingRecord.deliverySettingDetails)
          ? [...existingRecord.deliverySettingDetails]
          : [];
        const existingIndex = existingDetails.findIndex(
          (item: any) => `${item?.id ?? ''}` === `${localSetting.id ?? ''}`,
        );

        if (existingIndex >= 0) {
          existingDetails[existingIndex] = localSetting;
        } else {
          existingDetails.push(localSetting);
        }

        await localDatabase.update(
          'deliverySetting',
          {
            ...existingRecord,
            deliverySettingDetails: existingDetails,
          },
          { where: { companyId } },
        );
        return;
      }

      await localDatabase.insert('deliverySetting', {
        companyId,
        deliverySettingDetails: [localSetting],
      });
    } catch (error) {
      console.warn('deliverySettingService: Local sync failed:', error);
    }
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

  async checkCityExists(city: string, deliverySettingId?: number | string | null): Promise<boolean> {
    const companyId = await this.getCompanyId();
    if (!companyId || !city.trim()) {
      return false;
    }

    const payload = {
      query: {
        companyId,
        city: city.trim(),
      },
    };

    try {
      const response = await this.request(
        () => localApi.post(API_ENDPOINTS.deliverySetting.LIST, payload),
        () => api.post(API_ENDPOINTS.deliverySetting.LIST, payload),
      );
      const rawData = extractResponseData(response);
      const list = Array.isArray(rawData) ? rawData : [];

      if (!list.length) {
        return false;
      }

      if (deliverySettingId == null) {
        return true;
      }

      return list.some((item: any) => `${item?.id ?? ''}` !== `${deliverySettingId}`);
    } catch (error) {
      console.warn('deliverySettingService: city check failed:', error);
      return false;
    }
  }

  async createDeliverySetting(payload: DeliverySettingCreatePayload): Promise<DeliverySettingRecord> {
    const response = await this.request(
      () => localApi.post(API_ENDPOINTS.deliverySetting.CREATE, payload),
      () => api.post(API_ENDPOINTS.deliverySetting.CREATE, payload),
    );

    const normalized = normalizeDeliverySetting(extractResponseData(response));
    if (!normalized) {
      throw new Error('Unable to create delivery setting');
    }

    await this.syncLocalDeliverySetting(normalized);
    return normalized;
  }
}

export default new DeliverySettingService();
