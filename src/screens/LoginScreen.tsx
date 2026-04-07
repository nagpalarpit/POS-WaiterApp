import React, { useCallback, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import {
  fireErrorNotification,
  fireImpact,
  fireSuccessNotification,
} from '../components/auth/AuthPrimitives';
import PrimaryButton from '../components/PrimaryButton';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { useTheme } from '../theme/ThemeProvider';
import { useConnection } from '../contexts/ConnectionProvider';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ToastProvider';
import { fetchDiscountsForCompany } from '../services/discountService';
import { useTranslation } from '../contexts/LanguageContext';

export default function LoginScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { login, isLoading } = useAuth();
  const { isLocalServerReachable } = useConnection();
  const { showToast } = useToast();
  const { t } = useTranslation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => true;
      const backSub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      const navSub = navigation.addListener('beforeRemove', (e: any) => {
        const actionType = e?.data?.action?.type;
        if (actionType === 'GO_BACK' || actionType === 'POP_TO_TOP') {
          e.preventDefault();
        }
      });

      return () => {
        backSub.remove();
        navSub();
      };
    }, [navigation])
  );

  const doLogin = async () => {
    if (!username.trim() || !password.trim()) {
      fireErrorNotification();
      showToast('error', t('enterUsernameAndPassword'));
      return;
    }

    if (!isLocalServerReachable) {
      fireErrorNotification();
      showToast('info', t('connectToLocalServerBeforeLoggingIn'));
      return;
    }

    Keyboard.dismiss();
    fireImpact();

    try {
      const result = await login(username.trim(), password.trim());

        if (!result.success) {
          fireErrorNotification();
          showToast('error', result.error || t('login'));
          return;
        }

      fireSuccessNotification();

      try {
        const userData = await AsyncStorage.getItem(STORAGE_KEYS.authUser);
        if (userData) {
          const user = JSON.parse(userData);
          const companyId = Number(
            user?.companyId || user?.company?.id || user?.company?.companyId || 0
          );
          if (companyId) {
            fetchDiscountsForCompany(companyId).catch((error) => {
              console.log('LoginScreen: Unable to preload discounts:', error?.message || error);
            });
          }
        }
      } catch (storageError) {
        console.error('Error preloading data:', storageError);
      }

    } catch (err: any) {
      fireErrorNotification();
      showToast('error', err?.message || t('unableToProcessPayment'));
    }
  };

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
                <MaterialIcons name="lock-person" size={22} color={colors.primary} />
              </View>
            </View>

            <Text style={[styles.title, { color: colors.text }]}>{t('welcomeWaiter')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary || colors.text }]}>
              {t('logIntoYourAccount')}
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
            <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>{t('email')}</Text>
            <View
              style={[
                styles.inputWrap,
                { borderColor: colors.border, backgroundColor: colors.searchBackground || colors.surface },
              ]}
            >
              <MaterialIcons
                name="alternate-email"
                size={18}
                color={colors.textSecondary || colors.text}
                style={styles.inputIcon}
              />
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder={t('enterYourEmail')}
                placeholderTextColor={colors.textSecondary || colors.text}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { color: colors.text }]}
                editable={!isLoading}
              />
            </View>

            <Text style={[styles.label, styles.labelSpacing, { color: colors.textSecondary || colors.text }]}>
              {t('password')}
            </Text>
            <View
              style={[
                styles.inputWrap,
                { borderColor: colors.border, backgroundColor: colors.searchBackground || colors.surface },
              ]}
            >
              <MaterialIcons
                name="key"
                size={18}
                color={colors.textSecondary || colors.text}
                style={styles.inputIcon}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={t('enterYourPassword')}
                placeholderTextColor={colors.textSecondary || colors.text}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { color: colors.text }]}
                editable={!isLoading}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                disabled={isLoading}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.trailingIconButton}
              >
                <MaterialIcons
                  name={showPassword ? 'visibility-off' : 'visibility'}
                  size={20}
                  color={colors.textSecondary || colors.text}
                />
              </TouchableOpacity>
            </View>

            <PrimaryButton
              title={isLoading ? t('loading') : t('login')}
              onPress={doLogin}
              loading={isLoading}
              className="mt-4"
            />

            {!isLocalServerReachable ? (
              <Text style={[styles.helperText, { color: colors.textSecondary || colors.text }]}>
                {t('connectTheDeviceToTheLocalPosServiceBeforeLoggingIn')}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  trailingIconButton: {
    marginLeft: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
  helperText: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
  },
});
