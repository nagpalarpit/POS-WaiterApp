import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeProvider';
import { ThemeColors } from '../../theme/theme';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

export type AuthTone = 'default' | 'success' | 'warning' | 'error';

export const DEFAULT_IP = '127.0.0.1';
export const DEFAULT_PORT = '4000';

export const fireImpact = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
  void Haptics.impactAsync(style).catch(() => {});
};

export const fireNotification = (
  type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success
) => {
  void Haptics.notificationAsync(type).catch(() => {});
};

export const fireSuccessNotification = () => {
  fireNotification(Haptics.NotificationFeedbackType.Success);
};

export const fireErrorNotification = () => {
  fireNotification(Haptics.NotificationFeedbackType.Error);
};

export const fireSelection = () => {
  void Haptics.selectionAsync().catch(() => {});
};

export const parseSavedUrl = (value: string | null) => {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return {
      ip: url.hostname,
      port: url.port || '',
    };
  } catch (_) {
    return null;
  }
};

export const buildLocalServerUrl = (ip: string, port: string) => {
  const trimmedIp = ip.trim() || DEFAULT_IP;
  const trimmedPort = port.trim();

  return trimmedPort ? `http://${trimmedIp}:${trimmedPort}/` : `http://${trimmedIp}/`;
};

const hexToRgb = (color: string) => {
  const normalized = color.replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized;

  if (expanded.length !== 6) {
    return null;
  }

  const numeric = Number.parseInt(expanded, 16);

  if (Number.isNaN(numeric)) {
    return null;
  }

  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255,
  };
};

export const withAlpha = (color: string | undefined, opacity: number, fallback: string) => {
  if (!color) {
    return fallback;
  }

  if (color.startsWith('rgba') || color.startsWith('rgb(')) {
    return color;
  }

  const rgb = hexToRgb(color);

  if (!rgb) {
    return fallback;
  }

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
};

const getTonePalette = (colors: ThemeColors, tone: AuthTone) => {
  if (tone === 'success') {
    return {
      backgroundColor: withAlpha(colors.success, 0.12, 'rgba(16, 206, 158, 0.12)'),
      borderColor: withAlpha(colors.success, 0.22, 'rgba(16, 206, 158, 0.22)'),
      textColor: colors.success || colors.primary,
    };
  }

  if (tone === 'warning') {
    return {
      backgroundColor: withAlpha(colors.warning, 0.12, 'rgba(255, 157, 0, 0.12)'),
      borderColor: withAlpha(colors.warning, 0.22, 'rgba(255, 157, 0, 0.22)'),
      textColor: colors.warning || colors.primary,
    };
  }

  if (tone === 'error') {
    return {
      backgroundColor: withAlpha(colors.error, 0.12, 'rgba(242, 110, 115, 0.12)'),
      borderColor: withAlpha(colors.error, 0.22, 'rgba(242, 110, 115, 0.22)'),
      textColor: colors.error || colors.primary,
    };
  }

  return {
    backgroundColor: colors.surfaceHover || colors.background,
    borderColor: colors.border,
    textColor: colors.textSecondary || colors.text,
  };
};

type AuthScreenScaffoldProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: IconName;
  badgeLabel?: string;
  badgeTone?: AuthTone;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function AuthScreenScaffold({
  eyebrow,
  title,
  subtitle,
  icon,
  badgeLabel,
  badgeTone = 'default',
  children,
  footer,
}: AuthScreenScaffoldProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.screenRoot}>
      <View style={styles.screenContent}>
        <View style={styles.heroBlock}>
          <View style={styles.heroHeaderRow}>
            <View
              style={[
                styles.heroIconShell,
                {
                  backgroundColor: withAlpha(colors.primary, 0.12, 'rgba(96, 75, 232, 0.12)'),
                  borderColor: withAlpha(colors.primary, 0.18, 'rgba(96, 75, 232, 0.18)'),
                },
              ]}
            >
              <MaterialIcons name={icon} size={18} color={colors.primary} />
            </View>

            <View style={styles.heroTextBlock}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text>
              <Text style={[styles.heroTitle, { color: colors.text }]}>{title}</Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary || colors.text }]}>
                {subtitle}
              </Text>
            </View>
          </View>

          {badgeLabel ? <AuthStatusBadge label={badgeLabel} tone={badgeTone} style={styles.headerBadge} /> : null}
        </View>

        {children}
        {footer}
      </View>
    </View>
  );
}

type AuthStatusBadgeProps = {
  label: string;
  tone?: AuthTone;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
};

export function AuthStatusBadge({
  label,
  tone = 'default',
  icon,
  style,
}: AuthStatusBadgeProps) {
  const { colors } = useTheme();
  const palette = getTonePalette(colors, tone);

  return (
    <View
      style={[
        styles.statusBadge,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
        },
        style,
      ]}
    >
      {icon ? <MaterialIcons name={icon} size={14} color={palette.textColor} /> : null}
      <Text style={[styles.statusBadgeText, { color: palette.textColor }]}>{label}</Text>
    </View>
  );
}

type AuthPanelProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function AuthPanel({ children, style }: AuthPanelProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: colors.surface,
          borderColor: colors.cardBorder || colors.border,
          shadowColor: withAlpha(colors.primary, 0.16, 'rgba(96, 75, 232, 0.16)'),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

type AuthInfoCardProps = {
  icon?: IconName;
  title: string;
  description?: string;
  tone?: AuthTone;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  children?: React.ReactNode;
};

export function AuthInfoCard({
  icon,
  title,
  description,
  tone = 'default',
  style,
  titleStyle,
  children,
}: AuthInfoCardProps) {
  const { colors } = useTheme();
  const palette = getTonePalette(colors, tone);

  return (
    <View
      style={[
        styles.infoCard,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
        },
        style,
      ]}
    >
      <View style={styles.infoRow}>
        {icon ? (
          <View
            style={[
              styles.infoIconShell,
              { backgroundColor: withAlpha(palette.textColor, 0.12, palette.backgroundColor) },
            ]}
          >
            <MaterialIcons name={icon} size={18} color={palette.textColor} />
          </View>
        ) : null}

        <View style={styles.infoTextWrap}>
          <Text style={[styles.infoTitle, { color: colors.text }, titleStyle]}>{title}</Text>
          {description ? (
            <Text style={[styles.infoDescription, { color: colors.textSecondary || colors.text }]}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>

      {children ? <View style={styles.infoChildren}>{children}</View> : null}
    </View>
  );
}

type AuthInputFieldProps = TextInputProps & {
  label: string;
  hint?: string;
  leftIcon?: IconName;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

export function AuthInputField({
  label,
  hint,
  leftIcon,
  containerStyle,
  inputStyle,
  style,
  editable = true,
  ...textInputProps
}: AuthInputFieldProps) {
  const { colors } = useTheme();

  return (
    <View style={containerStyle}>
      <View style={styles.fieldHeader}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
        {hint ? (
          <Text style={[styles.fieldHint, { color: colors.textSecondary || colors.text }]}>
            {hint}
          </Text>
        ) : null}
      </View>

      <View
        style={[
          styles.fieldShell,
          {
            backgroundColor: colors.searchBackground || colors.surface,
            borderColor: colors.border,
            opacity: editable ? 1 : 0.72,
          },
          style as StyleProp<ViewStyle>,
        ]}
      >
        {leftIcon ? (
          <MaterialIcons
            name={leftIcon}
            size={18}
            color={colors.textSecondary || colors.text}
            style={styles.fieldIcon}
          />
        ) : null}

        <TextInput
          {...textInputProps}
          editable={editable}
          placeholderTextColor={colors.textSecondary || colors.text}
          selectionColor={colors.primary}
          style={[styles.fieldInput, { color: colors.text }, inputStyle]}
        />
      </View>
    </View>
  );
}

type AuthActionButtonProps = {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  variant?: 'primary' | 'secondary';
  size?: 'regular' | 'compact';
  style?: StyleProp<ViewStyle>;
};

export function AuthActionButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  icon,
  variant = 'primary',
  size = 'regular',
  style,
}: AuthActionButtonProps) {
  const { colors } = useTheme();
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.buttonBase,
        size === 'compact' ? styles.buttonCompact : styles.buttonRegular,
        isPrimary
          ? {
              backgroundColor: colors.primary,
              borderColor: colors.primary,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.16,
              shadowRadius: 16,
              elevation: 3,
            }
          : {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
        pressed && !disabled && !loading ? { opacity: 0.88 } : null,
        disabled || loading ? { opacity: 0.72 } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.textInverse || '#fff' : colors.primary} />
      ) : (
        <View style={styles.buttonContent}>
          {icon ? (
            <MaterialIcons
              name={icon}
              size={size === 'compact' ? 16 : 18}
              color={isPrimary ? colors.textInverse || '#fff' : colors.primary}
            />
          ) : null}
          <Text
            style={[
              styles.buttonText,
              size === 'compact' ? styles.buttonTextCompact : null,
              { color: isPrimary ? colors.textInverse || '#fff' : colors.text },
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    width: '100%',
    alignItems: 'center',
  },
  screenContent: {
    width: '100%',
    maxWidth: 540,
  },
  heroBlock: {
    marginBottom: 14,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  heroIconShell: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  heroTextBlock: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
  },
  heroSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  headerBadge: {
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  panel: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoIconShell: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  infoTextWrap: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  infoDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
  },
  infoChildren: {
    marginTop: 12,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  fieldHint: {
    fontSize: 12,
    fontWeight: '600',
  },
  fieldShell: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  fieldIcon: {
    marginRight: 10,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 12,
  },
  buttonBase: {
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonRegular: {
    minHeight: 48,
    paddingHorizontal: 16,
  },
  buttonCompact: {
    minHeight: 42,
    paddingHorizontal: 14,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  buttonTextCompact: {
    fontSize: 14,
  },
});
