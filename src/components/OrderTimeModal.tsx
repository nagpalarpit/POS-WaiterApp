import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AppBottomSheet from './AppBottomSheet';
import AppBottomSheetTextInput from './AppBottomSheetTextInput';
import { useTheme } from '../theme/ThemeProvider';
import { useToast } from './ToastProvider';
import { OrderServiceTiming } from '../types/orderFlow';
import { useTranslation } from '../contexts/LanguageContext';

type Props = {
  visible: boolean;
  deliveryType: number;
  initialValue?: OrderServiceTiming | null;
  onClose: () => void;
  onSave: (value: OrderServiceTiming) => void;
};

const pad = (value: number) => String(value).padStart(2, '0');

const formatDuration = (hours: number, minutes: number) =>
  `${pad(hours)}:${pad(minutes)}`;

const parseDuration = (value: string) => {
  const [hoursRaw, minutesRaw] = String(value || '00:15').split(':');
  const hours = Math.max(0, parseInt(hoursRaw || '0', 10) || 0);
  const minutes = Math.max(0, parseInt(minutesRaw || '0', 10) || 0);
  return { hours, minutes };
};

const formatOrderDateTime = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

const buildScheduledDateTime = (hours: number, minutes: number) => {
  const scheduledDate = new Date();
  scheduledDate.setHours(scheduledDate.getHours() + hours);
  scheduledDate.setMinutes(scheduledDate.getMinutes() + minutes);
  return formatOrderDateTime(scheduledDate);
};

