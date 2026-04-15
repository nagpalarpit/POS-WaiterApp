import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import AppBottomSheet from './AppBottomSheet';
import { useTheme } from '../theme/ThemeProvider';
import { useTranslation } from '../contexts/LanguageContext';

type CloverPaymentSheetProps = {
  visible: boolean;
};

export default function CloverPaymentSheet({ visible }: CloverPaymentSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <AppBottomSheet
      visible={visible}
      onClose={() => undefined}
      title={t('cloverPayment')}
      subtitle={t('cloverPaymentInProcess')}
      snapPoints={['32%']}
      scrollable={false}
      enablePanDownToClose={false}
      showCloseButton={false}
    >
      <View
        style={[
          styles.body,
          {
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.title, { color: colors.text }]}>
          {t('waitingForTerminal')}
        </Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {t('completePaymentOnTerminal')}
        </Text>
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 22,
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 14,
    textAlign: 'center',
  },
  description: {
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
});
