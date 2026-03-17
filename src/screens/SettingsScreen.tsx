import React, { useCallback, useState } from 'react';
import Constants from 'expo-constants';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import posIdService from '../services/posIdService';
import { STORAGE_KEYS } from '../constants/storageKeys';

type InfoRowProps = {
  label: string;
  value: string;
  isLast?: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
};

function InfoRow({ label, value, isLast = false, colors }: InfoRowProps) {
  return (
    <View
      style={[
        styles.row,
        {
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={{ flex: 1, paddingRight: 16 }}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      </View>
      <Text style={[styles.rowValue, { color: colors.text }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export default function SettingsScreen() {
  const { colors } = useTheme();
  const [devicePosId, setDevicePosId] = useState<string>('Not assigned');
  const [staffName, setStaffName] = useState<string>('Signed in');
  const [staffEmail, setStaffEmail] = useState<string>('');

  const appVersion =
    (Constants as any)?.expoConfig?.version ||
    (Constants as any)?.manifest?.version ||
    '1.0.0';

  useFocusEffect(
    useCallback(() => {
      const hydrate = async () => {
        const posId = await posIdService.loadPosId();
        const rawUser = await AsyncStorage.getItem(STORAGE_KEYS.authUser);
        const parsedUser = rawUser ? JSON.parse(rawUser) : null;
        const firstName = parsedUser?.firstName || parsedUser?.name || '';
        const lastName = parsedUser?.lastName || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        setDevicePosId(posId || 'Not assigned');
        setStaffName(fullName || parsedUser?.email || 'Signed in');
        setStaffEmail(parsedUser?.email || '');
      };

      hydrate();
    }, [])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.groupLabel, { color: colors.textSecondary || colors.text }]}>Account</Text>

        <View
          style={[
            styles.section,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <InfoRow label="Staff" value={staffName} colors={colors} isLast={!staffEmail} />
          {staffEmail ? <InfoRow label="Email" value={staffEmail} colors={colors} isLast /> : null}
        </View>

        <Text style={[styles.groupLabel, { color: colors.textSecondary || colors.text }]}>Device</Text>

        <View
          style={[
            styles.section,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <InfoRow label="POS ID" value={devicePosId} colors={colors} isLast />
        </View>

        <Text style={[styles.groupLabel, { color: colors.textSecondary || colors.text }]}>About</Text>

        <View
          style={[
            styles.section,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <InfoRow label="Version" value={appVersion} colors={colors} isLast />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  section: {
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
    maxWidth: '60%',
    flexShrink: 1,
    textAlign: 'right',
  },
});
