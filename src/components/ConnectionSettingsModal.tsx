import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import serverConnection from '../services/serverConnection';
import { setLocalBaseUrl } from '../services/localApi';
import { useToast } from './ToastProvider';
import { useConnection } from '../contexts/ConnectionProvider';
import Card from './Card';
import PrimaryButton from './PrimaryButton';

type Props = {
  visible: boolean;
  onClose: () => void;
  onConnected?: (host: string) => void;
};

const DEFAULT_IP = '127.0.0.1';
const DEFAULT_PORT = '4000';

const parseSavedUrl = (value: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return {
      ip: url.hostname,
      port: url.port || '',
    };
  } catch (_) {
    return null;
  }
};

export default function ConnectionSettingsModal({
  visible,
  onClose,
  onConnected,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { refreshLocalServerStatus } = useConnection();
  const [ip, setIp] = useState(DEFAULT_IP);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [loading, setLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const savedUrl = serverConnection.getServerUrl();
    const parsed = parseSavedUrl(savedUrl);
    setIp(parsed?.ip || DEFAULT_IP);
    setPort(parsed?.port || DEFAULT_PORT);
    setDebugInfo(null);
  }, [visible]);

  const handleConnect = async () => {
    const trimmedIp = ip.trim();
    const trimmedPort = port.trim();

    if (!trimmedIp) {
      showToast('error', 'Please enter server IP');
      return;
    }

    Keyboard.dismiss();
    const host = trimmedPort
      ? `http://${trimmedIp}:${trimmedPort}/`
      : `http://${trimmedIp}/`;
    setLoading(true);
    setDebugInfo(`Testing: ${host}`);

    try {
      const success = await serverConnection.setServerUrl(host);
      if (success) {
        setDebugInfo('Connected successfully.');
        await setLocalBaseUrl(host);
        await AsyncStorage.setItem('BASE_URL', host);
        await refreshLocalServerStatus();

        try {
          await serverConnection.initializePosId();
        } catch (err: any) {
          console.log('Warning: Could not fetch POS ID from server:', err?.message);
        }

        showToast('success', 'Connected to the local server.');
        if (onConnected) onConnected(host);
        onClose();
      } else {
        const lastError = serverConnection.getLastError();
        setDebugInfo(lastError ? `Failed: ${lastError}` : 'Failed: unknown error');
        showToast(
          'error',
          'Unable to reach the POS server. Please check the IP address and port are correct and try again.'
        );
      }
    } catch (err: any) {
      setDebugInfo(err?.message ? `Error: ${err.message}` : 'Error: unknown');
      showToast('error', err?.message || 'Unable to reach server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.overlay,
          { backgroundColor: colors.overlay || 'rgba(0,0,0,0.35)' },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ width: '100%' }}
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              paddingTop: insets.top + 16,
              paddingBottom: insets.bottom + 16,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <Card style={styles.card} rounded={18} padding={18}>
              <View style={styles.headerRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.title, { color: colors.text }]}>Connect to POS</Text>
                  <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Enter local server details</Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={[styles.closeBtn, { backgroundColor: colors.surfaceHover }]}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 16 }}>x</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.label, { color: colors.textSecondary }]}>Server IP Address</Text>
              <TextInput
                value={ip}
                onChangeText={setIp}
                placeholder="e.g., 192.168.1.100"
                placeholderTextColor={colors.textSecondary}
                keyboardType={Platform.OS === 'ios' ? 'url' : 'default'}
                autoCorrect={false}
                editable={!loading}
                returnKeyType="next"
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.searchBackground,
                    color: colors.text,
                  },
                ]}
              />

              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>Port (optional)</Text>
              <TextInput
                value={port}
                onChangeText={setPort}
                placeholder="e.g., 4000"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                editable={!loading}
                returnKeyType="done"
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.searchBackground,
                    color: colors.text,
                  },
                ]}
              />

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  onPress={onClose}
                  disabled={loading}
                  style={[
                    styles.secondaryBtn,
                    {
                      borderColor: colors.border,
                      opacity: loading ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    title={loading ? 'Connecting...' : 'Connect to Local Server'}
                    onPress={handleConnect}
                    loading={loading}
                  />
                </View>
              </View>

              {!!debugInfo && (
                <Text style={[styles.debugText, { color: colors.textSecondary }]}>
                  {debugInfo}
                </Text>
              )}
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
  },
  debugText: {
    marginTop: 10,
    fontSize: 11,
  },
});
