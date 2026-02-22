import React, { useEffect, useMemo, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator, DrawerContentComponentProps } from '@react-navigation/drawer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, Switch, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import IPEntryScreen from '../screens/IPEntryScreen';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import MenuScreen from '../screens/MenuScreen';
import CheckoutScreen from '../screens/CheckoutScreen';
import OrderDetailsScreen from '../screens/OrderDetailsScreen';
import serverConnection from '../services/serverConnection';
import { useTheme } from '../theme/ThemeProvider';

export type RootStackParamList = {
  IPEntry: undefined;
  Login: undefined;
  Dashboard: undefined;
  Menu: {
    tableNo?: number;
    deliveryType: number;
    existingOrder?: any;
  };
  Checkout: {
    cart: any;
    tableNo?: number;
    deliveryType: number;
  };
  OrderDetails: {
    order: any;
  };
};

type RootDrawerParamList = {
  Main: undefined;
  IPEntry: undefined;
  Login: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Drawer = createDrawerNavigator<RootDrawerParamList>();

type DrawerRouteName = keyof RootDrawerParamList;

type DrawerUser = {
  displayName: string;
  subtitle: string;
};

function MainStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
      initialRouteName="Dashboard">
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: true }} />
      <Stack.Screen name="Menu" component={MenuScreen} options={{ headerShown: true }} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ headerShown: true }} />
      <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} options={{ headerShown: true }} />
    </Stack.Navigator>
  );
}

