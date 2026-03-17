// Auth related types
export interface User {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  companyId?: number;
  company?: {
    id: number;
    name: string;
  };
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  token: string | null;
  loginType: 'local' | 'cloud' | null;
  isServerConnected: boolean;
  isCheckingConnection: boolean;
}

export interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
  checkServerConnection: () => Promise<boolean>;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// Server connection types
export interface ServerConnectionStatus {
  isConnected: boolean;
  baseUrl: string | null;
  lastChecked: number;
}

// Navigation types
export type RootStackParamList = {
  IPEntry: undefined;
  Login: undefined;
  Dashboard: undefined;
  Menu: {
    tableNo?: number;
    deliveryType: number;
    existingOrder?: any;
    tableArea?: any;
  };
  Checkout: {
    cart: any;
    tableNo?: number;
    deliveryType: number;
    tableArea?: any;
    existingOrder?: any;
  };
  OrderDetails: {
    order: any;
  };
};

export type RootDrawerParamList = {
  Main: undefined;
  IPEntry: undefined;
  Login: undefined;
};