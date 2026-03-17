import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import BottomDrawer from './BottomDrawer';

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

export default function GroupModal({
  visible,
  existingLabels = [],
  onSelect,
}: Props) {
  const { colors } = useTheme();
  const labels = useMemo(
    () => buildAvailableLabels(existingLabels),
    [existingLabels]
  );

  const handleClose = () => {
    onSelect('Main Course');
  };

  return (
    <BottomDrawer
      visible={visible}
      onClose={handleClose}
      eyebrow="GROUP"
      title="Select Group Label"
      maxHeightRatio={0.62}
    >
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        {labels.map((label) => (
          <TouchableOpacity
            key={label}
            onPress={() => onSelect(label)}
            style={{
              flexGrow: 1,
              flexBasis: '45%',
              minWidth: 150,
              paddingVertical: 16,
              paddingHorizontal: 12,
              borderRadius: 14,
              borderWidth: 2,
              borderColor: colors.border,
              backgroundColor: colors.backgroundSecondary || colors.surface,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </BottomDrawer>
  );
}
