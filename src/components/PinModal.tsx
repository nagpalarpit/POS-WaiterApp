import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { useTheme } from '../theme/ThemeProvider';
import { useToast } from './ToastProvider';
import localDatabase from '../services/localDatabase';
import AppBottomSheet from './AppBottomSheet';
import AppBottomSheetTextInput from './AppBottomSheetTextInput';

type Props = {
  visible: boolean;
  onClose: () => void;
  onVerified: () => void;
};

const normalizeCompanyId = (data: any): number => {
  return (
    Number(
      data?.companyId ||
      data?.company?.id ||
      data?.company?.companyId ||
      0
    ) || 0
  );
};

export default function PinModal({ visible, onClose, onVerified }: Props) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (visible) {
      setPin('');
      setChecking(false);
    }
  }, [visible]);

  const checkPin = async () => {
    if (checking) return;
    const trimmed = pin.trim();
    if (!trimmed) return;

    setChecking(true);
    try {
      const userDataStr = await AsyncStorage.getItem(STORAGE_KEYS.authUser);
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      const companyId = normalizeCompanyId(userData);
      const where: any = { 'userInfo.pin': trimmed };
      if (companyId) {
        where.companyId = companyId;
      }

      const res = await localDatabase.select('settings', { where });
      if (!Array.isArray(res) || res.length === 0) {
        showToast('error', 'Wrong PIN');
        return;
      }

      onVerified();
      onClose();
    } catch (error) {
      console.error('PinModal: Failed to verify pin', error);
      showToast('error', 'Unable to verify PIN');
    } finally {
      setChecking(false);
    }
  };

  const footer = (
    <View style={styles.footerActions}>
      <TouchableOpacity
        onPress={onClose}
        activeOpacity={0.85}
        style={[
          styles.secondaryButton,
          {
            borderColor: colors.border,
            backgroundColor: colors.searchBackground || colors.surface,
          },
        ]}
      >
        <Text style={[styles.secondaryButtonText, { color: colors.textSecondary || colors.text }]}>
          Cancel
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={checkPin}
        disabled={!pin.trim() || checking}
        activeOpacity={0.85}
        style={[
          styles.primaryButton,
          {
            backgroundColor: !pin.trim() || checking ? colors.border : colors.primary,
          },
        ]}
      >
        <Text style={[styles.primaryButtonText, { color: colors.textInverse || '#fff' }]}>
          Submit
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="PIN"
      subtitle="Enter PIN to continue."
      snapPoints={['52%']}
      footer={footer}
    >
      <View style={styles.formSection}>
        <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>PIN</Text>
        <AppBottomSheetTextInput
          value={pin}
          onChangeText={setPin}
          placeholder="Enter PIN"
          placeholderTextColor={colors.textSecondary || colors.text}
          keyboardType="number-pad"
          secureTextEntry
          style={[
            styles.input,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.searchBackground || colors.surface,
            },
          ]}
        />
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  formSection: {
    marginBottom: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 8,
  },
  footerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 0.42,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
});
