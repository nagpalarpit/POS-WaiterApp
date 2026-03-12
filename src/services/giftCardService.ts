import api from './api';
import { API_ENDPOINTS } from '../config/apiEndpoints';

export type GiftCardResponse = {
  status?: string | number;
  data?: any[];
  message?: string;
};

class GiftCardService {
  async getCoupons(params: { companyId: number; couponCode: string }): Promise<GiftCardResponse> {
    const payload = {
      query: {
        companyId: params.companyId,
        couponCode: params.couponCode,
        isDeleted: false,
      },
    };

    const response = await api.post(API_ENDPOINTS.giftCard.GET_ALL, payload);
    return response?.data ?? {};
  }
}

export default new GiftCardService();
