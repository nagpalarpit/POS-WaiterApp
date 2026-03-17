import React, { useEffect, useMemo, useState } from 'react';
import { DrawerActions, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator, DrawerContentComponentProps } from '@react-navigation/drawer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import IPEntryScreen from '../screens/IPEntryScreen';
import LoginScreen from '../screens/LoginScreen';
import ComingSoonScreen from '../screens/ComingSoonScreen';
import SettingsScreen from '../screens/SettingsScreen';
import DashboardScreen from '../screens/DashboardScreen';
import MenuScreen from '../screens/MenuScreen';
import CheckoutScreen from '../screens/CheckoutScreen';
import OrderDetailsScreen from '../screens/OrderDetailsScreen';
import authService from '../services/authService';
import posIdService from '../services/posIdService';
import serverConnection from '../services/serverConnection';
import { onOrderSync } from '../services/orderSyncService';
import { useTheme } from '../theme/ThemeProvider';
import { useToast } from '../components/ToastProvider';
import { useConnection } from '../contexts/ConnectionProvider';
import { useAuth } from '../contexts/AuthContext';
import { STORAGE_KEYS } from '../constants/storageKeys';
import StatusBarIndicator from '../components/StatusBarIndicator';

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

type RootDrawerParamList = {
  Main: undefined;
  IPEntry: undefined;
  Login: undefined;
  Account: undefined;
  Settings: undefined;
  Support: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Drawer = createDrawerNavigator<RootDrawerParamList>();

type DrawerRouteName = keyof RootDrawerParamList;

type DrawerUser = {
  displayName: string;
  subtitle: string;
};

type HeaderMenuButtonProps = {
  color: string;
  onPress: () => void;
};

function HeaderMenuButton({ color, onPress }: HeaderMenuButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}
    >
      <MaterialIcons name="menu" size={24} color={color} />
    </TouchableOpacity>
  );
}

function MainStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}
      initialRouteName="Dashboard"
    >
      <Stack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={({ navigation }) => ({
          title: 'Dashboard',
          headerLeft: ({ tintColor }) => (
            <HeaderMenuButton
              color={tintColor || colors.text}
              onPress={() => navigation.getParent()?.dispatch(DrawerActions.openDrawer())}
            />
          ),
        })}
      />
      <Stack.Screen name="Menu" component={MenuScreen} options={{ title: 'Menu' }} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: 'Checkout' }} />
      <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} options={{ title: 'Order Details' }} />
    </Stack.Navigator>
  );
}

function AccountScreen() {
  return (
    <ComingSoonScreen
      title="Account"
      description="Profile details, shift preferences, and device-specific account options will live here."
      icon="person-outline"
    />
  );
}

function SupportScreen() {
  return (
    <ComingSoonScreen
      title="Help & Support"
      description="Support contacts, troubleshooting help, and short guides will appear here."
      icon="help-outline"
    />
  );
}

