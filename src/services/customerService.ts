import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import localApi from './localApi';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { Customer, CustomerListParams, CustomerUpsertPayload } from '../types/customer';
import { normalizeCustomer } from '../utils/customerData';

const CUSTOMER_ENDPOINTS = {
  LIST: 'api/v1/admin/user/list',
  CREATE: 'api/v1/admin/user/guest-register',
  UPDATE: 'api/v1/admin/user/update',
};

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

const hydrateCustomerResponse = (
  response: any,
  fallback: CustomerUpsertPayload & { id?: number | string | null },
): Customer | null => {
  const normalizedResponse = normalizeCustomer(extractResponseData(response));
  const normalizedFallback = normalizeCustomer(fallback);

  if (!normalizedResponse && !normalizedFallback) {
    return null;
  }

  if (!normalizedResponse) {
    return normalizedFallback;
  }

  if (!normalizedFallback) {
    return normalizedResponse;
  }

  return {
    ...normalizedFallback,
    ...normalizedResponse,
    addresses:
      normalizedResponse.addresses.length > 0
        ? normalizedResponse.addresses
        : normalizedFallback.addresses,
    customerAddressId:
      normalizedResponse.customerAddressId ??
      normalizedFallback.customerAddressId ??
      normalizedResponse.addresses[0]?.id ??
      normalizedFallback.addresses[0]?.id ??
      null,
  };
};

class CustomerService {
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

  async listCustomers(params: CustomerListParams = {}): Promise<Customer[]> {
    const companyId = await this.getCompanyId();
    const payload: any = {
      query: {
        roleId: 4,
        ...(params.isDebitor === true ? { isDebitor: true } : {}),
      },
      companyId: companyId ?? undefined,
      options: {
        paginate: params.limit ?? 10,
        page: params.page ?? 1,
        sort: { id: -1 },
      },
      isCountOnly: false,
    };

    if (params.searchStr?.trim()) {
      payload.searchStr = params.searchStr.trim();
    }

    const response = await api.post(CUSTOMER_ENDPOINTS.LIST, payload);

    const rawData = extractResponseData(response);
    const list = Array.isArray(rawData) ? rawData : [];

    return list
      .map((item) => normalizeCustomer(item))
      .filter((item): item is Customer => Boolean(item));
  }

  async createCustomer(payload: CustomerUpsertPayload): Promise<Customer> {
    const response = await this.request(
      () => localApi.post(CUSTOMER_ENDPOINTS.CREATE, payload),
      () => api.post(CUSTOMER_ENDPOINTS.CREATE, payload),
    );

    const normalized = hydrateCustomerResponse(response, payload);

    if (!normalized) {
      throw new Error('Unable to create customer');
    }

    return normalized;
  }

  async updateCustomer(
    customerId: number | string,
    payload: CustomerUpsertPayload,
  ): Promise<Customer> {
    const endpoint = `${CUSTOMER_ENDPOINTS.UPDATE}/${customerId}`;
    const response = await this.request(
      () => localApi.put(endpoint, payload),
      () => api.put(endpoint, payload),
    );

    const normalized = hydrateCustomerResponse(response, {
      id: customerId,
      ...payload,
    });

    if (!normalized) {
      throw new Error('Unable to update customer');
    }

    return normalized;
  }
}

export default new CustomerService();
