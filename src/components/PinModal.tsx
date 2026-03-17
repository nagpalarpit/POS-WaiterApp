import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { useTheme } from '../theme/ThemeProvider';
import Card from './Card';
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

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="PIN"
      subtitle="Enter PIN to continue"
      snapPoints={['38%']}
    >
      <Card rounded={12} style={{ padding: 16, borderColor: colors.border }}>
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>PIN</Text>
          <AppBottomSheetTextInput
            value={pin}
            onChangeText={setPin}
            placeholder="Enter PIN"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            secureTextEntry
            style={{
              color: colors.text,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              padding: 10,
              backgroundColor: colors.surface,
              textAlign: 'center',
              letterSpacing: 8,
              fontSize: 16,
            }}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          <TouchableOpacity
            onPress={onClose}
            style={{ flex: 1, padding: 12, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border }}
          >
            <Text style={{ textAlign: 'center', color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={checkPin}
            disabled={!pin.trim() || checking}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 8,
              backgroundColor: !pin.trim() || checking ? colors.border : colors.primary,
            }}
          >
            <Text style={{ textAlign: 'center', color: colors.textInverse, fontWeight: '700' }}>Submit</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </AppBottomSheet>
  );
}
