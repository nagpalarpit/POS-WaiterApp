import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storageKeys';

class POSIdService {
  private posId: string | null = null;

  /**
   * Get current POS ID from memory
   */
  getPosId(): string | null {
    return this.posId;
  }

  /**
   * Set and persist POS ID (received from server)
   */
  async setPosId(id: string): Promise<void> {
    this.posId = id;
    await AsyncStorage.setItem(STORAGE_KEYS.posId, id);
  }

  /**
   * Load POS ID from storage
   */
  async loadPosId(): Promise<string | null> {
    try {
      const id = await AsyncStorage.getItem(STORAGE_KEYS.posId);
      if (id) {
        this.posId = id;
      }
      return id;
    } catch (error) {
      console.log('Error loading POS ID:', error);
      return null;
    }
  }

  /**
   * Clear POS ID
   */
  async clearPosId(): Promise<void> {
    this.posId = null;
    await AsyncStorage.removeItem(STORAGE_KEYS.posId);
  }
}

export default new POSIdService();
