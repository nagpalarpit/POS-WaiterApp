import React, { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import {
  DEFAULT_IP,
  DEFAULT_PORT,
  fireErrorNotification,
  fireImpact,
  fireSuccessNotification,
  parseSavedUrl,
} from '../components/auth/AuthPrimitives';
import { STORAGE_KEYS } from '../constants/storageKeys';
import PrimaryButton from '../components/PrimaryButton';
import { useTheme } from '../theme/ThemeProvider';
import { useTranslation } from '../contexts/LanguageContext';
import serverConnection from '../services/serverConnection';
import { setLocalBaseUrl } from '../services/localApi';
import { useToast } from '../components/ToastProvider';
import { useConnection } from '../contexts/ConnectionProvider';

export default function IPEntryScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { refreshLocalServerStatus } = useConnection();

  const [ip, setIp] = useState(DEFAULT_IP);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => true;
      const backSub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      const navSub = navigation.addListener('beforeRemove', (e: any) => {
        const actionType = e?.data?.action?.type;
        if (actionType === 'GO_BACK' || actionType === 'POP' || actionType === 'POP_TO_TOP') {
          e.preventDefault();
        }
      });

      return () => {
        backSub.remove();
        navSub();
      };
    }, [navigation])
  );

  useEffect(() => {
    const initializeScreen = async () => {
      if (!isFocused) {
        return;
      }

      const savedUrl = serverConnection.getServerUrl();
      const parsed = parseSavedUrl(savedUrl);

      setIp(parsed?.ip || DEFAULT_IP);
      setPort(parsed?.port || DEFAULT_PORT);
      setInitialized(true);
    };

    initializeScreen();
  }, [isFocused]);

  const testConnection = async () => {
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
    setDebugInfo(`${t('testingConnection')} ${host}`);

    try {
      const success = await serverConnection.setServerUrl(host);

      if (success) {
        setDebugInfo(t('connectedSuccessfullyClosing'));
        await setLocalBaseUrl(host);
        await AsyncStorage.setItem(STORAGE_KEYS.legacyBaseUrl, host);
        await refreshLocalServerStatus();

        try {
          await serverConnection.initializePosId();
        } catch (err: any) {
          console.log('Warning: Could not fetch POS ID from server:', err?.message);
        }

        fireSuccessNotification();
        navigation.navigate('Login' as never);
        return;
      }

      const lastError = serverConnection.getLastError();
      setDebugInfo(lastError ? `${t('connectionFailed')} ${lastError}` : t('connectionFailed'));
      fireErrorNotification();
      showToast(
        'error',
        t('unableToReachTheServerCheckIpAndPortAndTryAgain')
      );
    } catch (err: any) {
      setDebugInfo(err?.message ? `${t('connectionFailed')} ${err.message}` : t('connectionFailed'));
      fireErrorNotification();
      showToast('error', err?.message || t('unableToReachServer'));
    } finally {
      setLoading(false);
    }
  };

  if (!initialized) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.surface }}
        edges={['top', 'bottom']}
      >
        <View style={styles.loadingState}>
          <Text style={{ color: colors.text }}>{t('loadingConnectionSettings')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.surface }}
      edges={['top', 'bottom']}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={[styles.logoWrap, { backgroundColor: colors.primary + '12', borderColor: colors.border }]}>
              <View style={[styles.logoInner, { backgroundColor: colors.primary + '18' }]}>
                <MaterialIcons name="settings-input-antenna" size={22} color={colors.primary} />
              </View>
            </View>

            <Text style={[styles.title, { color: colors.text }]}>{t('connectThisDevice')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary || colors.text }]}>
              {t('connectTheDeviceToTheLocalPosServiceBeforeLoggingIn')}
            </Text>
          </View>

          <View
            style={[
              styles.card,
              Platform.OS === 'android'
                ? { backgroundColor: colors.surface, elevation: 2 }
                : {
                    backgroundColor: colors.surface,
                    shadowColor: colors.border,
                    shadowOpacity: 0.05,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 },
                  },
            ]}
          >
            <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>{t('serverIpAddress')}</Text>
            <View
              style={[
                styles.inputWrap,
                { borderColor: colors.border, backgroundColor: colors.searchBackground || colors.surface },
              ]}
            >
              <MaterialIcons
                name="dns"
                size={18}
                color={colors.textSecondary || colors.text}
                style={styles.inputIcon}
              />
              <TextInput
                value={ip}
                onChangeText={setIp}
                placeholder={t('serverIpPlaceholder')}
                placeholderTextColor={colors.textSecondary || colors.text}
                keyboardType={Platform.OS === 'ios' ? 'url' : 'default'}
                style={[styles.input, { color: colors.text }]}
                returnKeyType="next"
                autoCorrect={false}
                editable={!loading}
              />
            </View>

            <Text style={[styles.label, styles.labelSpacing, { color: colors.textSecondary || colors.text }]}>
              {t('portOptional')}
            </Text>
            <View
              style={[
                styles.inputWrap,
                { borderColor: colors.border, backgroundColor: colors.searchBackground || colors.surface },
              ]}
            >
              <MaterialIcons
                name="swap-vert"
                size={18}
                color={colors.textSecondary || colors.text}
                style={styles.inputIcon}
              />
              <TextInput
                value={port}
                onChangeText={setPort}
                placeholder={t('portPlaceholder')}
                placeholderTextColor={colors.textSecondary || colors.text}
                keyboardType="numeric"
                style={[styles.input, { color: colors.text }]}
                returnKeyType="done"
                editable={!loading}
              />
            </View>

            <PrimaryButton
              title={loading ? t('connecting') : t('connectToLocalPos')}
              onPress={testConnection}
              loading={loading}
              className="mt-4"
            />

            {debugInfo ? (
              <Text style={[styles.debugText, { color: colors.textSecondary || colors.text }]}>
                {debugInfo}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  logoInner: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  labelSpacing: {
    marginTop: 16,
  },
  inputWrap: {
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    minHeight: 56,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
  debugText: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
  },
});
