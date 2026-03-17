import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import authService from '../services/authService';
import { useToast } from '../components/ToastProvider';
import { useConnection } from './ConnectionProvider';
import { SECURE_STORAGE_KEYS, STORAGE_KEYS } from '../constants/storageKeys';
import { AuthContextType, AuthState, User } from '../types/auth';
import { clearStoredAuthSession, getTokenLicenseError } from '../services/tokenService';

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const { showToast } = useToast();
    const { isLocalServerReachable, isCheckingLocal, refreshLocalServerStatus } = useConnection();

    const [state, setState] = useState<AuthState>({
        isAuthenticated: false,
        isLoading: true,
        user: null,
        token: null,
        loginType: null,
        isServerConnected: false,
        isCheckingConnection: false,
    });

    const checkServerConnection = async (): Promise<boolean> => {
        const connected = await refreshLocalServerStatus();
        return connected;
    };

    const clearStoredAuth = async () => {
        await clearStoredAuthSession();
    };

    // Load stored auth data
    const loadStoredAuth = async (): Promise<{ token: string | null; user: User | null; loginType: 'local' | 'cloud' | null }> => {
        try {
            const token = await SecureStore.getItemAsync(SECURE_STORAGE_KEYS.authToken);
            const userData = await AsyncStorage.getItem(STORAGE_KEYS.authUser);
            const user = userData ? JSON.parse(userData) : null;
            const loginType = (await AsyncStorage.getItem(STORAGE_KEYS.authLoginType)) as 'local' | 'cloud' | null;

            return { token, user, loginType };
        } catch (error) {
            console.error('Error loading stored auth:', error);
            return { token: null, user: null, loginType: null };
        }
    };

    // Validate token with server
    const validateToken = async (token: string, loginType: 'local' | 'cloud'): Promise<boolean> => {
        try {
            const licenseError = getTokenLicenseError(token);
            if (licenseError) {
                throw new Error(licenseError);
            }

            if (loginType === 'local') {
                // For local, check if server is connected and socket is active
                const isConnected = await checkServerConnection();
                return isConnected;
            } else {
                // For cloud, we could ping a /me endpoint, but for now just check if token exists
                // TODO: Add proper token validation endpoint
                return !!token;
            }
        } catch (error) {
            return false;
        }
    };

    // Check auth status on app start
    const checkAuthStatus = async () => {
        setState(prev => ({ ...prev, isLoading: true }));

        try {
            const { token, user, loginType } = await loadStoredAuth();

            if (!token || !user || !loginType) {
                setState(prev => ({ ...prev, isAuthenticated: false, isLoading: false }));
                return;
            }

            const isValid = await validateToken(token, loginType);

            if (isValid) {
                setState(prev => ({
                    ...prev,
                    isAuthenticated: true,
                    user,
                    token,
                    loginType,
                    isLoading: false,
                }));
            } else {
                await clearStoredAuth();
                setState(prev => ({
                    ...prev,
                    isAuthenticated: false,
                    isLoading: false,
                    user: null,
                    token: null,
                    loginType: null,
                }));
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            setState(prev => ({ ...prev, isAuthenticated: false, isLoading: false }));
        }
    };

    // Login function
    const login = async (email: string, password: string): Promise<boolean> => {
        setState(prev => ({ ...prev, isLoading: true }));

        try {
            const result = await authService.loginWithFallback({ email, password });

            if (result.success && result.response) {
                const { token, user } = result.response;
                const loginType = result.loginType;

                // Store securely
                await SecureStore.setItemAsync(SECURE_STORAGE_KEYS.authToken, token);
                await AsyncStorage.setItem(STORAGE_KEYS.authUser, JSON.stringify(user));
                await AsyncStorage.setItem(STORAGE_KEYS.authLoginType, loginType || 'cloud');

                setState(prev => ({
                    ...prev,
                    isAuthenticated: true,
                    user,
                    token,
                    loginType,
                    isLoading: false,
                }));

                return true;
            } else {
                showToast('error', result.error || 'Login failed');
                setState(prev => ({ ...prev, isLoading: false }));
                return false;
            }
        } catch (error: any) {
            showToast('error', error.message || 'An unexpected error occurred');
            setState(prev => ({ ...prev, isLoading: false }));
            return false;
        }
    };

    // Logout function
    const logout = async () => {
        setState(prev => ({ ...prev, isLoading: true }));

        try {
            await authService.logout();
            await SecureStore.deleteItemAsync(SECURE_STORAGE_KEYS.authToken);
            await AsyncStorage.multiRemove([STORAGE_KEYS.authUser, STORAGE_KEYS.authLoginType]);

            setState({
                isAuthenticated: false,
                isLoading: false,
                user: null,
                token: null,
                loginType: null,
                isServerConnected: state.isServerConnected,
                isCheckingConnection: false,
            });
        } catch (error) {
            console.error('Error during logout:', error);
            showToast('error', 'Error during logout');
            setState(prev => ({ ...prev, isLoading: false }));
        }
    };

    // Initialize on mount
    useEffect(() => {
        const initialize = async () => {
            await checkServerConnection();
            await checkAuthStatus();
        };

        initialize();
    }, []);

    useEffect(() => {
        if (!isLocalServerReachable || state.isAuthenticated || state.isLoading) {
            return;
        }

        const restoreLocalSession = async () => {
            try {
                const { token, user, loginType } = await loadStoredAuth();

                if (!token || !user || loginType !== 'local') {
                    return;
                }

                await checkAuthStatus();
            } catch (error) {
                console.error('Error restoring local session:', error);
            }
        };

        restoreLocalSession();
    }, [isLocalServerReachable, state.isAuthenticated, state.isLoading]);

    const value: AuthContextType = {
        ...state,
        isServerConnected: isLocalServerReachable,
        isCheckingConnection: isCheckingLocal,
        login,
        logout,
        checkAuthStatus,
        checkServerConnection,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
