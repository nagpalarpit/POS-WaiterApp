import React, { useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import AppBottomSheet from './AppBottomSheet';

type Props = {
  visible: boolean;
  existingLabels?: string[];
  onSelect: (label: string) => void;
};

const DEFAULT_LABELS = ['Starter', 'Main Course', 'Dessert', 'Drinks', 'Gange'];

const buildAvailableLabels = (existingLabels: string[] = []) => {
  const normalized = existingLabels.map((label) => label.toLowerCase());
  let labels = DEFAULT_LABELS.filter(
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
  const labels = useMemo(
    () => buildAvailableLabels(existingLabels),
    [existingLabels]
  );

  const handleClose = () => {
    onSelect('Main Course');
  };

  return (
    <AppBottomSheet
      visible={visible}
      onClose={handleClose}
      title="Select Group Label"
      subtitle="Choose the course label for this section."
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
