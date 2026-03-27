import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import {
  AuthTone,
  DEFAULT_IP,
  DEFAULT_PORT,
  fireErrorNotification,
  fireImpact,
  fireSelection,
  fireSuccessNotification,
  parseSavedUrl,
} from '../components/auth/AuthPrimitives';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { useTheme } from '../theme/ThemeProvider';
import { useTranslation } from '../contexts/LanguageContext';
import serverConnection from '../services/serverConnection';
import { setLocalBaseUrl } from '../services/localApi';
import { useToast } from '../components/ToastProvider';
import { useConnection } from '../contexts/ConnectionProvider';
import AppBottomSheet from '../components/AppBottomSheet';
import AppBottomSheetTextInput from '../components/AppBottomSheetTextInput';

type ConnectionScreenProps = {
  visible: boolean;
  onClose: () => void;
  onConnected?: () => void;
};

type DebugTone = Extract<AuthTone, 'default' | 'success' | 'error'>;

const AUTO_CLOSE_DELAY_MS = 650;

export default function ConnectionScreen({
  visible,
  onClose,
  onConnected,
}: ConnectionScreenProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { isLocalServerReachable, resumeLocalServerRetry } = useConnection();

  const [ip, setIp] = useState(DEFAULT_IP);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [loading, setLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [debugTone, setDebugTone] = useState<DebugTone>('default');

  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestOnCloseRef = useRef(onClose);
  const latestOnConnectedRef = useRef(onConnected);

  useEffect(() => {
    latestOnCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    latestOnConnectedRef.current = onConnected;
  }, [onConnected]);

  const clearAutoCloseTimer = () => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (visible) {
      const currentUrl = serverConnection.getServerUrl();
      const parsed = parseSavedUrl(currentUrl);

      setIp(parsed?.ip || DEFAULT_IP);
      setPort(parsed?.port || DEFAULT_PORT);
      setDebugInfo(null);
      setDebugTone('default');
      fireSelection();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || loading || !isLocalServerReachable) {
      return;
    }

    setDebugTone('success');
    setDebugInfo(t('localServerConnectedClosing'));
    clearAutoCloseTimer();

    autoCloseTimerRef.current = setTimeout(() => {
      autoCloseTimerRef.current = null;
      latestOnConnectedRef.current?.();
      latestOnCloseRef.current();
    }, AUTO_CLOSE_DELAY_MS);

    return clearAutoCloseTimer;
  }, [visible, loading, isLocalServerReachable, t]);

  useEffect(() => {
    return clearAutoCloseTimer;
  }, []);

  const requestClose = () => {
    if (loading) {
      return;
    }

    fireSelection();
    latestOnCloseRef.current();
  };

  const handleConnect = async () => {
    const trimmedIp = ip.trim();
    const trimmedPort = port.trim();

    if (!trimmedIp) {
      fireErrorNotification();
      showToast('error', t('pleaseEnterServerIp'));
      return;
    }

    if (trimmedPort && !/^\d+$/.test(trimmedPort)) {
      fireErrorNotification();
      showToast('error', t('portMustContainOnlyNumbers'));
      return;
    }

    Keyboard.dismiss();
    const host = trimmedPort ? `http://${trimmedIp}:${trimmedPort}/` : `http://${trimmedIp}/`;

    fireImpact();
    setLoading(true);
    setDebugTone('default');
    setDebugInfo(`${t('testingConnection')} ${host}`);

    try {
      const success = await serverConnection.setServerUrl(host);

      if (success) {
        await setLocalBaseUrl(host);
        await AsyncStorage.setItem(STORAGE_KEYS.legacyBaseUrl, host);
        await resumeLocalServerRetry();

        try {
          await serverConnection.initializePosId();
        } catch (err: any) {
          console.log('Warning: Could not fetch POS ID:', err?.message);
        }

        setDebugTone('success');
        setDebugInfo(t('connectedSuccessfullyClosing'));
        fireSuccessNotification();
        return;
      }

      const lastError = serverConnection.getLastError();
      setDebugTone('error');
      setDebugInfo(lastError || t('connectionFailed'));
      fireErrorNotification();
      showToast('error', t('failedToConnectToServer'));
    } catch (error: any) {
      setDebugTone('error');
      setDebugInfo(error?.message || t('connectionError'));
      fireErrorNotification();
      showToast('error', t('connectionError'));
    } finally {
      setLoading(false);
    }
  };



  return (
    <AppBottomSheet
      visible={visible}
      onClose={requestClose}
      title={t('connectToLocalPos')}
      subtitle={t('connectTheDeviceToTheLocalPosServiceBeforeLoggingIn')}
      snapPoints={['56%']}
      footer={<TouchableOpacity
        onPress={handleConnect}
        disabled={loading}
        activeOpacity={0.85}
        style={[
          styles.primaryButton,
          {
            backgroundColor: colors.primary,
            opacity: loading ? 0.8 : 1,
          },
        ]}
      >
        {loading ? (
          <Text style={[styles.primaryButtonText, { color: colors.textInverse || '#fff' }]}>
            {t('connecting')}
          </Text>
        ) : (
          <>
            <MaterialIcons name="wifi-tethering" size={18} color={colors.textInverse || '#fff'} />
            <Text style={[styles.primaryButtonText, { color: colors.textInverse || '#fff' }]}>
              {t('connect')}
            </Text>
          </>
        )}
      </TouchableOpacity>}
    >
      <View style={styles.formSection}>
        <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>{t('serverIpAddress')}</Text>
        <View
          style={[
            styles.inputWrap,
            {
              borderColor: colors.border,
              backgroundColor: colors.searchBackground || colors.surface,
            },
          ]}
        >
          <MaterialIcons
            name="dns"
            size={18}
            color={colors.textSecondary || colors.text}
            style={styles.inputIcon}
          />
          <AppBottomSheetTextInput
            value={ip}
            onChangeText={setIp}
            placeholder="e.g., 192.168.1.100"
            placeholderTextColor={colors.textSecondary || colors.text}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.OS === 'ios' ? 'url' : 'default'}
            editable={!loading}
            style={[styles.input, { color: colors.text }]}
          />
        </View>
      </View>

      <View style={styles.formSection}>
        <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>{t('portOptional')}</Text>
        <View
          style={[
            styles.inputWrap,
            {
              borderColor: colors.border,
              backgroundColor: colors.searchBackground || colors.surface,
            },
          ]}
        >
          <MaterialIcons
            name="swap-vert"
            size={18}
            color={colors.textSecondary || colors.text}
            style={styles.inputIcon}
          />
          <AppBottomSheetTextInput
            value={port}
            onChangeText={setPort}
            placeholder="e.g., 4000"
            placeholderTextColor={colors.textSecondary || colors.text}
            keyboardType="numeric"
            editable={!loading}
            style={[styles.input, { color: colors.text }]}
          />
        </View>
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
  inputWrap: {
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  primaryButton: {
    marginTop: 6,
    minHeight: 56,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 10,
  },
  feedbackText: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
  },
});