function CustomDrawerContent(props: DrawerContentComponentProps) {
  const { colors } = useTheme();
  const [isOnline, setIsOnline] = useState(serverConnection.isConnected());
  const [updatingConnection, setUpdatingConnection] = useState(false);
  const [drawerUser, setDrawerUser] = useState<DrawerUser>({
    displayName: 'Waiter',
    subtitle: 'POS Waiter App',
  });

  useEffect(() => {
    setIsOnline(serverConnection.isConnected());
  }, []);

  useEffect(() => {
    const hydrateDrawer = async () => {
      try {
        const rawUser = await AsyncStorage.getItem('userData');
        const parsedUser = rawUser ? JSON.parse(rawUser) : null;

        const firstName = parsedUser?.firstName || parsedUser?.name || '';
        const lastName = parsedUser?.lastName || '';
        const name = [firstName, lastName].filter(Boolean).join(' ').trim();
        const email = parsedUser?.email || parsedUser?.userName || '';
        const companyName = parsedUser?.company?.name || parsedUser?.companyName || '';

        setDrawerUser({
          displayName: name || companyName || 'Waiter',
          subtitle: email || companyName || 'POS Waiter App',
        });
        setIsOnline(serverConnection.isConnected());
      } catch (error) {
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

  const navigateTo = (routeName: DrawerRouteName) => {
    props.navigation.navigate(routeName);
    props.navigation.closeDrawer();
  };

  const handleOnlineToggle = async (nextValue: boolean) => {
    try {
      setUpdatingConnection(true);

      if (!nextValue) {
        await serverConnection.disconnect();
        setIsOnline(false);
        return;
      }

      const status = await serverConnection.initializeConnection();
      setIsOnline(status.isConnected);

      if (!status.isConnected) {
        Alert.alert(
          'Connection Failed',
          'Unable to connect to the local server. Update IP settings and try again.'
        );
      }
    } catch (error) {
      setIsOnline(false);
      Alert.alert('Connection Error', 'There was an issue updating server connection status.');
    } finally {
      setUpdatingConnection(false);
    }
  };

  const drawerItems: Array<{
    route: DrawerRouteName;
    label: string;
    subtitle: string;
    icon: React.ComponentProps<typeof MaterialIcons>['name'];
  }> = [
    {
      route: 'Main',
      label: 'Dashboard',
      subtitle: 'Tables, orders, and live activity',
      icon: 'dashboard',
    },
    {
      route: 'IPEntry',
      label: 'Connection Settings',
      subtitle: 'Manage local server IP and status',
      icon: 'settings-input-antenna',
    },
    {
      route: 'Login',
      label: 'Account',
      subtitle: 'Switch profile or log in again',
      icon: 'person-outline',
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.background,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: colors.primary + '22',
              justifyContent: 'center',
              alignItems: 'center',
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

        <View
          style={{
            alignSelf: 'flex-start',
            marginTop: 14,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: isOnline ? colors.success + '20' : colors.warning + '20',
          }}
        >
          <MaterialIcons
            name={isOnline ? 'wifi' : 'wifi-off'}
            size={14}
            color={isOnline ? colors.success : colors.warning}
          />
          <Text
            style={{
              marginLeft: 6,
              color: isOnline ? colors.success : colors.warning,
              fontSize: 12,
              fontWeight: '700',
            }}
          >
            {isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 14, paddingBottom: 20 }}>
        {drawerItems.map((item) => {
          const isActive = activeRoute === item.route;
          return (
            <TouchableOpacity
              key={item.route}
              onPress={() => navigateTo(item.route)}
              activeOpacity={0.8}
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: isActive ? colors.primary : colors.border,
                backgroundColor: isActive ? colors.primary + '14' : colors.surface,
                paddingHorizontal: 12,
                paddingVertical: 12,
                marginBottom: 10,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isActive ? colors.primary + '20' : colors.surfaceHover,
                  }}
                >
                  <MaterialIcons
                    name={item.icon}
                    size={20}
                    color={isActive ? colors.primary : colors.textSecondary || colors.text}
                  />
                </View>

                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{item.label}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{item.subtitle}</Text>
                </View>

                <MaterialIcons name="chevron-right" size={18} color={colors.textSecondary || colors.text} />
              </View>
            </TouchableOpacity>
          );
        })}

        <View
          style={{
            marginTop: 8,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            paddingHorizontal: 12,
            paddingVertical: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceHover,
              }}
            >
              <MaterialIcons
                name={isOnline ? 'cloud-done' : 'cloud-off'}
                size={20}
                color={isOnline ? colors.success : colors.warning}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Local Server</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                {isOnline ? 'Connected and ready to sync' : 'Disconnected from server'}
              </Text>
            </View>
            <Switch
              value={isOnline}
              onValueChange={handleOnlineToggle}
              disabled={updatingConnection}
              thumbColor={isOnline ? colors.primary : '#f4f3f4'}
              trackColor={{ false: colors.border, true: colors.primary + '55' }}
            />
          </View>

          {!isOnline && (
            <TouchableOpacity
              onPress={() => navigateTo('IPEntry')}
              style={{ marginTop: 10, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 8 }}
            >
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Fix connection</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function AppNavigator() {
  const { colors } = useTheme();
  const [ready, setReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState<keyof RootDrawerParamList>('IPEntry');

  useEffect(() => {
    const boot = async () => {
      try {
        const conn = await serverConnection.initializeConnection();
        const token = await AsyncStorage.getItem('token');

        if (token) {
          if (conn.isConnected) setInitialRoute('Main');
          else setInitialRoute('Login');
        } else {
          setInitialRoute('IPEntry');
        }
      } catch (error) {
        setInitialRoute('IPEntry');
      } finally {
        setReady(true);
      }
    };

    boot();
  }, []);

  if (!ready) return null;

  return (
    <NavigationContainer>
      <Drawer.Navigator
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerType: 'front',
          overlayColor: colors.overlay || 'rgba(0, 0, 0, 0.35)',
          drawerStyle: {
            width: '84%',
            borderTopRightRadius: 16,
            borderBottomRightRadius: 16,
            backgroundColor: colors.background,
          },
        }}
        initialRouteName={initialRoute}
      >
        <Drawer.Screen name="Main" component={MainStack} />
        <Drawer.Screen name="IPEntry" component={IPEntryScreen} />
        <Drawer.Screen name="Login" component={LoginScreen} />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}
