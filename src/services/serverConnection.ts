import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_ENDPOINTS } from '../config/apiEndpoints';
import posIdService from './posIdService';

const LOCAL_BASE_URL = 'LOCAL_BASE_URL';
const CONNECTION_STATUS_KEY = 'LOCAL_SERVER_CONNECTED';

export interface ServerConnectionStatus {
  isConnected: boolean;
  baseUrl: string | null;
  lastChecked: number;
}

class ServerConnectionService {
  private connectionStatus: ServerConnectionStatus = {
    isConnected: false,
    baseUrl: null,
    lastChecked: 0,
  };

  /**
   * Check if local server is reachable
   */
  async checkLocalServerConnection(baseUrl: string): Promise<boolean> {
    try {
      const testUrl = `${baseUrl}${API_ENDPOINTS.health}`;
      const response = await axios.get(testUrl, { timeout: 3000 });
      return response.status === 200;
    } catch (error) {
      console.log('Local server health check failed:', error);
      return false;
    }
  }

  /**
   * Initialize server connection from storage
   */
  async initializeConnection(): Promise<ServerConnectionStatus> {
    try {
      const baseUrl = await AsyncStorage.getItem(LOCAL_BASE_URL);
      
      if (baseUrl) {
        const isConnected = await this.checkLocalServerConnection(baseUrl);
        this.connectionStatus = {
          isConnected,
          baseUrl: isConnected ? baseUrl : null,
          lastChecked: Date.now(),
        };

        await AsyncStorage.setItem(
          CONNECTION_STATUS_KEY,
          JSON.stringify(isConnected)
        );
      }

      return this.connectionStatus;
    } catch (error) {
      console.log('Error initializing connection:', error);
      return this.connectionStatus;
    }
  }

  /**
   * Set server URL and test connection
   */
  async setServerUrl(baseUrl: string): Promise<boolean> {
    try {
      const isConnected = await this.checkLocalServerConnection(baseUrl);

      if (isConnected) {
        await AsyncStorage.setItem(LOCAL_BASE_URL, baseUrl);
        this.connectionStatus = {
          isConnected: true,
          baseUrl,
          lastChecked: Date.now(),
        };
        await AsyncStorage.setItem(CONNECTION_STATUS_KEY, 'true');
        return true;
      } else {
        this.connectionStatus.isConnected = false;
        await AsyncStorage.setItem(CONNECTION_STATUS_KEY, 'false');
        return false;
      }
    } catch (error) {
      console.log('Error setting server URL:', error);
      this.connectionStatus.isConnected = false;
      await AsyncStorage.setItem(CONNECTION_STATUS_KEY, 'false');
      return false;
    }
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): ServerConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.connectionStatus.isConnected;
  }

  /**
   * Get server base URL
   */
  getServerUrl(): string | null {
    return this.connectionStatus.baseUrl;
  }

  /**
   * Disconnect from server
   */
  async disconnect(): Promise<void> {
    await AsyncStorage.removeItem(LOCAL_BASE_URL);
    await AsyncStorage.removeItem(CONNECTION_STATUS_KEY);
    this.connectionStatus = {
      isConnected: false,
      baseUrl: null,
      lastChecked: 0,
    };
  }

  /**
   * Fetch and store POS ID from local server
   * Called immediately after successful connection
   */
  async initializePosId(): Promise<string | null> {
    try {
      const baseUrl = this.connectionStatus.baseUrl;
      if (!baseUrl) {
        throw new Error('No server URL configured');
      }

      const response = await axios.get(
        `${baseUrl}${API_ENDPOINTS.local.settings.GET_POS_ID}`,
        { timeout: 5000 }
      );

      if (response.data?.posId) {
        const posId = response.data.posId;
        await posIdService.setPosId(posId);
        console.log('POS ID successfully stored:', posId);
        return posId;
      } else {
        throw new Error('No POS ID in response');
      }
    } catch (error: any) {
      console.error('Failed to fetch POS ID from server:', error.message);
      throw error;
    }
  }
}

export default new ServerConnectionService();
