import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useTranslation } from '../contexts/LanguageContext';

type StartupSplashProps = {
  visible: boolean;
};

export default function StartupSplash({ visible }: StartupSplashProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const pulse = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const dots = useRef([
    new Animated.Value(0.25),
    new Animated.Value(0.25),
    new Animated.Value(0.25),
  ]).current;

  useEffect(() => {
    if (!visible) {
      return;
    }

    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const dotAnimations = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 140),
          Animated.timing(dot, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.25,
            duration: 260,
            useNativeDriver: true,
          }),
        ])
      )
    );

    pulseLoop.start();
    floatLoop.start();
    dotAnimations.forEach((animation) => animation.start());

    return () => {
      pulseLoop.stop();
      floatLoop.stop();
      dotAnimations.forEach((animation) => animation.stop());
      pulse.setValue(0);
      float.setValue(0);
      contentOpacity.setValue(0);
      dots.forEach((dot) => dot.setValue(0.25));
    };
  }, [contentOpacity, dots, float, pulse, visible]);

  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1.1],
  });

  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.5],
  });

  const badgeTranslateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });

  const captionTranslateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 6],
  });

  const dotColor = useMemo(
    () => colors.primary,
    [colors.primary]
  );

  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="auto" style={[StyleSheet.absoluteFillObject, styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.blurOrb, styles.orbLeft, { backgroundColor: `${colors.primary}15` }]} />
      <View style={[styles.blurOrb, styles.orbRight, { backgroundColor: `${colors.secondary}18` }]} />
      <View style={[styles.blurOrb, styles.orbBottom, { backgroundColor: `${colors.accent}14` }]} />

      <Animated.View
        style={[
          styles.content,
          {
            opacity: contentOpacity,
            transform: [{ translateY: captionTranslateY }],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.halo,
            {
              backgroundColor: `${colors.primary}18`,
              opacity: haloOpacity,
              transform: [{ scale: haloScale }],
            },
          ]}
        />

        <Animated.View
          style={[
            styles.badge,
            {
              backgroundColor: colors.surface,
              borderColor: `${colors.primary}22`,
              transform: [{ translateY: badgeTranslateY }],
            },
          ]}
        >
          <View style={[styles.badgeGlow, { backgroundColor: `${colors.primary}12` }]} />
          <Image source={require('../../assets/splash-icon.png')} style={styles.logo} resizeMode="contain" />
        </Animated.View>

        <View style={[styles.pill, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}22` }]}>
          <MaterialCommunityIcons name="silverware-fork-knife" size={14} color={colors.primary} />
          <Text style={[styles.pillText, { color: colors.primary }]}>{t('waiterExperience')}</Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{t('fastTablesCleanHandoff')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary || colors.text }]}>
          {t('preparingRestaurantDashboardAndLiveOrderSync')}
        </Text>

        <View style={styles.dots}>
          {dots.map((dot, index) => (
            <Animated.View
              key={`splash-dot-${index}`}
              style={[
                styles.dot,
                {
                  backgroundColor: dotColor,
                  opacity: dot,
                  transform: [
                    {
                      scale: dot.interpolate({
                        inputRange: [0.25, 1],
                        outputRange: [0.92, 1.15],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 50,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  content: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  blurOrb: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
  },
  orbLeft: {
    top: -40,
    left: -70,
  },
  orbRight: {
    top: 100,
    right: -90,
  },
  orbBottom: {
    bottom: -50,
    left: 30,
  },
  halo: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 999,
  },
  badge: {
    width: 132,
    height: 132,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 24,
    overflow: 'hidden',
  },
  badgeGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 38,
  },
  logo: {
    width: 84,
    height: 84,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 18,
    gap: 6,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 290,
    marginTop: 12,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 22,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
});
