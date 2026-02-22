/**
 * API Version Constant
 */
const API_V1 = 'api/v1/';

/**
 * Local API prefix for waiter app
 */
const LOCAL_WAITER = 'api/v1/';

/**
 * Centralized API Endpoints
 */
export const API_ENDPOINTS = {
  // Authentication (Cloud)
  auth: {
    LOGIN: `${API_V1}admin/auth/login`,
    LOGOUT: `${API_V1}admin/auth/logout`,
    REGISTER: `${API_V1}admin/auth/register`,
  },

  // User/Waiter endpoints (Cloud)
  user: {
    PROFILE: `${API_V1}user/profile`,
    UPDATE_PROFILE: `${API_V1}user/profile/update`,
  },

  // Orders (Cloud)
  order: {
    GET_ALL: `${API_V1}admin/order/getAll`,
    CREATE: `${API_V1}admin/order/placeOrder`,
    UPDATE: `${API_V1}admin/order/edit`,
    DELETE: `${API_V1}admin/order/delete`,
    SETTLE: `${API_V1}admin/order/settleOrder`,
  },

  // Menu (Cloud)
  menu: {
    GET_ALL: `${API_V1}user/menucategory/all`,
    GET_ITEMS: `${API_V1}user/menuItem/getAll`,
  },

  // Settings (Cloud)
  settings: {
    GET_ALL: `${API_V1}admin/companySettings/getAll`,
    UPDATE: `${API_V1}admin/companySettings/edit`,
  },

  // Local API endpoints for waiter app
  local: {
    // Orders
    order: {
      FIND: `${LOCAL_WAITER}order/find`,
      CREATE: `${LOCAL_WAITER}order/create`,
      UPDATE: `${LOCAL_WAITER}order/update`,
      DELETE: `${LOCAL_WAITER}order/delete`,
    },

    // Menu
    menu: {
      FIND: `${LOCAL_WAITER}menu/find`,
      CREATE: `${LOCAL_WAITER}menu/create`,
      UPDATE: `${LOCAL_WAITER}menu/update`,
    },

    // Settings
    settings: {
      FIND: `${LOCAL_WAITER}settings/find`,
      CREATE: `${LOCAL_WAITER}settings/create`,
      UPDATE: `${LOCAL_WAITER}settings/update`,
      GET_POS_ID: `${LOCAL_WAITER}settings/pos-id`,
    },

    // User
    user: {
      LIST: `${LOCAL_WAITER}admin/user/list`,
    },

    // Category
    category: {
      FIND: `${LOCAL_WAITER}category/find`,
      CREATE: `${LOCAL_WAITER}category/create`,
      UPDATE: `${LOCAL_WAITER}category/update`,
    },

    // Hold Orders
    holdOrder: {
      FIND: `${LOCAL_WAITER}holdOrder/find`,
      CREATE: `${LOCAL_WAITER}holdOrder/create`,
      UPDATE: `${LOCAL_WAITER}holdOrder/update`,
    },
  },

  // Miscellaneous
  health: '',
};
