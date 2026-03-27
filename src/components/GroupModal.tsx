import React, { useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import AppBottomSheet from './AppBottomSheet';
import { useTranslation } from '../contexts/LanguageContext';

type Props = {
  visible: boolean;
  existingLabels?: string[];
  onSelect: (label: string) => void;
};

const buildAvailableLabels = (existingLabels: string[] = [], defaultLabels: string[] = []) => {
  const normalized = existingLabels.map((label) => label.toLowerCase());
  let labels = defaultLabels.filter(
    (label) => !normalized.includes(label.toLowerCase())
  );

  if (labels.length === 0) {
    const gangeLabels = existingLabels.filter((label) =>
      label.toLowerCase().includes('gange')
    );
    const maxNumber = gangeLabels.reduce((max, label) => {
      const match = label.match(/Gange\s*(\d+)$/i);
      const number = match ? parseInt(match[1], 10) : 0;
      return Math.max(max, number);
    }, 0);
    labels = [`Gange ${maxNumber + 1}`];
  }

  return labels;
};

export default function GroupModal({ visible, existingLabels = [], onSelect }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const defaultLabels = useMemo(
    () => [t('starter'), t('mainCourse'), t('dessert'), t('drinks'), t('gange')],
    [t],
  );
  const labels = useMemo(
    () => buildAvailableLabels(existingLabels, defaultLabels),
    [defaultLabels, existingLabels]
  );

  const handleClose = () => {
    onSelect(t('mainCourse'));
  };

  return (
    <AppBottomSheet
      visible={visible}
      onClose={handleClose}
      title={t('selectGroupLabel')}
      subtitle={t('chooseTheCourseLabelForThisSection')}
      snapPoints={['58%']}
    >
      <View style={styles.grid}>
        {labels.map((label) => (
          <TouchableOpacity
            key={label}
            onPress={() => onSelect(label)}
            activeOpacity={0.85}
            style={[
              styles.groupCard,
              {
                borderColor: colors.border,
                backgroundColor: colors.searchBackground || colors.surface,
              },
            ]}
          >
            <Text style={[styles.groupCardText, { color: colors.text }]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  groupCard: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 150,
    minHeight: 72,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupCardText: {
    fontWeight: '700',
    fontSize: 15,
  },
});
