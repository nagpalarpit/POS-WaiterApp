import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useToast } from './ToastProvider';
import AppBottomSheet from './AppBottomSheet';
import AppBottomSheetTextInput from './AppBottomSheetTextInput';

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
};

export default function CancelOrderModal({
  visible,
  onClose,
  onConfirm,
  loading = false,
}: Props) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (visible) {
      setReason('');
    }
  }, [visible]);

  const handleConfirm = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      showToast('error', 'Please enter a reason');
      return;
    }
    onConfirm(trimmed);
  };

  const footer = (
    <View style={styles.footerActions}>
      <TouchableOpacity
        onPress={onClose}
        disabled={loading}
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
        onPress={handleConfirm}
        disabled={!reason.trim() || loading}
        activeOpacity={0.85}
        style={[
          styles.primaryButton,
          {
            backgroundColor: !reason.trim() || loading ? colors.border : colors.error,
          },
        ]}
      >
        <View style={styles.buttonContent}>
          <Text
            style={[
              styles.primaryButtonText,
              { color: colors.textInverse || '#fff', opacity: loading ? 0 : 1 },
            ]}
          >
            Confirm
          </Text>
          {loading ? (
            <ActivityIndicator
              size="small"
              color={colors.textInverse || '#fff'}
              style={styles.buttonLoader}
            />
          ) : null}
        </View>
      </TouchableOpacity>
    </View>
  );

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="Cancel Order"
      subtitle="Enter a short reason to continue."
      snapPoints={['56%']}
      footer={footer}
    >
      <View style={styles.formSection}>
        <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>Reason</Text>
        <AppBottomSheetTextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Enter cancel reason"
          placeholderTextColor={colors.textSecondary || colors.text}
          style={[
            styles.textArea,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.searchBackground || colors.surface,
            },
          ]}
          multiline
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
  textArea: {
    minHeight: 132,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    textAlignVertical: 'top',
    fontSize: 16,
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
  buttonContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLoader: {
    position: 'absolute',
  },
});
