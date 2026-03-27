import React, { useCallback, useState } from 'react';
import Constants from 'expo-constants';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import posIdService from '../services/posIdService';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { useTranslation, useLanguage } from '../contexts/LanguageContext';
import { LANGUAGE_OPTIONS } from "../i18n/translations"

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
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const [devicePosId, setDevicePosId] = useState<string>('');
  const [staffName, setStaffName] = useState<string>('');
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
        setDevicePosId(posId || '');
        setStaffName(fullName || parsedUser?.email || '');
        setStaffEmail(parsedUser?.email || '');
      };

      hydrate();
    }, [t])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.groupLabel, { color: colors.textSecondary || colors.text }]}>{t('account')}</Text>

        <View
          style={[
            styles.section,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <InfoRow label={t('staff')} value={staffName || t('signedIn')} colors={colors} isLast={!staffEmail} />
          {staffEmail ? <InfoRow label={t('email')} value={staffEmail} colors={colors} isLast /> : null}
        </View>

        <Text style={[styles.groupLabel, { color: colors.textSecondary || colors.text }]}>{t('device')}</Text>

        <View
          style={[
            styles.section,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <InfoRow label={t('posId')} value={devicePosId || t('notAssigned')} colors={colors} isLast />
        </View>

        <Text style={[styles.groupLabel, { color: colors.textSecondary || colors.text }]}>{t('currentLanguage')}</Text>
        <View
          style={[
            styles.section,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.languageRow}>
            {LANGUAGE_OPTIONS.map((option) => {
              const active = language === option.code;
              return (
                <TouchableOpacity
                  key={option.code}
                  onPress={() => void setLanguage(option.code)}
                  style={[
                    styles.languagePill,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary : colors.surface,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? colors.textInverse : colors.text,
                      fontWeight: '700',
                    }}
                  >
                    {option.flag} {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={[styles.groupLabel, { color: colors.textSecondary || colors.text }]}>{t('about')}</Text>

        <View
          style={[
            styles.section,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <InfoRow label={t('version')} value={appVersion} colors={colors} isLast />
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
  languageRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexWrap: 'wrap',
  },
  languagePill: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
