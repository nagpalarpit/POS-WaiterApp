import React, { useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';

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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.overlay || 'rgba(0,0,0,0.4)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 520,
            backgroundColor: colors.surface,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View>
              <Text style={{ color: colors.textSecondary, fontSize: 11, letterSpacing: 2 }}>
                GROUP
              </Text>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
                Select Group Label
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: colors.surfaceHover || colors.background,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialIcons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingVertical: 16,
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
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
