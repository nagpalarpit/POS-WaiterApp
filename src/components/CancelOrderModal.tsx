import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import Card from './Card';
import { useToast } from './ToastProvider';

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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 16 }}
      >
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
          }}
        />

        <Card rounded={12} style={{ padding: 16, borderColor: colors.border }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View>
              <Text
                style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}
              >
                Cancel Order
              </Text>
              <Text
                style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}
              >
                Enter a reason to continue
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} disabled={loading}>
              <Text style={{ color: colors.textSecondary, fontSize: 20 }}>x</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 16 }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 12,
                fontWeight: '600',
                marginBottom: 8,
              }}
            >
              Reason
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Enter cancel reason"
              placeholderTextColor={colors.textSecondary}
              style={{
                color: colors.text,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                padding: 10,
                minHeight: 90,
                textAlignVertical: 'top',
                backgroundColor: colors.surface,
              }}
              multiline
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <TouchableOpacity
              onPress={onClose}
              disabled={loading}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 8,
                borderWidth: 1.5,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  textAlign: 'center',
                  color: colors.textSecondary,
                  fontWeight: '600',
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={!reason.trim() || loading}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 8,
                backgroundColor:
                  !reason.trim() || loading ? colors.border : colors.error,
              }}
            >
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                <Text
                  style={{
                    textAlign: 'center',
                    color: colors.textInverse,
                    fontWeight: '700',
                    opacity: loading ? 0 : 1,
                  }}
                >
                  Confirm
                </Text>
                {loading ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.textInverse}
                    style={{ position: 'absolute' }}
                  />
                ) : null}
              </View>
            </TouchableOpacity>
          </View>
        </Card>
      </KeyboardAvoidingView>
    </Modal>
  );
}
