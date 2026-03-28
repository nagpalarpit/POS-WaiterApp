import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useTranslation } from '../contexts/LanguageContext';

type ComingSoonScreenProps = {
  title: string;
  description: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
};

export default function ComingSoonScreen({
  title,
  description,
  icon,
}: ComingSoonScreenProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['bottom']}
    >
      <View style={styles.container}>
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: colors.primary + '14',
              borderColor: colors.border,
            },
          ]}
        >
          <MaterialIcons name={icon} size={26} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.description, { color: colors.textSecondary || colors.text }]}>
          {description}
        </Text>

        <View
          style={[
            styles.badge,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.badgeText, { color: colors.textSecondary || colors.text }]}>
            {t('comingSoon')}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  description: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
  },
  badge: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
