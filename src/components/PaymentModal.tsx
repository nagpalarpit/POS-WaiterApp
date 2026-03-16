import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import Card from "./Card";
import { formatCurrency } from "../utils/currency";
import giftCardService from "../services/giftCardService";
import { useToast } from "./ToastProvider";

type PaymentDetail = {
  paymentProcessorId: number;
  paymentTotal: number;
};

type SplitSelectableItem = {
  key: string;
  name: string;
  quantity: number;
  unitTotal: number;
};

type GiftCard = {
  id?: number | string;
  couponCode?: string;
  code?: string;
  cardCode?: string;
  giftCardCode?: string;
  remainingBalance?: number;
  serviceValuePrice?: number;
  startDate?: string;
  expiryDate?: string;
  [key: string]: any;
};

type PaymentOption = {
  id: number;
  label: string;
  paymentMethod?: number;
  tip?: number;
  giftCard?: GiftCard | null;
  giftCardTotal?: number;
  cashProvided?: number;
  isCorporate?: boolean;
  orderPaymentSummary?: { paymentProcessorId: number };
  orderPaymentDetails?: PaymentDetail[];
  isItemSplit?: boolean;
  splitSelections?: number[];
  splitItemTotal?: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (
    option: PaymentOption & { print?: boolean },
  ) => void | Promise<void>;
  onPrintPreview?: (
    option: PaymentOption & { print?: boolean; preview?: boolean },
  ) => void | Promise<void>;
  hidePrintPreview?: boolean;
  orderTotal?: number;
  companyId?: number;
  splitItems?: SplitSelectableItem[];
  allowSplitOption?: boolean;
  isBlocked?: boolean;
  blockTitle?: string;
  blockMessage?: string;
  onReconnect?: () => void | Promise<void>;
  reconnectLabel?: string;
  isReconnecting?: boolean;
};

const toAmount = (value: string): number => {
  const parsed = parseFloat(value || "0");
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
};

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
};

