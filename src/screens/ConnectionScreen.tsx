import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import serverConnection from '../services/serverConnection';
import { setLocalBaseUrl } from '../services/localApi';
import { useToast } from '../components/ToastProvider';
import { useConnection } from '../contexts/ConnectionProvider';

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
  const { showToast } = useToast();
  const { isLocalServerReachable, resumeLocalServerRetry } = useConnection();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const [ip, setIp] = useState(DEFAULT_IP);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [loading, setLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [debugTone, setDebugTone] = useState<DebugTone>('default');
  const [renderDrawer, setRenderDrawer] = useState(visible);

  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeAfterAnimationRef = useRef(false);
  const latestOnCloseRef = useRef(onClose);
  const latestOnConnectedRef = useRef(onConnected);
  const animation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    latestOnCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    latestOnConnectedRef.current = onConnected;
  }, [onConnected]);

  const drawerTranslateY = useMemo(
    () =>
      animation.interpolate({
        inputRange: [0, 1],
        outputRange: [windowHeight, 0],
      }),
    [animation, windowHeight]
  );

  const backdropOpacity = useMemo(
    () =>
      animation.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
    [animation]
  );

  const clearAutoCloseTimer = () => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  };

  const finishClose = (notifyConnected: boolean) => {
    setRenderDrawer(false);
    if (closeAfterAnimationRef.current) {
      closeAfterAnimationRef.current = false;
      latestOnCloseRef.current();
    }
    if (notifyConnected) {
      latestOnConnectedRef.current?.();
    }
  };

  const animateOpen = () => {
    closeAfterAnimationRef.current = false;
    animation.stopAnimation();
    Animated.timing(animation, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const animateClose = (notifyConnected: boolean) => {
    clearAutoCloseTimer();
    Keyboard.dismiss();
    animation.stopAnimation();
    Animated.timing(animation, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        finishClose(notifyConnected);
      }
    });
  };

  useEffect(() => {
    if (visible) {
      const currentUrl = serverConnection.getServerUrl();
      const parsed = parseSavedUrl(currentUrl);

      setIp(parsed?.ip || DEFAULT_IP);
      setPort(parsed?.port || DEFAULT_PORT);
      setDebugInfo(null);
      setDebugTone('default');
      setRenderDrawer(true);
      fireSelection();

      requestAnimationFrame(() => {
        animateOpen();
      });
      return;
    }

    if (!renderDrawer) {
      return;
    }

    closeAfterAnimationRef.current = false;
    animateClose(false);
  }, [visible]);

  useEffect(() => {
    if (!visible || loading || !isLocalServerReachable) {
      return;
    }

    setDebugTone('success');
    setDebugInfo('Local server connected. Closing...');
    clearAutoCloseTimer();

    autoCloseTimerRef.current = setTimeout(() => {
      autoCloseTimerRef.current = null;
      closeAfterAnimationRef.current = true;
      animateClose(true);
    }, AUTO_CLOSE_DELAY_MS);

    return clearAutoCloseTimer;
  }, [visible, loading, isLocalServerReachable]);

  useEffect(() => {
    return clearAutoCloseTimer;
  }, []);

  const requestClose = () => {
    if (loading) {
      return;
    }

    fireSelection();
    closeAfterAnimationRef.current = true;
    animateClose(false);
  };

  const handleConnect = async () => {
    const trimmedIp = ip.trim();
    const trimmedPort = port.trim();

    if (!trimmedIp) {
      fireErrorNotification();
      showToast('error', 'Please enter server IP');
      return;
    }

    if (trimmedPort && !/^\d+$/.test(trimmedPort)) {
      fireErrorNotification();
      showToast('error', 'Port must contain only numbers');
      return;
    }

    Keyboard.dismiss();
    const host = trimmedPort ? `http://${trimmedIp}:${trimmedPort}/` : `http://${trimmedIp}/`;

    fireImpact();
    setLoading(true);
    setDebugTone('default');
    setDebugInfo(`Testing ${host}`);

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
        setDebugInfo('Connected successfully. Closing...');
        fireSuccessNotification();
        return;
      }

      const lastError = serverConnection.getLastError();
      setDebugTone('error');
      setDebugInfo(lastError || 'Unable to reach the server.');
      fireErrorNotification();
      showToast('error', 'Failed to connect to server');
    } catch (error: any) {
      setDebugTone('error');
      setDebugInfo(error?.message || 'Connection error');
      fireErrorNotification();
      showToast('error', 'Connection error');
    } finally {
      setLoading(false);
    }
  };

  if (!renderDrawer) {
    return null;
  }

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[
          styles.backdrop,
          {
            backgroundColor: colors.overlay || 'rgba(0,0,0,0.35)',
            opacity: backdropOpacity,
          },
        ]}
      />

      <Pressable style={styles.touchLayer} onPress={requestClose} />

      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 16),
            maxHeight: Math.min(windowHeight * 0.8, 560),
            transform: [{ translateY: drawerTranslateY }],
          },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardRoot}
        >
          <View style={styles.dragHandleWrap}>
            <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />
          </View>

          <View style={styles.header}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Connect to local POS</Text>
              <Text style={[styles.headerSubtitle, { color: colors.textSecondary || colors.text }]}>
                Enter the local server details.
              </Text>
            </View>

            <TouchableOpacity
              onPress={requestClose}
              activeOpacity={0.8}
              disabled={loading}
              style={[
                styles.closeButton,
                {
                  backgroundColor: colors.surfaceHover || colors.background,
                  borderColor: colors.border,
                  opacity: loading ? 0.6 : 1,
                },
              ]}
            >
              <MaterialIcons name="close" size={18} color={colors.textSecondary || colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>Server IP Address</Text>
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
              <TextInput
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

            <Text style={[styles.label, styles.labelSpacing, { color: colors.textSecondary || colors.text }]}>
              Port (optional)
            </Text>
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
              <TextInput
                value={port}
                onChangeText={setPort}
                placeholder="e.g., 4000"
                placeholderTextColor={colors.textSecondary || colors.text}
                keyboardType="numeric"
                editable={!loading}
                style={[styles.input, { color: colors.text }]}
              />
            </View>

            <TouchableOpacity
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
                  Connecting...
                </Text>
              ) : (
                <>
                  <MaterialIcons name="wifi-tethering" size={18} color={colors.textInverse || '#fff'} />
                  <Text style={[styles.primaryButtonText, { color: colors.textInverse || '#fff' }]}>
                    Connect
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {!!debugInfo && (
              <Text
                style={[
                  styles.feedbackText,
                  {
                    color:
                      debugTone === 'error'
                        ? colors.error || colors.primary
                        : debugTone === 'success'
                          ? colors.success || colors.primary
                          : colors.textSecondary || colors.text,
                  },
                ]}
              >
                {debugInfo}
              </Text>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1400,
    elevation: 1400,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  touchLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  drawer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  keyboardRoot: {
    flexShrink: 1,
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragHandle: {
    width: 48,
    height: 5,
    borderRadius: 999,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    paddingTop: 4,
  },
  label: {
    fontSize: 13,
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
    minHeight: 54,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  primaryButton: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 8,
  },
  feedbackText: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
  },
});
