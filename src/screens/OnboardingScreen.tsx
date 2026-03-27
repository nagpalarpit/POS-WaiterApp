import React, { useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { fireImpact, fireSuccessNotification } from '../components/auth/AuthPrimitives';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDE_WIDTH = Math.max(SCREEN_WIDTH, 320);

type OnboardingSlide = {
  key: string;
  title: string;
  description: string;
  eyebrow: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  accent: string;
  statLabel: string;
  statValue: string;
};

export default function OnboardingScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { t } = useTranslation();
  const listRef = useRef<FlatList<OnboardingSlide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const slides = useMemo<OnboardingSlide[]>(
    () => [
      {
        key: 'tables',
        eyebrow: t('floorReady'),
        title: t('seeOpenAndBookedTablesAtAGlance'),
        description: t('jumpStraightIntoDineInServiceWithALiveTableOverviewAndQuickOrderAccess'),
        icon: 'table-furniture',
        accent: '#10ce9e',
        statLabel: t('tableStatus'),
        statValue: t('live'),
      },
      {
        key: 'orders',
        eyebrow: t('orderFlow'),
        title: t('handleDineInDeliveryAndPickupFromOnePlace'),
        description: t('moveBetweenServiceModesWithoutLosingSpeedAndKeepEveryIncomingOrderVisible'),
        icon: 'silverware-fork-knife',
        accent: '#604be8',
        statLabel: t('serviceModes'),
        statValue: '3',
      },
      {
        key: 'checkout',
        eyebrow: t('readyToClose'),
        title: t('finishPaymentsWithLessBackAndForth'),
        description: t('stayFocusedOnServiceWhileCheckoutSplitBillsAndOrderDetailsStayWithinReach'),
        icon: 'cash-register',
        accent: '#ff9d00',
        statLabel: t('checkoutLabel'),
        statValue: t('faster'),
      },
    ],
    [t],
  );

  const userLabel = useMemo(() => {
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    return fullName || user?.email || t('guest');
  }, [t, user?.email, user?.firstName, user?.lastName]);

  const finishOnboarding = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);

    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.pendingOnboardingUser);
      fireSuccessNotification();
      navigation.replace('Dashboard');
    } catch (error) {
      console.error('Unable to finish onboarding:', error);
      navigation.replace('Dashboard');
    } finally {
      setSubmitting(false);
    }
  };

  const onSkip = () => {
    fireImpact();
    void finishOnboarding();
  };

  const onNext = () => {
    if (activeIndex >= slides.length - 1) {
      fireImpact();
      void finishOnboarding();
      return;
    }

    fireImpact();
    listRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
  };

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / SLIDE_WIDTH);
    setActiveIndex(Math.max(0, Math.min(nextIndex, slides.length - 1)));
  };

  const renderSlide = ({ item }: { item: OnboardingSlide }) => {
    const accent = item.accent;

    return (
      <View style={[styles.slide, { width: SLIDE_WIDTH }]}>
        <View style={styles.visualWrap}>
          <View style={[styles.visualOrb, styles.visualOrbLeft, { backgroundColor: `${accent}18` }]} />
          <View style={[styles.visualOrb, styles.visualOrbRight, { backgroundColor: `${colors.primary}14` }]} />

          <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: `${accent}26` }]}>
            <View style={[styles.heroBadge, { backgroundColor: `${accent}14` }]}>
              <MaterialCommunityIcons name={item.icon} size={38} color={accent} />
            </View>

            <View style={[styles.statPill, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}22` }]}>
              <Text style={[styles.statLabel, { color: colors.textSecondary || colors.text }]}>{item.statLabel}</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{item.statValue}</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.eyebrow, { color: accent }]}>{item.eyebrow}</Text>
        <Text style={[styles.slideTitle, { color: colors.text }]}>{item.title}</Text>
        <Text style={[styles.slideDescription, { color: colors.textSecondary || colors.text }]}>
          {item.description}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.backgroundOrb, styles.backgroundTop, { backgroundColor: `${colors.primary}10` }]} />
      <View style={[styles.backgroundOrb, styles.backgroundBottom, { backgroundColor: `${colors.secondary}10` }]} />

      <View style={styles.header}>
        <View>
          <Text style={[styles.welcomeEyebrow, { color: colors.primary }]}>
            {t('welcome')} {userLabel}
          </Text>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('aQuickTourBeforeServiceStarts')}</Text>
        </View>

        <TouchableOpacity
          onPress={onSkip}
          hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
          disabled={submitting}
        >
          <Text style={[styles.skipText, { color: colors.textSecondary || colors.text }]}>{t('skip')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        renderItem={renderSlide}
        onMomentumScrollEnd={onMomentumEnd}
      />

      <View style={styles.footer}>
        <View style={styles.pagination}>
          {slides.map((slide, index) => {
            const isActive = index === activeIndex;
            return (
              <View
                key={slide.key}
                style={[
                  styles.paginationDot,
                  {
                    width: isActive ? 24 : 8,
                    backgroundColor: isActive ? colors.primary : `${colors.textSecondary || colors.text}30`,
                  },
                ]}
              />
            );
          })}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={onNext}
            activeOpacity={0.9}
            disabled={submitting}
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.textInverse || '#fff' }]}>
              {activeIndex === slides.length - 1 ? t('startTakingOrdersButton') : t('continueText')}
            </Text>
            <MaterialIcons
              name={activeIndex === slides.length - 1 ? 'check-circle' : 'arrow-forward'}
              size={18}
              color={colors.textInverse || '#fff'}
            />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  backgroundOrb: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 999,
  },
  backgroundTop: {
    top: -80,
    right: -70,
  },
  backgroundBottom: {
    bottom: -110,
    left: -80,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  welcomeEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  headerTitle: {
    marginTop: 6,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    maxWidth: 280,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '700',
    paddingTop: 4,
  },
  slide: {
    paddingHorizontal: 24,
    paddingTop: 18,
  },
  visualWrap: {
    height: 320,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  visualOrb: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 999,
  },
  visualOrbLeft: {
    left: 16,
    top: 28,
  },
  visualOrbRight: {
    right: 12,
    bottom: 36,
  },
  heroCard: {
    width: '100%',
    maxWidth: 320,
    minHeight: 260,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  heroBadge: {
    width: 108,
    height: 108,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statPill: {
    marginTop: 28,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 138,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 2,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  slideTitle: {
    marginTop: 12,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
  },
  slideDescription: {
    marginTop: 14,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 330,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 22,
    paddingTop: 10,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
  },
  paginationDot: {
    height: 8,
    borderRadius: 999,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryButton: {
    flex: 1,
    borderRadius: 18,
    minHeight: 58,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
});
