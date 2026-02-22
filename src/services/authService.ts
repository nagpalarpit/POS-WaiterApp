import api, { setAuthToken, clearAuthToken } from './api';
import localApi, { setLocalAuthToken, clearLocalAuthToken } from './localApi';
import serverConnection from './serverConnection';
import localDatabase from './localDatabase';
import posIdService from './posIdService';
import { initLocalSocket, initCloudSocket, disconnectSocket } from './socket';
import { API_ENDPOINTS } from '../config/apiEndpoints';

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    email?: string;
    [key: string]: any;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

class AuthService {
  /**
   * Login flow: Try cloud login first, fallback to local cached credentials
   */
  async loginWithFallback(credentials: LoginRequest): Promise<{
    success: boolean;
    response?: LoginResponse;
    loginType: 'local' | 'cloud' | null;
    error?: string;
  }> {
    try {
      // Try cloud login first (normal case)
      const response = await this.cloudLogin(credentials);
      
      // On successful cloud login, cache credentials locally for future offline access
      await localDatabase.cacheLoginCredentials(
        credentials.email,
        credentials.password,
        response.token,
        response.user
      );

      // Initialize cloud socket connection
      await initCloudSocket();

      return {
        success: true,
        response,
        loginType: 'cloud',
      };
    } catch (cloudError: any) {
      console.log('Cloud login failed, attempting local login:', cloudError.message);
      
      // Fallback: Try local login using cached credentials
      try {
        const localResponse = await this.localLogin(credentials);
        return {
          success: true,
          response: localResponse,
          loginType: 'local',
        };
      } catch (localError: any) {
        return {
          success: false,
          loginType: null,
          error: localError.message || 'Login failed. Please check your credentials.',
        };
      }
    }
  }

  /**
   * Local server login - Query cached credentials from local database
   */
  private async localLogin(credentials: LoginRequest): Promise<LoginResponse> {
    try {
      // Query local database for cached credentials (similar to POS_V2)
      const loginData = await localDatabase.localLogin(
        credentials.email,
        credentials.password
      );

      if (!loginData || !loginData.token) {
        throw new Error('No cached credentials found');
      }

      // Set local auth token
      await setLocalAuthToken(loginData.token);

      // Load POS ID that was already fetched during IPEntryScreen connection
      await posIdService.loadPosId();

      const loginResponse: LoginResponse = {
        token: loginData.token,
        user: loginData.user,
      };

      // Save metadata
      await this.saveLoginMetadata({
        ...loginResponse,
        loginType: 'local',
      });

      // Initialize local socket connection
      await initLocalSocket();

      return loginResponse;
    } catch (error: any) {
      throw new Error(
        error.message || 'Local login failed. Please ensure you have logged in before with internet connection.'
      );
    }
  }

  /**
   * Cloud server login
   */
  private async cloudLogin(credentials: LoginRequest): Promise<LoginResponse> {
    try {
      const response = await api.post(API_ENDPOINTS.auth.LOGIN, credentials);

      if (response.status === 200 && response.data?.token) {
        const loginResponse: LoginResponse = {
          token: response.data.token,
          user: response.data.user,
        };

        // Set cloud auth token
        await setAuthToken(loginResponse.token);

        // Try to load previously stored POS ID (from local server)
        // If not available, POS ID will be empty and optional
        await posIdService.loadPosId();

        // Save metadata
        await this.saveLoginMetadata({
          ...loginResponse,
          loginType: 'cloud',
        });

        return loginResponse;
      }

      throw new Error('Invalid response from cloud server');
    } catch (error: any) {
      throw new Error(
        error.response?.data?.message ||
          error.message ||
          'Cloud login failed'
      );
    }
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    await clearAuthToken();
    await clearLocalAuthToken();
    disconnectSocket();
  }

  /**
   * Save login metadata (login type, timestamp, etc.)
   */
  private async saveLoginMetadata(data: any): Promise<void> {
    try {
      const metadata = {
        loginType: data.loginType,
        userId: data.user?.id,
        username: data.user?.username,
        loginTime: new Date().toISOString(),
      };

      // This can be used for analytics, debugging, etc.
      // Can be stored in AsyncStorage if needed for offline reference
    } catch (error) {
      console.log('Error saving login metadata:', error);
    }
  }
}

export default new AuthService();