function CustomDrawerContent(props: DrawerContentComponentProps) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [drawerUser, setDrawerUser] = useState<DrawerUser>({
    displayName: 'Waiter',
    subtitle: 'POS Waiter App',
  });

  useEffect(() => {
    const hydrateDrawer = async () => {
      try {
        const rawUser = await AsyncStorage.getItem(STORAGE_KEYS.authUser);
        const parsedUser = rawUser ? JSON.parse(rawUser) : null;

        const firstName = parsedUser?.firstName || parsedUser?.name || '';
        const lastName = parsedUser?.lastName || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        const email = parsedUser?.email || parsedUser?.userName || '';
        const companyName = parsedUser?.company?.name || parsedUser?.companyName || '';

        setDrawerUser({
          displayName: fullName || companyName || 'Waiter',
          subtitle: email || companyName || 'POS Waiter App',
        });
      } catch (_) {
        setDrawerUser({
          displayName: 'Waiter',
          subtitle: 'POS Waiter App',
        });
      }
    };

    hydrateDrawer();
  }, [props.state.index]);

  const activeRoute = props.state.routeNames[props.state.index] as DrawerRouteName;

  const initials = useMemo(() => {
    const text = drawerUser.displayName.trim();
    if (!text) return 'WA';
    const parts = text.split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }, [drawerUser.displayName]);

  const drawerItems: Array<{
    route: DrawerRouteName;
    label: string;
    icon: React.ComponentProps<typeof MaterialIcons>['name'];
  }> = [
      { route: 'Main', label: 'Dashboard', icon: 'dashboard' },
      { route: 'Account', label: 'Account', icon: 'person-outline' },
      { route: 'Settings', label: 'Settings', icon: 'settings' },
      { route: 'Support', label: 'Help & Support', icon: 'help-outline' },
    ];

  const navigateTo = (routeName: DrawerRouteName) => {
    props.navigation.navigate(routeName);
    props.navigation.closeDrawer();
  };

  const clearWebStorage = () => {
    try {
      const anyGlobal = globalThis as any;
      if (anyGlobal?.localStorage?.clear) anyGlobal.localStorage.clear();
      if (anyGlobal?.sessionStorage?.clear) anyGlobal.sessionStorage.clear();
    } catch (_) { }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      await authService.logout();
      await posIdService.clearPosId();
      await serverConnection.disconnect();
      await AsyncStorage.clear();
      clearWebStorage();
    } catch (_) {
      showToast('error', 'Unable to logout. Please try again.');
    } finally {
      setIsLoggingOut(false);
      props.navigation.closeDrawer();
      props.navigation.reset({
        index: 0,
        routes: [{ name: 'IPEntry' }],
      });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <View
        style={{
          paddingHorizontal: 18,
          paddingTop: 16,
          paddingBottom: 18,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.background,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: colors.primary + '18',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 15 }}>{initials}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
              {drawerUser.displayName}
            </Text>
            <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              {drawerUser.subtitle}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => props.navigation.closeDrawer()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surfaceHover,
            }}
          >
            <MaterialIcons name="close" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 14, paddingBottom: 24 }}
        >
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 12,
              fontWeight: '700',
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              paddingHorizontal: 8,
              marginBottom: 10,
            }}
          >
            Menu
          </Text>

          {drawerItems.map((item) => {
            const isActive = activeRoute === item.route;

            return (
              <TouchableOpacity
                key={item.route}
                onPress={() => navigateTo(item.route)}
                activeOpacity={0.8}
                style={{
                  borderRadius: 16,
                  backgroundColor: isActive ? colors.primary + '12' : 'transparent',
                  paddingHorizontal: 12,
                  paddingVertical: 13,
                  marginBottom: 4,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isActive ? colors.primary + '18' : colors.surfaceHover,
                    }}
                  >
                    <MaterialIcons
                      name={item.icon}
                      size={20}
                      color={isActive ? colors.primary : colors.textSecondary || colors.text}
                    />
                  </View>

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: isActive ? '700' : '600' }}>
                      {item.label}
                    </Text>
                  </View>

                  <MaterialIcons name="chevron-right" size={18} color={colors.textSecondary || colors.text} />
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 14,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          <TouchableOpacity
            onPress={handleLogout}
            disabled={isLoggingOut}
            activeOpacity={0.8}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 14,
              paddingVertical: 12,
              backgroundColor: isLoggingOut ? colors.border : colors.error,
            }}
          >
            <MaterialIcons name="logout" size={18} color={colors.textInverse || '#fff'} />
            <Text style={{ color: colors.textInverse || '#fff', fontWeight: '700', marginLeft: 8 }}>
              {isLoggingOut ? 'Logging out...' : 'Logout'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function AppNavigator() {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const { isLocalServerReachable } = useConnection();

  useEffect(() => {
    const unsubscribe = onOrderSync((payload) => {
      const eventType = String(payload?.eventType || '').toUpperCase();
      if (eventType === 'PRINT_SUCCESS') {
        showToast('success', 'Print successful');
        return;
      }

      if (eventType === 'PRINT_ERROR') {
        const message =
          payload?.orderData?.printMessage ||
          payload?.orderData?.orderInfo?.printMessage ||
          payload?.orderData?.message ||
          'Print failed';
        showToast('error', message);
      }
    });

    return unsubscribe;
  }, [showToast]);

  if (isLoading) {
    return null;
  }

  const initialRouteName: DrawerRouteName = isAuthenticated
    ? 'Main'
    : isLocalServerReachable
      ? 'Login'
      : 'IPEntry';
  const navigatorKey = isAuthenticated ? 'authenticated' : initialRouteName;

  return (
    <NavigationContainer>
      <StatusBarIndicator />
      <Drawer.Navigator
        key={navigatorKey}
        initialRouteName={initialRouteName}
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerType: 'front',
          overlayColor: colors.overlay || 'rgba(0, 0, 0, 0.35)',
          drawerStyle: {
            width: '82%',
            borderTopRightRadius: 18,
            borderBottomRightRadius: 18,
            backgroundColor: colors.background,
          },
        }}
      >
        <Drawer.Screen name="Main" component={MainStack} />
        <Drawer.Screen name="IPEntry" component={IPEntryScreen} />
        <Drawer.Screen name="Login" component={LoginScreen} />
        <Drawer.Screen
          name="Account"
          component={AccountScreen}
          options={({ navigation }) => ({
            headerShown: true,
            title: 'Account',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            headerLeft: ({ tintColor }) => (
              <HeaderMenuButton
                color={tintColor || colors.text}
                onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
              />
            ),
          })}
        />
        <Drawer.Screen
          name="Settings"
          component={SettingsScreen}
          options={({ navigation }) => ({
            headerShown: true,
            title: 'Settings',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            headerLeft: ({ tintColor }) => (
              <HeaderMenuButton
                color={tintColor || colors.text}
                onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
              />
            ),
          })}
        />
        <Drawer.Screen
          name="Support"
          component={SupportScreen}
          options={({ navigation }) => ({
            headerShown: true,
            title: 'Help & Support',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            headerLeft: ({ tintColor }) => (
              <HeaderMenuButton
                color={tintColor || colors.text}
                onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
              />
            ),
          })}
        />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}
