import localApi from './localApi';
import serverConnection from './serverConnection';

/**
 * Local Database Service - Mongoose/MongoDB abstraction layer
 * Pattern matches POS_V2's MongodbService exactly for consistency across applications
 * Queries against "settings" collection for login credentials (matching POS_V2)
 * All query paths include /api/v1 prefix as configured in local server
 */
class LocalDatabaseService {
  /**
   * Select (Find) data from collection
   * Matches POS_V2's mongodbService.select() pattern
   * @param collection - Collection name
   * @param condition - Query condition with 'where' wrapper: { where: {...} }
   * @param attributes - Fields to select (optional)
   * @returns Array of matching documents
   */
  async select(
    collection: string,
    condition: any = { where: {} },
    attributes: string[] = []
  ): Promise<any[]> {
    try {
      if (!serverConnection.isConnected()) {
        throw new Error('Local server not connected');
      }

      const response = await localApi.post(`/api/v1/${collection}/find`, {
        condition,
        attributes,
      });

      // Server response format: { data: [...], status: 200, message: "Success" }
      if (response.status === 200 && response.data?.status === 200 && response.data?.data) {
        return response.data.data;
      }

      throw new Error(`Failed to query ${collection}: ${response.data?.message || 'Unknown error'}`);
    } catch (error: any) {
      console.error(`Error selecting from ${collection}:`, error.message);
      throw error;
    }
  }

  /**
   * Insert (Create) data into collection
   * Matches POS_V2's mongodbService.insert() pattern
   * @param collection - Collection name
   * @param document - Document to insert
   * @returns Created document
   */
  async insert(collection: string, document: any): Promise<any> {
    try {
      if (!serverConnection.isConnected()) {
        throw new Error('Local server not connected');
      }

      const response = await localApi.post(`/api/v1/${collection}/create`, document);

      // Server response format: { data: {...}, status: 200, message: "Success" }
      if (response.status === 200 && response.data?.status === 200 && response.data?.data) {
        return response.data.data;
      }

      throw new Error(`Failed to insert into ${collection}: ${response.data?.message || 'Unknown error'}`);
    } catch (error: any) {
      console.error(`Error inserting into ${collection}:`, error.message);
      throw error;
    }
  }

  /**
   * Update data in collection
   * Matches POS_V2's mongodbService.update() pattern
   * @param collection - Collection name
   * @param newData - Data to update
   * @param condition - Query condition: { where: {...} }
   * @returns Updated document
   */
  async update(
    collection: string,
    newData: any,
    condition: any = { where: {} }
  ): Promise<any> {
    try {
      if (!serverConnection.isConnected()) {
        throw new Error('Local server not connected');
      }

      const response = await localApi.post(`/api/v1/${collection}/update`, {
        newData,
        condition,
      });

      // Server response format: { data: {...}, status: 200, message: "Success" }
      if (response.status === 200 && response.data?.status === 200 && response.data?.data) {
        return response.data.data;
      }

      throw new Error(`Failed to update ${collection}: ${response.data?.message || 'Unknown error'}`);
    } catch (error: any) {
      console.error(`Error updating ${collection}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete data from collection
   * Matches POS_V2's mongodbService.delete() pattern
   * @param collection - Collection name
   * @param condition - Query condition (optional): { where: {...} }
   * @returns Deletion result
   */
  async delete(collection: string, condition?: any): Promise<any> {
    try {
      if (!serverConnection.isConnected()) {
        throw new Error('Local server not connected');
      }

      const response = await localApi.post(`/api/v1/${collection}/delete`, {
        condition: condition || {},
      });

      // Server response format: { data: {...}, status: 200, message: "Success" }
      if (response.status === 200 && response.data?.status === 200) {
        return response.data;
      }

      throw new Error(`Failed to delete from ${collection}: ${response.data?.message || 'Unknown error'}`);
    } catch (error: any) {
      console.error(`Error deleting from ${collection}:`, error.message);
      throw error;
    }
  }

  /**
   * Attempt local login using cached credentials
   * Uses "settings" collection like POS_V2's login.component.ts
   * Query pattern: { where: { email: string, password: string } }
   */
  async localLogin(email: string, password: string): Promise<any> {
    try {
      // Query local database for matching credentials in "settings" collection
      // Following POS_V2 pattern: condition with 'where' wrapper and email/password fields
      const results = await this.select('settings', {
        where: {
          email: email.toLowerCase(),
          password,
        },
      });

      if (!results || results.length === 0) {
        throw new Error('Invalid credentials');
      }

      const user = results[0];

      // Validate token exists - same check as POS_V2
      if (!user.token || user.token === 'null') {
        throw new Error('Token not available. Please login with internet connection first.');
      }

      return {
        token: user.token,
        user: user.userInfo || user.user,
      };
    } catch (error: any) {
      throw new Error(error.message || 'Local login failed');
    }
  }

  /**
   * Cache login credentials locally for offline access
   * Stores in "settings" collection matching POS_V2 structure
   */
  async cacheLoginCredentials(
    email: string,
    password: string,
    token: string,
    user: any
  ): Promise<void> {
    try {
      if (!serverConnection.isConnected()) {
        console.log('Local server not connected, cannot cache credentials');
        return;
      }

      // Check if user already exists
      const existing = await this.select('settings', {
        where: {
          email: email.toLowerCase(),
        },
      });

      // Match POS_V2's data structure
      const credentials = {
        email: email.toLowerCase(),
        password,
        token,
        userInfo: user,
        loginTime: new Date().toISOString(),
      };

      if (existing && existing.length > 0) {
        // Update existing record - following POS_V2 pattern
        await this.update(
          'settings',
          credentials,
          {
            where: {
              email: email.toLowerCase(),
            },
          }
        );
      } else {
        // Insert new record
        await this.insert('settings', credentials);
      }

      console.log('Login credentials cached locally');
    } catch (error) {
      console.log('Error caching login credentials:', error);
      // Non-critical operation - don't throw
    }
  }

  /**
   * Clear cached login credentials
   */
  async clearCachedCredentials(email: string): Promise<void> {
    try {
      if (!serverConnection.isConnected()) {
        return;
      }

      await this.delete('settings', {
        where: {
          email: email.toLowerCase(),
        },
      });

      console.log('Login credentials cleared');
    } catch (error) {
      console.log('Error clearing credentials:', error);
      // Non-critical operation - don't throw
    }
  }
}

export default new LocalDatabaseService();