const toStartOfDay = (value?: string | number | Date | null): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const formatDate = (date?: Date | null): string => {
  if (!date) return "";
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

const getGiftCardDiscount = (
  giftCard: GiftCard | null,
  total: number,
): number => {
  if (!giftCard) return 0;
  const remainingBalance = toNumber((giftCard as any).remainingBalance, 0);
  const serviceValuePrice = toNumber((giftCard as any).serviceValuePrice, 0);
  if (remainingBalance <= 0) {
    return Math.min(serviceValuePrice, total);
  }
  return Math.min(remainingBalance, total);
};

const round2 = (value: number): number => Number(value.toFixed(2));

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export default function PaymentModal({
  visible,
  onClose,
  onSelect,
  onPrintPreview,
  hidePrintPreview = false,
  orderTotal = 0,
  companyId,
  splitItems = [],
  allowSplitOption = true,
  isBlocked = false,
  blockTitle = "Local Server Offline",
  blockMessage = "Internet is available, but the local server is disconnected. Reconnect to continue payment.",
  onReconnect,
  reconnectLabel = "Connect",
  isReconnecting = false,
}: Props) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const primaryTabs = useMemo(
    () => [
      { id: 0, label: "Cash" },
      { id: 1, label: "Card" },
      ...(allowSplitOption ? [{ id: 3, label: "Split" }] : []),
      { id: 99, label: "Other" },
    ],
    [allowSplitOption],
  );

  const otherMethods: PaymentOption[] = [
    { id: 5, label: "Debitor" },
    { id: 6, label: "Liefernado" },
    { id: 7, label: "Uber" },
    { id: 8, label: "Wolt" },
    { id: 9, label: "Bolt" },
    { id: 10, label: "Schlemmerblock" },
  ];

  const [activeTab, setActiveTab] = useState<number>(0);
  const [tipValue, setTipValue] = useState("");
  const [giftCode, setGiftCode] = useState("");
  const [splitGiftCode, setSplitGiftCode] = useState("");
  const [appliedGiftCard, setAppliedGiftCard] = useState<GiftCard | null>(null);
  const [appliedSplitGiftCard, setAppliedSplitGiftCard] =
    useState<GiftCard | null>(null);
  const [isApplyingGiftCard, setIsApplyingGiftCard] = useState(false);
  const [cashProvided, setCashProvided] = useState("");
  const [selectedOtherMethod, setSelectedOtherMethod] = useState<number>(5);
  const [splitSelections, setSplitSelections] = useState<number[]>([]);
  const [splitPaymentMethod, setSplitPaymentMethod] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const blockInteractions = isBlocked === true;

  useEffect(() => {
    if (!visible) return;
    setActiveTab(0);
    setSplitPaymentMethod(0);
    setIsProcessing(false);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setSplitSelections(splitItems.map(() => 0));
  }, [visible, splitItems]);

  useEffect(() => {
    if (!allowSplitOption && activeTab === 3) {
      setActiveTab(0);
      setSplitSelections(splitItems.map(() => 0));
      setSplitPaymentMethod(0);
    }
  }, [allowSplitOption, activeTab, splitItems]);

  const tipNum = toAmount(tipValue);
  const splitItemTotal = useMemo(() => {
    return round2(
      splitItems.reduce((sum, item, index) => {
        const selectedQty = Math.max(
          0,
          Math.floor(splitSelections[index] || 0),
        );
        return sum + item.unitTotal * selectedQty;
      }, 0),
    );
  }, [splitItems, splitSelections]);

  const baseTotal = activeTab === 3 ? splitItemTotal : orderTotal;
  const isSplitMode = activeTab === 3;
  const showPrintPreview = !isSplitMode && !hidePrintPreview;
  const fullGiftCardTotal = round2(
    getGiftCardDiscount(appliedGiftCard, orderTotal),
  );
  const splitGiftCardTotal = round2(
    getGiftCardDiscount(appliedSplitGiftCard, splitItemTotal),
  );
  const giftCardTotal = isSplitMode ? splitGiftCardTotal : fullGiftCardTotal;
  const activeGiftCard = isSplitMode ? appliedSplitGiftCard : appliedGiftCard;
  const useTallSplitModal = isSplitMode && splitItems.length > 5;
  const splitModalHeight = useTallSplitModal
    ? windowHeight * 0.95
    : windowHeight * 0.86;
  const defaultModalHeight = windowHeight * 0.78;
  const due = Math.max(0, round2(baseTotal + tipNum - giftCardTotal));
  const splitRemainingAmount = Math.max(0, round2(orderTotal - splitItemTotal));

  const updateSplitSelection = (index: number, delta: number) => {
    setSplitSelections((prev) => {
      const next = [...prev];
      const maxQty = Math.max(0, Math.floor(splitItems[index]?.quantity || 0));
      const current = Math.max(0, Math.floor(next[index] || 0));
      next[index] = clamp(current + delta, 0, maxQty);
      return next;
    });
  };

  const reset = () => {
    setTipValue("");
    setGiftCode("");
    setSplitGiftCode("");
    setAppliedGiftCard(null);
    setAppliedSplitGiftCard(null);
    setIsApplyingGiftCard(false);
    setCashProvided("");
    setSelectedOtherMethod(5);
    setSplitSelections(splitItems.map(() => 0));
    setSplitPaymentMethod(0);
    setActiveTab(0);
  };

  const closeWithReset = () => {
    reset();
    onClose();
  };

  const handleSplitBack = () => {
    setActiveTab(0);
    setSplitSelections(splitItems.map(() => 0));
    setSplitPaymentMethod(0);
    setTipValue("");
    setSplitGiftCode("");
    setAppliedSplitGiftCard(null);
    setIsApplyingGiftCard(false);
    setCashProvided("");
  };

  const getGiftCardLabel = (card: GiftCard | null) => {
    if (!card) return "Gift card";
    return (
      card.couponCode ||
      card.code ||
      card.cardCode ||
      card.giftCardCode ||
      "Gift card"
    );
  };

  const sanitizeGiftCard = (card: GiftCard | null): GiftCard | null => {
    if (!card || typeof card !== "object") return card;
    const copy: any = { ...card };
    if (Array.isArray(copy.logs)) {
      delete copy.logs;
    }
    return copy;
  };

  const addGiftCard = async (isSplit = false) => {
    if (blockInteractions) return;
    if (isApplyingGiftCard) return;
    const code = (isSplit ? splitGiftCode : giftCode).trim();
    if (!code) return;
    if (!companyId) {
      showToast('error', "Gift card not available");
      return;
    }

    setIsApplyingGiftCard(true);
    try {
      const response = await giftCardService.getCoupons({
        companyId,
        couponCode: code,
      });
      const data = Array.isArray(response?.data) ? response.data : [];
      const status = response?.status;
      if (status && status !== "SUCCESS" && status !== 200) {
        showToast('error', "Gift card not available");
        return;
      }
      if (data.length === 0) {
        showToast('error', "Gift card not available");
        return;
      }
      const giftCard = data[0];
      const expiryDate = toStartOfDay(giftCard?.expiryDate);
      const startDate = toStartOfDay(giftCard?.startDate);
      const today = toStartOfDay(new Date());

      if (expiryDate && today && expiryDate < today) {
        showToast('error', "Gift card expired");
        return;
      }

      if (toNumber(giftCard?.remainingBalance, 0) <= 0) {
        showToast('error', "Remaining balance of this gift card is 0");
        return;
      }

      if (startDate && today && startDate > today) {
        const startLabel = formatDate(startDate);
        const endLabel = formatDate(expiryDate);
        const message = endLabel
          ? `Gift card available from ${startLabel} to ${endLabel}`
          : `Gift card available from ${startLabel}`;
        showToast('error', message);
        return;
      }

      if (isSplit) {
        setAppliedSplitGiftCard(giftCard);
        setSplitGiftCode("");
      } else {
        setAppliedGiftCard(giftCard);
        setGiftCode("");
      }
    } catch (error) {
      console.warn("Gift card fetch failed:", error);
      showToast('error', "Gift card not available");
    } finally {
      setIsApplyingGiftCard(false);
    }
  };

  const removeGiftCard = (isSplit = false) => {
    if (blockInteractions) return;
    if (isSplit) {
      setAppliedSplitGiftCard(null);
    } else {
      setAppliedGiftCard(null);
    }
  };

  const buildSingleMethodPayload = (
    method: number,
    print: boolean,
    isCorporate?: boolean,
  ): PaymentOption & { print: boolean } => ({
    id: method,
    label:
      method === 99
        ? "Other"
        : primaryTabs.find((tab) => tab.id === method)?.label || "Payment",
    paymentMethod: method,
    tip: tipNum,
    isCorporate,
    giftCard: activeGiftCard ? sanitizeGiftCard(activeGiftCard) : undefined,
    giftCardTotal: activeGiftCard ? giftCardTotal : 0,
    cashProvided: toAmount(cashProvided),
    orderPaymentSummary: { paymentProcessorId: method },
    orderPaymentDetails: [
      {
        paymentProcessorId: method,
        paymentTotal: round2(due),
      },
    ],
    print,
  });

  const hasSplitSelection = splitSelections.some(
    (qty) => Math.floor(qty || 0) > 0,
  );
  const isSplitInvalid = activeTab === 3 && !hasSplitSelection;

  const handleConfirm = async (print = false, isCorporate?: boolean) => {
    if (blockInteractions) return;
    if (isProcessing) return;
    if (activeTab === 3) {
      if (isSplitInvalid) return;
      setIsProcessing(true);
      const splitPaymentTotal = round2(due);
      const payload = {
        id: 3,
        label: "Split Payment",
        paymentMethod: splitPaymentMethod,
        tip: tipNum,
        isCorporate,
        giftCard: activeGiftCard ? sanitizeGiftCard(activeGiftCard) : undefined,
        giftCardTotal: activeGiftCard ? giftCardTotal : 0,
        isItemSplit: true,
        splitSelections: splitSelections.map((qty) =>
          Math.max(0, Math.floor(qty || 0)),
        ),
        splitItemTotal: splitItemTotal,
        orderPaymentSummary: { paymentProcessorId: splitPaymentMethod },
        orderPaymentDetails: [
          {
            paymentProcessorId: splitPaymentMethod,
            paymentTotal: splitPaymentTotal,
          },
        ],
        print,
      };
      try {
        await Promise.resolve(onSelect(payload));
      } finally {
        setIsProcessing(false);
      }
      setTipValue("");
      setGiftCode("");
      setSplitGiftCode("");
      setAppliedGiftCard(null);
      setAppliedSplitGiftCard(null);
      setCashProvided("");
      setSplitSelections(splitItems.map(() => 0));
      return;
    }

    if (activeTab === 99) {
      setIsProcessing(true);
      const payload = buildSingleMethodPayload(
        selectedOtherMethod,
        print,
        isCorporate,
      );
      try {
        await Promise.resolve(onSelect(payload));
      } finally {
        setIsProcessing(false);
      }
      reset();
      return;
    }

    setIsProcessing(true);
    const payload = buildSingleMethodPayload(activeTab, print, isCorporate);
    try {
      await Promise.resolve(onSelect(payload));
    } finally {
      setIsProcessing(false);
    }
    reset();
  };

  const handlePrintPreview = async () => {
    if (blockInteractions) return;
    if (isProcessing) return;
    const method = activeTab === 99 ? selectedOtherMethod : activeTab;
    const payload = buildSingleMethodPayload(method, true);
    const previewPayload = {
      ...payload,
      preview: true,
      isPrintPreview: true,
    };
    if (onPrintPreview) {
      setIsProcessing(true);
      try {
        await Promise.resolve(onPrintPreview(previewPayload));
      } finally {
        setIsProcessing(false);
      }
      return;
    }
  };

  const modalWidth = Math.min(windowWidth - 16, 520);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={closeWithReset}
      allowSwipeDismissal={true}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: "center" }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
        >
          <Card
            padding={0}
            rounded={16}
            style={[
              styles.card,
              {
                borderColor: colors.border,
                height: isSplitMode ? splitModalHeight : defaultModalHeight,
                width: modalWidth,
              },
            ]}
          >
          <View
            style={[styles.headerRow, { paddingHorizontal: 18, paddingTop: 0 }]}
          >
            <View style={styles.headerTitleWrap}>
              <Text style={[styles.title, { color: colors.text }]}>
                Save & Final Settle
              </Text>
            </View>
            <View style={styles.headerActionsWrap}>
              <TouchableOpacity onPress={closeWithReset}>
                <Text style={{ color: colors.textSecondary, fontSize: 20 }}>
                  x
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {blockInteractions ? (
            <View
              style={[
                styles.blockBanner,
                {
                  borderColor: colors.warning || colors.error,
                  backgroundColor:
                    (colors.warning || colors.error) + "14",
                },
              ]}
            >
              <Text style={{ color: colors.text, fontWeight: "800" }}>
                {blockTitle}
              </Text>
              <Text style={{ color: colors.textSecondary, marginTop: 4 }}>
                {blockMessage}
              </Text>
              {onReconnect ? (
                <TouchableOpacity
                  onPress={() => onReconnect()}
                  disabled={isReconnecting}
                  style={[
                    styles.blockBannerBtn,
                    {
                      backgroundColor: colors.primary,
                      opacity: isReconnecting ? 0.6 : 1,
                    },
                  ]}
                >
                  {isReconnecting ? (
                    <ActivityIndicator color={colors.textInverse} />
                  ) : (
                    <Text style={{ color: colors.textInverse, fontWeight: "700" }}>
                      {reconnectLabel}
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <View
            style={{ flex: 1, opacity: blockInteractions ? 0.5 : 1 }}
            pointerEvents={blockInteractions ? "none" : "auto"}
          >
          <View style={styles.dragIndicatorContainer}>
            <View
              style={[styles.dragIndicator, { backgroundColor: colors.border }]}
            />
          </View>
          <View style={{ flex: 1 }}>
            {!isSplitMode ? (
              <View
                style={{
                  flexDirection: "row",
                  marginTop: 8,
                  marginBottom: 6,
                  columnGap: 8,
                  rowGap: 8,
                  flexWrap: "wrap",
                }}
              >
                {primaryTabs.map((tab) => (
                  <TouchableOpacity
                    key={tab.id}
                    onPress={() => setActiveTab(tab.id)}
                    style={[
                      styles.tab,
                      {
                        backgroundColor:
                          activeTab === tab.id ? colors.primary : "transparent",
                        borderColor: colors.border,
                      },
                    ]}
                  >
                  <Text
                    style={{
                      color:
                        activeTab === tab.id
                          ? colors.textInverse
                          : colors.text,
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <ScrollView
              style={[
                {
                  marginTop: 6,
                  flex: 1,
                },
              ]}
              contentContainerStyle={{
                paddingBottom:
                  (isSplitMode ? 8 : 0) + Math.max(insets.bottom, 12),
                flexGrow: 1,
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={isSplitMode}
            >
              {activeTab === 99 ? (
                <View>
                  <Text
                    style={{ color: colors.textSecondary, marginBottom: 8 }}
                  >
                    Other Payments
                  </Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {otherMethods.map((method) => {
                      const selected = selectedOtherMethod === method.id;
                      return (
                        <TouchableOpacity
                          key={method.id}
                          onPress={() => setSelectedOtherMethod(method.id)}
                          style={[
                            styles.pill,
                            {
                              borderColor: selected
                                ? colors.primary
                                : colors.border,
                              backgroundColor: selected
                                ? colors.primary + "15"
                                : "transparent",
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: selected ? colors.primary : colors.text,
                            }}
                          >
                            {method.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : (
                <View>
                  {activeTab === 0 && (
                    <View>
                      <Text style={{ color: colors.textSecondary }}>
                        Cash provided
                      </Text>
                      <TextInput
                        keyboardType="numeric"
                        placeholder="Enter cash amount"
                        placeholderTextColor={colors.textSecondary}
                        value={cashProvided}
                        onChangeText={setCashProvided}
                        style={[
                          styles.input,
                          { borderColor: colors.border, color: colors.text },
                        ]}
                      />

                      <Text
                        style={{ color: colors.textSecondary, marginTop: 8 }}
                      >
                        Cash to return
                      </Text>
                      <View
                        style={[styles.input, { justifyContent: "center" }]}
                      >
                        <Text style={{ color: colors.text }}>
                          {formatCurrency(
                            Math.max(0, toAmount(cashProvided) - due),
                          )}
                        </Text>
                      </View>
                    </View>
                  )}

                  {activeTab === 1 && (
                    <View>
                      <Text style={{ color: colors.textSecondary }}>
                        Card payment selected
                      </Text>
                    </View>
                  )}

                  {isSplitMode && (
                    <View>
                      <Text
                        style={{ color: colors.textSecondary, marginBottom: 8 }}
                      >
                        Split items (pay selected quantity only)
                      </Text>

                      <View style={styles.splitMethodRow}>
                        {[
                          { id: 0, label: "Cash" },
                          { id: 1, label: "Card" },
                        ].map((method) => {
                          const selected = splitPaymentMethod === method.id;
                          return (
                            <TouchableOpacity
                              key={method.id}
                              onPress={() => setSplitPaymentMethod(method.id)}
                              style={[
                                styles.splitMethodBtn,
                                {
                                  borderColor: selected
                                    ? colors.primary
                                    : colors.border,
                                  backgroundColor: selected
                                    ? colors.primary
                                    : "transparent",
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  color: selected
                                    ? colors.textInverse
                                    : colors.text,
                                }}
                              >
                                {method.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {splitItems.length === 0 ? (
                        <Text
                          style={{ color: colors.textSecondary, marginTop: 8 }}
                        >
                          No items available for split.
                        </Text>
                      ) : (
                        splitItems.map((item, index) => {
                          const selectedQty = Math.max(
                            0,
                            Math.floor(splitSelections[index] || 0),
                          );
                          return (
                            <View
                              key={item.key || `${index}`}
                              style={[
                                styles.splitItemCard,
                                {
                                  borderColor: colors.border,
                                  backgroundColor:
                                    colors.surfaceHover || colors.surface,
                                },
                              ]}
                            >
                              <View style={{ flex: 1, paddingRight: 8 }}>
                                <Text
                                  style={{
                                    color: colors.text,
                                    fontWeight: "700",
                                  }}
                                >
                                  {item.name}
                                </Text>
                                <Text
                                  style={{
                                    color: colors.textSecondary,
                                    marginTop: 2,
                                  }}
                                >
                                  Qty: {item.quantity} x{" "}
                                  {formatCurrency(item.unitTotal)}
                                </Text>
                              </View>

                              <View style={styles.splitCounterWrap}>
                                <TouchableOpacity
                                  onPress={() =>
                                    updateSplitSelection(index, -1)
                                  }
                                  style={[
                                    styles.splitCounterBtn,
                                    { borderColor: colors.border },
                                  ]}
                                >
                                  <Text
                                    style={{
                                      color: colors.text,
                                      fontSize: 18,
                                      fontWeight: "700",
                                    }}
                                  >
                                    -
                                  </Text>
                                </TouchableOpacity>
                                <Text
                                  style={{
                                    color: colors.text,
                                    width: 28,
                                    textAlign: "center",
                                    fontWeight: "700",
                                  }}
                                >
                                  {selectedQty}
                                </Text>
                                <TouchableOpacity
                                  onPress={() => updateSplitSelection(index, 1)}
                                  style={[
                                    styles.splitCounterBtn,
                                    { borderColor: colors.border },
                                  ]}
                                >
                                  <Text
                                    style={{
                                      color: colors.text,
                                      fontSize: 18,
                                      fontWeight: "700",
                                    }}
                                  >
                                    +
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })
                      )}

                      <View
                        style={[
                          styles.splitSummary,
                          { borderColor: colors.border },
                        ]}
                      >
                        <Text style={{ color: colors.textSecondary }}>
                          Selected: {formatCurrency(splitItemTotal)}
                        </Text>
                        <Text style={{ color: colors.text, fontWeight: "700" }}>
                          Remaining: {formatCurrency(splitRemainingAmount)}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: colors.textSecondary }}>
                  Add Tip (optional)
                </Text>
                <TextInput
                  keyboardType="numeric"
                  placeholder="Enter tip amount"
                  placeholderTextColor={colors.textSecondary}
                  value={tipValue}
                  onChangeText={setTipValue}
                  style={[
                    styles.input,
                    { borderColor: colors.border, color: colors.text },
                  ]}
                />
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: colors.textSecondary }}>Gift Card</Text>
                {activeGiftCard ? (
                  <View style={styles.giftCardRow}>
                    <View
                      style={[
                        styles.giftCardBadge,
                        {
                          borderColor: colors.border,
                          backgroundColor:
                            colors.surfaceHover || colors.surface,
                        },
                      ]}
                    >
                      <Text style={{ color: colors.text, fontWeight: "700" }}>
                        {getGiftCardLabel(activeGiftCard)}
                      </Text>
                      <Text
                        style={{ color: colors.textSecondary, marginTop: 2 }}
                      >
                        Applied: {formatCurrency(giftCardTotal)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => removeGiftCard(isSplitMode)}
                      style={[styles.ghostBtn, { borderColor: colors.border }]}
                    >
                      <Text style={{ color: colors.textSecondary }}>
                        Remove
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.giftCardInputRow}>
                    <TextInput
                      placeholder="Gift card code"
                      placeholderTextColor={colors.textSecondary}
                      value={isSplitMode ? splitGiftCode : giftCode}
                      onChangeText={
                        isSplitMode ? setSplitGiftCode : setGiftCode
                      }
                      style={[
                        styles.input,
                        styles.giftCardInput,
                        {
                          borderColor: colors.border,
                          color: colors.text,
                          marginTop: 0,
                        },
                      ]}
                    />
                    <TouchableOpacity
                      onPress={() => addGiftCard(isSplitMode)}
                      disabled={
                        isApplyingGiftCard ||
                        !(isSplitMode ? splitGiftCode.trim() : giftCode.trim())
                      }
                      style={[
                        styles.giftCardAddBtn,
                        {
                          backgroundColor:
                            isApplyingGiftCard ||
                            !(isSplitMode
                              ? splitGiftCode.trim()
                              : giftCode.trim())
                              ? colors.border
                              : colors.primary,
                        },
                      ]}
                    >
                      {isApplyingGiftCard ? (
                        <ActivityIndicator color={colors.textInverse} />
                      ) : (
                        <Text style={{ color: colors.textInverse }}>Add</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>

          <View style={{ marginTop: 12 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                {formatCurrency(due)}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                columnGap: 8,
                rowGap: 8,
                marginTop: 8,
                flexWrap: "wrap",
                justifyContent: "flex-start",
                alignItems: "flex-start",
              }}
            >
              {isSplitMode ? (
                <TouchableOpacity
                  onPress={handleSplitBack}
                  style={[styles.ghostBtn, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.textSecondary }}>Back</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={closeWithReset}
                  style={[styles.ghostBtn, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.textSecondary }}>Cancel</Text>
                </TouchableOpacity>
              )}
              {showPrintPreview ? (
                <TouchableOpacity
                  onPress={handlePrintPreview}
                  disabled={isProcessing || blockInteractions}
                  style={[
                    styles.payBtnPrimary,
                    {
                      backgroundColor:
                        isProcessing || blockInteractions
                          ? colors.border
                          : colors.primary,
                    },
                  ]}
                >
                  {isProcessing ? (
                    <ActivityIndicator color={colors.textInverse} />
                  ) : (
                    <Text style={{ color: colors.textInverse }}>
                      Print Preview
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => {
                  handleConfirm(false);
                }}
                disabled={isSplitInvalid || isProcessing || blockInteractions}
                style={[
                  styles.payBtn,
                  {
                    backgroundColor:
                      isSplitInvalid || isProcessing || blockInteractions
                        ? colors.border
                        : colors.primary,
                  },
                ]}
              >
                {isProcessing ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={{ color: colors.textInverse }}>Pay</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  handleConfirm(true);
                }}
                disabled={isSplitInvalid || isProcessing || blockInteractions}
                style={[
                  styles.payBtnPrimary,
                  {
                    backgroundColor:
                      isSplitInvalid || isProcessing || blockInteractions
                        ? colors.border
                        : colors.primary,
                  },
                ]}
              >
                {isProcessing ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={{ color: colors.textInverse }}>Pay & Print</Text>
                )}
              </TouchableOpacity>
              {!isSplitMode ? (
                <TouchableOpacity
                  onPress={() => {
                    handleConfirm(true, true);
                  }}
                  disabled={isSplitInvalid || isProcessing || blockInteractions}
                  style={[
                    styles.expenseBtn,
                    {
                      backgroundColor:
                        isSplitInvalid || isProcessing || blockInteractions
                          ? colors.border
                          : colors.success || colors.secondary || colors.primary,
                    },
                  ]}
                >
                  {isProcessing ? (
                    <ActivityIndicator color={colors.textInverse} />
                  ) : (
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={{ color: colors.textInverse, fontWeight: "700" }}
                    >
                      Betriebsaufwand
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          </View>
          </Card>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 0,
  },
  card: {
    width: "100%",
    maxHeight: "78%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 22,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerActionsWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  splitBackBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dragIndicatorContainer: {
    alignItems: "center",
    marginTop: 8,
    marginBottom: 6,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 4,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 32,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
  },
  giftCardRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 8,
  },
  giftCardBadge: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  giftCardInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 8,
  },
  giftCardInput: {
    flex: 1,
  },
  giftCardAddBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  ghostBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  payBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  payBtnPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  previewBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  expenseBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flexShrink: 1,
    maxWidth: "100%",
  },
  splitMethodRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  splitMethodBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  splitItemCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  splitCounterWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  splitCounterBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  splitSummary: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  blockBanner: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 18,
    marginTop: 10,
  },
  blockBannerBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
});

