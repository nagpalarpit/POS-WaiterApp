import api from './api';
import { API_ENDPOINTS } from '../config/apiEndpoints';

class TscService {
  async startTransaction(payload: any) {
    return api.post(API_ENDPOINTS.tsc.START_TRANSACTION, payload);
  }

  async updateTransaction(payload: any) {
    return api.post(API_ENDPOINTS.tsc.UPDATE_TRANSACTION, payload);
  }
}

export default new TscService();
