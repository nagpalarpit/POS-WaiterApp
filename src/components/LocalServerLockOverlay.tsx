import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';

type LocalServerLockOverlayProps = {
  visible: boolean;
};

export default function LocalServerLockOverlay({ visible }: LocalServerLockOverlayProps) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.8)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (!visible) {
      pulse.stopAnimation();
      overlayOpacity.stopAnimation();
      contentScale.stopAnimation();
      pulse.setValue(0.8);
      overlayOpacity.setValue(0);
      contentScale.setValue(0.92);
      return;
    }

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(contentScale, {
        toValue: 1,
        friction: 8,
        tension: 70,
        useNativeDriver: true,
      }),
    ]).start();

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.8,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
      pulse.stopAnimation();
      overlayOpacity.stopAnimation();
      contentScale.stopAnimation();
    };
  }, [contentScale, overlayOpacity, pulse, visible]);

  const iconScale = useMemo(
    () =>
      pulse.interpolate({
        inputRange: [0.8, 1],
        outputRange: [0.96, 1.08],
      }),
    [pulse]
  );

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="auto"
      style={[
        styles.overlay,
        {
          backgroundColor: 'rgba(4, 8, 16, 0.78)',
          opacity: overlayOpacity,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.content,
          {
            transform: [{ scale: contentScale }],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.iconWrap,
            {
              opacity: pulse,
              transform: [{ scale: iconScale }],
            },
          ]}
        >
          <View
            style={[
              styles.iconHalo,
              { backgroundColor: colors.error + '1F', borderColor: colors.error + '55' },
            ]}
          >
            <MaterialIcons name="portable-wifi-off" size={42} color={colors.error} />
          </View>
        </Animated.View>

        <Text style={[styles.message, { color: colors.textInverse || '#fff' }]}>
          Local POS server is unavailable.
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  content: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  iconWrap: {
    marginBottom: 18,
  },
  iconHalo: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
});