const formatPreviewTime = (dateTime?: string | null, asapLabel = '', scheduledLabel = '') => {
  if (!dateTime) return asapLabel;
  const normalized = String(dateTime).replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return scheduledLabel;
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function OrderTimeModal({
  visible,
  deliveryType,
  initialValue,
  onClose,
  onSave,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [familyName, setFamilyName] = useState('');
  const [isManualTime, setIsManualTime] = useState(false);
  const [durationValue, setDurationValue] = useState('00:15');
  const [manualHour, setManualHour] = useState('');
  const [manualMinute, setManualMinute] = useState('');

  useEffect(() => {
    if (!visible) return;

    setFamilyName(initialValue?.familyName || '');
    setIsManualTime(false);
    setManualHour('');
    setManualMinute('');

    if (initialValue?.pickupDateTime) {
      const normalized = initialValue.pickupDateTime.replace(' ', 'T');
      const target = new Date(normalized);
      if (!Number.isNaN(target.getTime())) {
        const diffMs = target.getTime() - Date.now();
        const diffMinutes = Math.max(Math.ceil(diffMs / 60000), 0);
        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;
        setDurationValue(formatDuration(hours, minutes));
        return;
      }
    }

    setDurationValue('00:15');
  }, [initialValue, visible]);

  const isPickup = deliveryType === 2;
  const modalTitle = isPickup ? t('addPickupTime') : t('addDeliveryTime');
  const modalSubtitle = isPickup
    ? t('setPickupTimingAndOptionalFamilyNameBeforeOpeningTheMenu')
    : t('setDeliveryTimingBeforeOpeningTheMenu');
  const snapPoints = isPickup ? ['84%'] : ['74%'];
  const timePreview = useMemo(
    () => formatPreviewTime(initialValue?.pickupDateTime, t('asap'), t('scheduled')),
    [initialValue?.pickupDateTime, t],
  );

  const parsedManualHour = parseInt(manualHour || '0', 10);
  const parsedManualMinute = parseInt(manualMinute || '0', 10);
  const isManualValid =
    manualHour.trim() !== '' &&
    manualMinute.trim() !== '' &&
    Number.isFinite(parsedManualHour) &&
    Number.isFinite(parsedManualMinute) &&
    parsedManualHour >= 0 &&
    parsedManualHour <= 23 &&
    parsedManualMinute >= 0 &&
    parsedManualMinute <= 59;

  const adjustDuration = (deltaMinutes: number) => {
    const { hours, minutes } = parseDuration(durationValue);
    const totalMinutes = Math.max(hours * 60 + minutes + deltaMinutes, 0);
    const nextHours = Math.floor(totalMinutes / 60);
    const nextMinutes = totalMinutes % 60;
    setDurationValue(formatDuration(nextHours, nextMinutes));
  };

  const handleReset = () => {
    setIsManualTime(false);
    setManualHour('');
    setManualMinute('');
    setDurationValue('00:15');
    setFamilyName(initialValue?.familyName || '');
  };

  const handleAsap = () => {
    onSave({
      pickupDateTime: null,
      familyName: familyName.trim(),
    });
    onClose();
  };

  const handleSave = () => {
    if (isManualTime && !isManualValid) {
      showToast('error', t('enterValidHourAndMinute'));
      return;
    }

    const nextValue = isManualTime
      ? buildScheduledDateTime(parsedManualHour, parsedManualMinute)
      : (() => {
          const { hours, minutes } = parseDuration(durationValue);
          return buildScheduledDateTime(hours, minutes);
        })();

    onSave({
      pickupDateTime: nextValue,
      familyName: familyName.trim(),
    });
    onClose();
  };

  const footer = (
    <View style={styles.footerActions}>
      <TouchableOpacity
        onPress={onClose}
        activeOpacity={0.85}
        style={[
          styles.secondaryButton,
          {
            borderColor: colors.border,
            backgroundColor: colors.searchBackground || colors.surface,
          },
        ]}
      >
        <Text style={[styles.secondaryButtonText, { color: colors.textSecondary || colors.text }]}>
          {t('cancel')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleSave}
        activeOpacity={0.85}
        style={[
          styles.primaryButton,
          {
            backgroundColor: colors.primary,
            opacity: isManualTime && !isManualValid ? 0.5 : 1,
          },
        ]}
      >
        <Text style={[styles.primaryButtonText, { color: colors.textInverse || '#fff' }]}>
          {t('save')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title={modalTitle}
      subtitle={modalSubtitle}
      snapPoints={snapPoints}
      footer={footer}
    >
      {isPickup ? (
        <View style={styles.formSection}>
          <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>
            {t('familyName')}
          </Text>
          <View
            style={[
              styles.inputWrap,
              {
                borderColor: colors.border,
                backgroundColor: colors.searchBackground || colors.surface,
              },
            ]}
          >
            <MaterialIcons
              name="group"
              size={18}
              color={colors.textSecondary || colors.text}
              style={styles.inputIcon}
            />
            <AppBottomSheetTextInput
              value={familyName}
              onChangeText={setFamilyName}
              placeholder={t('enterFamilyName')}
              placeholderTextColor={colors.textSecondary || colors.text}
              style={[styles.input, { color: colors.text }]}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.formSection}>
        <View style={styles.rowBetween}>
          <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>
            {t('setTimeManually')}
          </Text>
          <Switch
            value={isManualTime}
            onValueChange={setIsManualTime}
            trackColor={{ false: colors.border, true: `${colors.primary}66` }}
            thumbColor={isManualTime ? colors.primary : colors.surface}
          />
        </View>
      </View>

      <View style={[styles.previewCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Text style={{ color: colors.textSecondary || colors.text, fontSize: 12, fontWeight: '600' }}>
          {t('currentSelection')}
        </Text>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 6 }}>
          {timePreview}
        </Text>
        {isPickup && familyName.trim() ? (
          <Text style={{ color: colors.textSecondary || colors.text, fontSize: 12, marginTop: 4 }}>
            {t('family')}: {familyName.trim()}
          </Text>
        ) : null}
      </View>

      <View style={styles.inlineActions}>
        <TouchableOpacity
          onPress={handleAsap}
          activeOpacity={0.85}
          style={[
            styles.asapButton,
            {
              borderColor: colors.primary,
              backgroundColor: `${colors.primary}15`,
            },
          ]}
        >
          <Text style={{ color: colors.primary, fontWeight: '800' }}>{t('asap')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleReset}
          activeOpacity={0.85}
          style={[
            styles.resetButton,
            {
              borderColor: colors.border,
              backgroundColor: colors.searchBackground || colors.surface,
            },
          ]}
        >
          <Text style={{ color: colors.textSecondary || colors.text, fontWeight: '700' }}>
            {t('reset')}
          </Text>
        </TouchableOpacity>
      </View>

      {!isManualTime ? (
        <View style={styles.formSection}>
          <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>
            {t('time')}
          </Text>
          <View
            style={[
              styles.inputWrap,
              {
                borderColor: colors.border,
                backgroundColor: colors.searchBackground || colors.surface,
              },
            ]}
          >
            <MaterialIcons
              name="schedule"
              size={18}
              color={colors.textSecondary || colors.text}
              style={styles.inputIcon}
            />
            <Text style={[styles.input, { color: colors.text, paddingTop: 14, paddingBottom: 14 }]}>
              {durationValue}
            </Text>
          </View>

          <View style={styles.timeAdjustRow}>
            <TouchableOpacity
              onPress={() => adjustDuration(-15)}
              activeOpacity={0.85}
              style={[
                styles.adjustButton,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.searchBackground || colors.surface,
                },
              ]}
            >
              <MaterialIcons name="remove" size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => adjustDuration(15)}
              activeOpacity={0.85}
              style={[
                styles.adjustButton,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.searchBackground || colors.surface,
                },
              ]}
            >
              <MaterialIcons name="add" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.manualGrid}>
          <View style={[styles.formSection, styles.manualCell]}>
            <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>
              {t('hour')}
            </Text>
            <View
              style={[
                styles.inputWrap,
                {
                  borderColor:
                    manualHour.trim() === '' || (isManualValid || !isManualTime)
                      ? colors.border
                      : colors.error || colors.border,
                  backgroundColor: colors.searchBackground || colors.surface,
                },
              ]}
            >
              <AppBottomSheetTextInput
                value={manualHour}
                onChangeText={setManualHour}
                keyboardType="number-pad"
                placeholder="00"
                placeholderTextColor={colors.textSecondary || colors.text}
                style={[styles.input, { color: colors.text, textAlign: 'center' }]}
              />
            </View>
          </View>

          <View style={[styles.formSection, styles.manualCell]}>
            <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>
              {t('minutes')}
            </Text>
            <View
              style={[
                styles.inputWrap,
                {
                  borderColor:
                    manualMinute.trim() === '' || (isManualValid || !isManualTime)
                      ? colors.border
                      : colors.error || colors.border,
                  backgroundColor: colors.searchBackground || colors.surface,
                },
              ]}
            >
              <AppBottomSheetTextInput
                value={manualMinute}
                onChangeText={setManualMinute}
                keyboardType="number-pad"
                placeholder="15"
                placeholderTextColor={colors.textSecondary || colors.text}
                style={[styles.input, { color: colors.text, textAlign: 'center' }]}
              />
            </View>
          </View>
        </View>
      )}
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  formSection: {
    marginBottom: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  inputWrap: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  inlineActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  asapButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeAdjustRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  adjustButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  manualCell: {
    flex: 1,
  },
  footerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 0.42,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
});
