import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { useConnection } from '../contexts/ConnectionProvider';
import ConnectionSettingsModal from './ConnectionSettingsModal';

export default function ConnectionBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isInternetReachable, isLocalServerReachable } = useConnection();
  const [connectionModalVisible, setConnectionModalVisible] = useState(false);

  if (isInternetReachable && isLocalServerReachable) {
    return null;
  }

  const isNoInternet = !isInternetReachable;
  const title = isNoInternet ? 'No Internet' : 'Local Server Offline';
  const description = isNoInternet
    ? 'Check Wi-Fi or mobile data. Orders can sync when connection is back.'
    : 'Internet is available, but the POS server on your local network is not reachable.';
  const accent = isNoInternet ? colors.error : colors.warning;

  const openConnectionModal = () => {
    setConnectionModalVisible(true);
  };

  const closeConnectionModal = () => {
    setConnectionModalVisible(false);
  };

  return (
    <>
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingBottom: 10,
          paddingHorizontal: 14,
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: accent,
            backgroundColor: accent + '14',
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: accent + '22',
                marginRight: 10,
              }}
            >
              <MaterialIcons
                name={isNoInternet ? 'wifi-off' : 'dns'}
                size={18}
                color={accent}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>
                {title}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                {description}
              </Text>
            </View>
          </View>

          {!isNoInternet && (
            <TouchableOpacity
              onPress={openConnectionModal}
              disabled={connectionModalVisible}
              style={{
                marginTop: 10,
                alignSelf: 'flex-start',
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: colors.primary,
                opacity: connectionModalVisible ? 0.6 : 1,
              }}
            >
              <Text style={{ color: colors.textInverse || '#fff', fontWeight: '700', fontSize: 12 }}>
                Connect
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ConnectionSettingsModal
        visible={connectionModalVisible}
        onClose={closeConnectionModal}
        onConnected={closeConnectionModal}
      />
    </>
  );
}
