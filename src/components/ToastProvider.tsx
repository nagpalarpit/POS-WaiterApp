import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Text, StyleSheet, View, TouchableOpacity, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

type ToastType = 'success' | 'error' | 'info';

type ToastContextValue = {
  showToast: (type: ToastType, message: string) => void;
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
  const [visible, setVisible] = useState(false);

  const closeModal = useCallback(() => {
    setVisible(false);
    setMessage('');
  }, []);

  const showToast = useCallback((nextType: ToastType, msg: string) => {
    if (!msg) return;
    setType(nextType || 'info');
    setMessage(msg);
    setVisible(true);
  }, []);

  const headerLabel = useMemo(() => type.toUpperCase(), [type]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.portalRoot}>
          <View style={styles.overlay}>
            <View style={[styles.card, { backgroundColor: colors.surface || '#fff' }]}>
              <Text style={[styles.header, { color: getToastColor(type, colors) }]}>
                {headerLabel}
              </Text>
              <Text style={[styles.message, { color: colors.text }]}>
                {message}
              </Text>
              <TouchableOpacity
                onPress={closeModal}
                style={[
                  styles.button,
                  {
                    backgroundColor: colors.primary,
                    marginBottom: Math.max(insets.bottom, 12),
                  },
                ]}
              >
                <Text style={[styles.buttonText, { color: colors.textInverse || '#fff' }]}>
                  OK
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { showToast: () => { } };
  }
  return ctx;
};

const styles = StyleSheet.create({
  portalRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    elevation: 99999,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6,
    alignItems: 'center',
  },
  header: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  message: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 18,
  },
  button: {
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignSelf: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
});
