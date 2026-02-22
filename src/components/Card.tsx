import React from 'react';
import { View, ViewProps, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

type Props = ViewProps & {
  children: React.ReactNode;
  padding?: number | string;
  style?: StyleProp<ViewStyle>;
  rounded?: number; // border radius
};

export default function Card({ children, style, padding = 12, rounded = 12, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: rounded,
          padding,
          shadowColor: colors.border,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
