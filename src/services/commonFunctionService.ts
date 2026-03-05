import api from './api';
import localDatabase from './localDatabase';
import { API_ENDPOINTS } from '../config/apiEndpoints';

type SettingsRecord = {
  id?: number | string;
  _id?: number | string;
  companyId?: number;
  settingInfo?: any;
  lastInvoiceNumber?: string | number;
  [key: string]: any;
};

class CommonFunctionService {
  private normalizeSettingsRecord(payload: any): {
    record: SettingsRecord | null;
    settingInfo: any | null;
  } {
    const data = payload?.data ?? payload;
    const record = Array.isArray(data) ? data[0] : data;
    if (!record) return { record: null, settingInfo: null };
    const settingInfo = record.settingInfo ?? record;
    return { record, settingInfo };
  }

  private async checkInvoice(companyId: number, invoiceNumber: string): Promise<boolean> {
    try {
      const res = await localDatabase.select('order', {
        where: {
          companyId,
          'orderDetails.invoiceNumber': invoiceNumber,
        },
      });
      return Array.isArray(res) && res.length > 0;
    } catch (error) {
      console.error('CommonFunctionService: Error checking invoice:', error);
      return false;
    }
  }

  private async updateCompanySettings(
    companyId: number,
    invoiceNumber: string,
    settingInfo?: any,
    record?: SettingsRecord | null
  ): Promise<void> {
    try {
      await localDatabase.update(
        'settings',
        {
          'settingInfo.lastInvoiceNumber': invoiceNumber,
          lastInvoiceNumber: invoiceNumber,
          updateAll: true,
        },
        { where: { companyId } }
      );
    } catch (error) {
      console.error('CommonFunctionService: Error updating local settings:', error);
    }

    const settingId =
      settingInfo?.id ??
      record?.id ??
      record?._id ??
      settingInfo?._id;

    if (!settingId) return;

    try {
      await api.put(`${API_ENDPOINTS.settings.UPDATE}/${settingId}`, {
        lastInvoiceNumber: invoiceNumber,
      });
    } catch (error) {
      console.error('CommonFunctionService: Error updating server settings:', error);
    }
  }

  async generateInvoice(companyId?: number | string): Promise<string> {
    const comId = Number(companyId || 0);
    if (!comId) {
      console.warn('CommonFunctionService: companyId missing for invoice generation');
      return '1';
    }

    let settingInfo: any = null;
    let record: SettingsRecord | null = null;

    try {
      const localRes = await localDatabase.select('settings', {
        where: { companyId: comId },
      });
      const normalized = this.normalizeSettingsRecord(localRes);
      record = normalized.record;
      settingInfo = normalized.settingInfo;
    } catch (error) {
      console.error('CommonFunctionService: Error loading local settings:', error);
    }

    if (!settingInfo?.lastInvoiceNumber) {
      try {
        const cloudRes = await api.post(API_ENDPOINTS.settings.GET_ALL, {
          companyId: comId,
        });
        const normalized = this.normalizeSettingsRecord(cloudRes?.data ?? cloudRes);
        record = normalized.record || record;
        settingInfo = normalized.settingInfo || settingInfo;
      } catch (error) {
        console.error('CommonFunctionService: Error loading server settings:', error);
      }
    }

    let newInvoiceNumber = 1;
    const lastInvoice = settingInfo?.lastInvoiceNumber ?? record?.lastInvoiceNumber;
    if (lastInvoice != null && lastInvoice !== '') {
      const parsed = Number(lastInvoice);
      newInvoiceNumber = Number.isFinite(parsed) ? parsed + 1 : 1;
    }

    let exists = true;
    while (exists) {
      exists = await this.checkInvoice(comId, String(newInvoiceNumber));
      if (exists) newInvoiceNumber += 1;
    }

    await this.updateCompanySettings(
      comId,
      String(newInvoiceNumber),
      settingInfo,
      record
    );

    return String(newInvoiceNumber);
  }
}

export default new CommonFunctionService();
