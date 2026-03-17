import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

type BottomDrawerProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  footer?: React.ReactNode;
  scrollable?: boolean;
  fullHeight?: boolean;
  maxHeightRatio?: number;
  closeDisabled?: boolean;
  disableBackdropClose?: boolean;
  drawerStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  footerStyle?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
  scrollViewProps?: Omit<
    ScrollViewProps,
    'children' | 'contentContainerStyle' | 'style'
  >;
  scrollViewRef?: React.RefObject<ScrollView | null>;
};

export default function BottomDrawer({
  visible,
  onClose,
  children,
  title,
  subtitle,
  eyebrow,
  footer,
  scrollable = true,
  fullHeight = false,
  maxHeightRatio = 0.86,
  closeDisabled = false,
  disableBackdropClose = false,
  drawerStyle,
  contentContainerStyle,
  bodyStyle,
  footerStyle,
  keyboardVerticalOffset = 0,
  scrollViewProps,
  scrollViewRef,
}: BottomDrawerProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [renderDrawer, setRenderDrawer] = useState(visible);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [focusedWithinDrawer, setFocusedWithinDrawer] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);
  const animation = useRef(new Animated.Value(0)).current;
  const latestOnCloseRef = useRef(onClose);
  const requestedCloseRef = useRef(false);
  const internalScrollRef = useRef<ScrollView | null>(null);
  const currentScrollYRef = useRef(0);
  const focusScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestOnCloseRef.current = onClose;
  }, [onClose]);

  const clearFocusScrollTimer = () => {
    if (focusScrollTimerRef.current) {
      clearTimeout(focusScrollTimerRef.current);
      focusScrollTimerRef.current = null;
    }
  };

  const scrollFocusedInputIntoView = () => {
    const scrollNode = internalScrollRef.current || scrollViewRef?.current;
    const focusedInput = TextInput.State.currentlyFocusedInput?.();
    if (!scrollNode || !focusedInput || typeof focusedInput.measureInWindow !== 'function') {
      return;
    }

    focusedInput.measureInWindow((_x: number, y: number, _width: number, height: number) => {
      const footerOffset = footer ? footerHeight : 0;
      const visibleBottom =
        windowHeight - Math.max(keyboardHeight, 0) - footerOffset - 24;
      const inputBottom = y + height;
      const overflow = inputBottom - visibleBottom;

      if (overflow > 0) {
        scrollNode.scrollTo({
          y: Math.max(0, currentScrollYRef.current + overflow + 20),
          animated: true,
        });
        return;
      }

      const visibleTop = 20;
      const underflow = visibleTop - y;
      if (underflow > 0) {
        scrollNode.scrollTo({
          y: Math.max(0, currentScrollYRef.current - underflow - 20),
          animated: true,
        });
      }
    });
  };

  const scheduleFocusedInputScroll = (delay = 80) => {
    clearFocusScrollTimer();
    focusScrollTimerRef.current = setTimeout(() => {
      focusScrollTimerRef.current = null;
      scrollFocusedInputIntoView();
    }, delay);
  };

  const drawerTranslateY = useMemo(
    () =>
      animation.interpolate({
        inputRange: [0, 1],
        outputRange: [windowHeight, 0],
      }),
    [animation, windowHeight],
  );

  const backdropOpacity = useMemo(
    () =>
      animation.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
    [animation],
  );

  const animateOpen = () => {
    requestedCloseRef.current = false;
    animation.stopAnimation();
    Animated.timing(animation, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const finishClose = () => {
    setRenderDrawer(false);
    if (requestedCloseRef.current) {
      requestedCloseRef.current = false;
      latestOnCloseRef.current();
    }
  };

  const animateClose = () => {
    Keyboard.dismiss();
    animation.stopAnimation();
    Animated.timing(animation, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        finishClose();
      }
    });
  };

  useEffect(() => {
    if (visible) {
      setRenderDrawer(true);
      requestAnimationFrame(animateOpen);
      return;
    }

    clearFocusScrollTimer();
    setKeyboardHeight(0);
    setFocusedWithinDrawer(false);

    if (renderDrawer) {
      requestedCloseRef.current = false;
      animateClose();
    }
  }, [visible]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleKeyboardShow = (event: any) => {
      setKeyboardHeight(event?.endCoordinates?.height || 0);
      scheduleFocusedInputScroll(60);
    };

    const handleKeyboardHide = () => {
      setKeyboardHeight(0);
      setFocusedWithinDrawer(false);
    };

    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEvent, handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      clearFocusScrollTimer();
    };
  }, [footerHeight, windowHeight]);

  const requestClose = () => {
    if (closeDisabled) {
      return;
    }

    requestedCloseRef.current = true;
    animateClose();
  };

  if (!renderDrawer) {
    return null;
  }

  const shouldExpandDrawer = fullHeight || focusedWithinDrawer || keyboardHeight > 0;
  const resolvedMaxHeight = shouldExpandDrawer
    ? Math.max(windowHeight - insets.top - 16, 320)
    : Math.min(windowHeight * maxHeightRatio, windowHeight - insets.top - 16);

  const contentBottomPadding = footer
    ? 12
    : Math.max(insets.bottom, 16) + 12;

  const handleInputInteractionStart = () => {
    setFocusedWithinDrawer(true);
    scheduleFocusedInputScroll(90);
    return false;
  };

  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      onRequestClose={requestClose}
    >
      <View style={styles.root} pointerEvents="box-none">
        <Animated.View
          pointerEvents="none"
          style={[
            styles.backdrop,
            {
              backgroundColor: colors.overlay || 'rgba(0,0,0,0.45)',
              opacity: backdropOpacity,
            },
          ]}
        />

        <Pressable
          style={styles.touchLayer}
          disabled={disableBackdropClose || closeDisabled}
          onPress={requestClose}
        />

        <Animated.View
          style={[
            styles.drawer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              maxHeight: resolvedMaxHeight,
              transform: [{ translateY: drawerTranslateY }],
            },
            drawerStyle,
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={keyboardVerticalOffset}
            style={styles.keyboardRoot}
          >
            <View style={styles.dragHandleWrap}>
              <View
                style={[styles.dragHandle, { backgroundColor: colors.border }]}
              />
            </View>

            {title || subtitle || eyebrow ? (
              <View style={styles.header}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  {eyebrow ? (
                    <Text
                      style={[
                        styles.eyebrow,
                        { color: colors.textSecondary || colors.text },
                      ]}
                    >
                      {eyebrow}
                    </Text>
                  ) : null}
                  {title ? (
                    <Text style={[styles.title, { color: colors.text }]}>
                      {title}
                    </Text>
                  ) : null}
                  {subtitle ? (
                    <Text
                      style={[
                        styles.subtitle,
                        { color: colors.textSecondary || colors.text },
                      ]}
                    >
                      {subtitle}
                    </Text>
                  ) : null}
                </View>

                <TouchableOpacity
                  onPress={requestClose}
                  disabled={closeDisabled}
                  activeOpacity={0.8}
                  style={[
                    styles.closeButton,
                    {
                      backgroundColor:
                        colors.surfaceHover || colors.background,
                      borderColor: colors.border,
                      opacity: closeDisabled ? 0.5 : 1,
                    },
                  ]}
                >
                  <MaterialIcons
                    name="close"
                    size={18}
                    color={colors.textSecondary || colors.text}
                  />
                </TouchableOpacity>
              </View>
            ) : null}

            {scrollable ? (
              <ScrollView
                ref={internalScrollRef}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                automaticallyAdjustKeyboardInsets
                showsVerticalScrollIndicator={false}
                style={styles.scroll}
                onScroll={(event) => {
                  currentScrollYRef.current =
                    event.nativeEvent.contentOffset.y || 0;
                  scrollViewProps?.onScroll?.(event);
                }}
                scrollEventThrottle={16}
                contentContainerStyle={[
                  styles.contentContainer,
                  footer ? styles.contentContainerWithFooter : null,
                  { paddingBottom: contentBottomPadding },
                  contentContainerStyle,
                ]}
                {...scrollViewProps}
              >
                <View
                  onStartShouldSetResponderCapture={
                    handleInputInteractionStart
                  }
                >
                  {children}
                </View>
              </ScrollView>
            ) : (
              <View
                style={[
                  styles.body,
                  { paddingBottom: Math.max(insets.bottom, 16) + 12 },
                  bodyStyle,
                ]}
                onStartShouldSetResponderCapture={
                  handleInputInteractionStart
                }
              >
                {children}
              </View>
            )}

            {footer ? (
              <View
                style={[
                  styles.footer,
                  {
                    borderTopColor: colors.border,
                    paddingBottom: Math.max(insets.bottom, 16),
                  },
                  footerStyle,
                ]}
                onLayout={(event) => {
                  setFooterHeight(event.nativeEvent.layout.height);
                }}
              >
                {footer}
              </View>
            ) : null}
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  touchLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  drawer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 18,
  },
  keyboardRoot: {
    flexShrink: 1,
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragHandle: {
    width: 48,
    height: 5,
    borderRadius: 999,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
  },
  contentContainer: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 18,
  },
  contentContainerWithFooter: {
    paddingBottom: 12,
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 18,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
});
