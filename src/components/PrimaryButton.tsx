import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

type Props = {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  style?: ViewStyle;
  className?: string; // allow overriding/adding classes
};

export default function PrimaryButton({ title, onPress, loading, style, className }: Props) {
  const { colors } = useTheme();
  const classes = `py-3 rounded-2xl items-center w-full ${className ?? ''}`.trim();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className={classes}
      style={[{ backgroundColor: colors.primary }, style]}
    >
      {loading ? (
        <ActivityIndicator color={colors.textInverse} />
      ) : (
        <Text style={{ color: colors.textInverse, fontWeight: '600' }}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}
