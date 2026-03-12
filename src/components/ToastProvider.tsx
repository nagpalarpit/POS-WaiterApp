import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Text, StyleSheet, Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

type ToastType = 'success' | 'error' | 'info';
type ToastOptions = {
  type?: ToastType;
  durationMs?: number;
};

type ToastContextValue = {
  showToast: (message: string, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const getToastColor = (type: ToastType, colors: any) => {
  if (type === 'success') return colors.success || colors.primary;
  if (type === 'error') return colors.error || '#d32f2f';
  return colors.info || colors.primary;
};

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [type, setType] = useState<ToastType>('info');
  const anim = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const showToast = useCallback(
    (msg: string, options?: ToastOptions) => {
      if (!msg) return;
      const nextType = options?.type || 'info';
      const durationMs = options?.durationMs ?? 1400;

      setMessage(msg);
      setType(nextType);

      anim.stopAnimation();
      Animated.timing(anim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start(() => {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => {
          Animated.timing(anim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setMessage('');
          });
        }, durationMs);
      });
    },
    [anim],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message ? (
        <Modal transparent visible statusBarTranslucent>
          <View pointerEvents="none" style={{ flex: 1 }}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.toast,
                {
                  top: insets.top + 12,
                  backgroundColor: getToastColor(type, colors),
                  opacity: anim,
                  transform: [
                    {
                      translateY: anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-6, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={{ color: colors.textInverse || '#fff', fontWeight: '700', fontSize: 12 }}>
                {message}
              </Text>
            </Animated.View>
          </View>
        </Modal>
      ) : null}
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { showToast: () => {} };
  }
  return ctx;
};

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    zIndex: 9999,
    elevation: 8,
    alignItems: 'center',
  },
});
