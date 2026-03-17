import React, { ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetFooter,
  BottomSheetFooterProps,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

type AppBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  snapPoints?: Array<string | number>;
  dynamicSizing?: boolean;
  scrollable?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  enablePanDownToClose?: boolean;
  showCloseButton?: boolean;
  showHeaderDivider?: boolean;
};

export default function AppBottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  snapPoints,
  dynamicSizing = false,
  scrollable = true,
  contentContainerStyle,
  containerStyle,
  enablePanDownToClose = true,
  showCloseButton = true,
  showHeaderDivider = false,
}: AppBottomSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const modalRef = useRef<BottomSheetModal>(null);
  const isPresentedRef = useRef(false);
  const dismissRequestedByParentRef = useRef(false);

  const resolvedSnapPoints = useMemo(
    () => (dynamicSizing ? undefined : snapPoints || ['90%']),
    [dynamicSizing, snapPoints]
  );
  const maxDynamicContentSize = useMemo(
    () => Math.max(windowHeight * 0.95, 0),
    [windowHeight]
  );

  useEffect(() => {
    if (visible) {
      if (isPresentedRef.current) {
        return;
      }

      dismissRequestedByParentRef.current = false;
      isPresentedRef.current = true;
      requestAnimationFrame(() => {
        modalRef.current?.present();
      });
      return;
    }

    if (isPresentedRef.current) {
      dismissRequestedByParentRef.current = true;
      modalRef.current?.dismiss();
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    if (!isPresentedRef.current) {
      return;
    }

    isPresentedRef.current = false;
    const shouldNotifyParent = !dismissRequestedByParentRef.current;
    dismissRequestedByParentRef.current = false;
    if (shouldNotifyParent) {
      onClose();
    }
  }, [onClose]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.72}
        pressBehavior={enablePanDownToClose ? 'close' : 'none'}
      />
    ),
    [enablePanDownToClose]
  );

  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => {
      if (!footer) {
        return null;
      }

      return (
        <BottomSheetFooter
          {...props}
          bottomInset={insets.bottom}
          style={{
            ...styles.footer,
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          {footer}
        </BottomSheetFooter>
      );
    },
    [colors.border, colors.surface, footer, insets.bottom]
  );

  const header = title || subtitle ? (
    <View
      style={[
        styles.header,
        showHeaderDivider
          ? { borderBottomColor: colors.border, borderBottomWidth: 1 }
          : null,
      ]}
    >
      <View style={styles.headerTextWrap}>
        {title ? <Text style={[styles.title, { color: colors.text }]}>{title}</Text> : null}
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textSecondary || colors.text }]}>{subtitle}</Text>
        ) : null}
      </View>

      {showCloseButton ? (
        <TouchableOpacity
          onPress={() => {
            dismissRequestedByParentRef.current = false;
            modalRef.current?.dismiss();
          }}
          style={[
            styles.closeButton,
            {
              borderColor: colors.border,
              backgroundColor: colors.surfaceHover || colors.background,
            },
          ]}
        >
          <MaterialIcons name="close" size={18} color={colors.textSecondary || colors.text} />
        </TouchableOpacity>
      ) : null}
    </View>
  ) : null;

  const baseContentStyle = [
    styles.content,
    {
      paddingBottom: 12,
    },
    contentContainerStyle,
  ];

  return (
    <BottomSheetModal
      ref={modalRef}
      index={0}
      snapPoints={resolvedSnapPoints}
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      footerComponent={footer ? renderFooter : undefined}
      enablePanDownToClose={enablePanDownToClose}
      enableDynamicSizing={dynamicSizing}
      maxDynamicContentSize={maxDynamicContentSize}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      topInset={insets.top}
      handleIndicatorStyle={{ backgroundColor: colors.border, width: 42 }}
      backgroundStyle={{
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderBottomWidth: 0,
        borderColor: colors.border,
      }}
      style={containerStyle}
    >
      {scrollable ? (
        <BottomSheetScrollView
          contentContainerStyle={baseContentStyle}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          enableFooterMarginAdjustment={Boolean(footer)}
        >
          {header}
          {children}
        </BottomSheetScrollView>
      ) : (
        <BottomSheetView enableFooterMarginAdjustment={Boolean(footer)} style={baseContentStyle}>
          {header}
          {children}
        </BottomSheetView>
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 6,
    paddingBottom: 12,
    marginBottom: 8,
    // paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  footer: {
    paddingTop: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    paddingBottom: 12,
  },
});
