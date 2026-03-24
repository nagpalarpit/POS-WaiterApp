import React, {
  useEffect,
  useMemo,
  useState,
  useLayoutEffect,
  useRef,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommonActions } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeProvider";
import Card from "./Card";
import { formatCurrency } from "../utils/currency";
import giftCardService from "../services/giftCardService";
import { useToast } from "./ToastProvider";
import {
  clearPaymentFlowHandlers,
  getPaymentFlowHandlers,
} from "../services/paymentFlowStore";

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

type PaymentRouteParams = {
  title?: string;
  orderTotal?: number;
  companyId?: number;
  splitItems?: SplitSelectableItem[];
  allowSplitOption?: boolean;
  hidePrintPreview?: boolean;
};

type PaymentScreenProps = {
  navigation?: any;
  route?: { params?: PaymentRouteParams };
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

const PAYMENT_METHOD_LABELS: Record<number, string> = {
  0: "Cash",
  1: "Card",
  2: "Cash + Card",
  3: "Split Payment",
  4: "Gift Card",
  5: "Debitor",
  6: "Lieferando",
  7: "Uber",
  8: "Wolt",
  9: "Bolt",
  10: "Schlemmerblock",
};

const getPaymentLabel = (method: number): string =>
  PAYMENT_METHOD_LABELS[method] || "Payment";

const getGiftCardLabel = (giftCard: GiftCard): string => {
  if (!giftCard) return "Gift Card";
  const code =
    giftCard.couponCode ||
    giftCard.giftCardCode ||
    giftCard.cardCode ||
    giftCard.code ||
    "";
  if (!code) return "Gift Card";
  const remainingBalance = toNumber((giftCard as any).remainingBalance, 0);
  if (remainingBalance > 0) {
    return `${code} (${formatCurrency(remainingBalance)} left)`;
  }
  return code;
};

export default function PaymentScreen(props: PaymentScreenProps) {
  const { navigation, route } = props;
  const params: PaymentRouteParams = route?.params || {};
  const {
    title = "Payment",
    orderTotal = 0,
    companyId,
    splitItems = [],
    allowSplitOption = true,
    hidePrintPreview = false,
  } = params;
  const { colors } = useTheme();
  const { showToast } = useToast();
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const closeHandledRef = useRef(false);
  const primaryTabs = [
    { id: 0, label: "Cash" },
    { id: 1, label: "Card" },
    { id: 2, label: "Split" },
    { id: 99, label: "Other" },
  ];
  const otherMethods = [
    { id: 5, label: "Debitor" },
    { id: 6, label: "Lieferando" },
    { id: 7, label: "Uber" },
    { id: 8, label: "Wolt" },
    { id: 9, label: "Bolt" },
    { id: 10, label: "Schlemmerblock" },
  ];
  const [activeTab, setActiveTab] = useState(0);
  const [selectedOtherMethod, setSelectedOtherMethod] = useState<number>(
    otherMethods[0]?.id ?? 5,
  );
  const [tipValue, setTipValue] = useState("");
  const [cashProvided, setCashProvided] = useState("");
  const [giftCode, setGiftCode] = useState("");
  const [splitGiftCode, setSplitGiftCode] = useState("");
  const [giftCard, setGiftCard] = useState<GiftCard | null>(null);
  const [splitGiftCard, setSplitGiftCard] = useState<GiftCard | null>(null);
  const [isApplyingGiftCard, setIsApplyingGiftCard] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [showOtherMethods, setShowOtherMethods] = useState(false);
  const [splitPaymentMethod, setSplitPaymentMethod] = useState(0);
  const [currentOrderTotal, setCurrentOrderTotal] = useState(() =>
    round2(toNumber(orderTotal, 0)),
  );
  const [currentSplitItems, setCurrentSplitItems] =
    useState<SplitSelectableItem[]>(splitItems);
  const [currentAllowSplitOption, setCurrentAllowSplitOption] =
    useState(allowSplitOption);
  const [splitSelections, setSplitSelections] = useState<number[]>(() =>
    splitItems.map(() => 0),
  );

  const getCurrentFlowHandlers = () => getPaymentFlowHandlers();

  const closeFlow = () => {
    if (closeHandledRef.current) {
      return;
    }
    closeHandledRef.current = true;
    getCurrentFlowHandlers()?.onClose?.();
    clearPaymentFlowHandlers();
  };

  useLayoutEffect(() => {
    if (navigation?.setOptions) {
      navigation.setOptions({ headerTitle: title });
    }
  }, [navigation, title]);

  useEffect(() => {
    if (!getCurrentFlowHandlers()?.onSelect) {
      showToast("error", "Payment session expired. Please try again.");
      if (navigation?.goBack) {
        navigation.goBack();
      }
      return;
    }
  }, [navigation, showToast]);

  useEffect(() => {
    return () => {
      closeFlow();
    };
  }, []);

  useEffect(() => {
    setCurrentOrderTotal(round2(toNumber(orderTotal, 0)));
  }, [orderTotal]);

  useEffect(() => {
    setCurrentSplitItems(splitItems);
  }, [splitItems]);

  useEffect(() => {
    setCurrentAllowSplitOption(allowSplitOption);
  }, [allowSplitOption]);

  useEffect(() => {
    setSplitSelections(currentSplitItems.map(() => 0));
  }, [currentSplitItems]);

  const footerHeight = 200;
  const sectionGap = 8;
  const activeGiftCard = isSplitMode ? splitGiftCard : giftCard;
  const resolvedOrderTotal = round2(toNumber(currentOrderTotal, 0));

  const splitItemTotal = useMemo(() => {
    return round2(
      currentSplitItems.reduce((sum, item, index) => {
        const selectedQty = Math.max(
          0,
          Math.floor(splitSelections[index] || 0),
        );
        const lineTotal = toNumber(item.unitTotal, 0) * selectedQty;
        return sum + lineTotal;
      }, 0),
    );
  }, [currentSplitItems, splitSelections]);

  const splitRemainingAmount = useMemo(
    () => round2(Math.max(resolvedOrderTotal - splitItemTotal, 0)),
    [resolvedOrderTotal, splitItemTotal],
  );

  const baseTotal = isSplitMode ? splitItemTotal : resolvedOrderTotal;
  const tipNum = round2(clamp(toAmount(tipValue), 0, 999999));
  const giftCardTotal = useMemo(
    () => round2(getGiftCardDiscount(activeGiftCard, baseTotal + tipNum)),
    [activeGiftCard, baseTotal, tipNum],
  );
  const due = round2(Math.max(baseTotal + tipNum - giftCardTotal, 0));
  const showPrintPreview = !!getCurrentFlowHandlers()?.onPrintPreview && !hidePrintPreview;
  const isSplitInvalid = isSplitMode && splitItemTotal <= 0;
  const row1Count = 2 + (showPrintPreview ? 1 : 0);
  const isOtherPaymentMode = showOtherMethods || activeTab === 99;
  const showGiftCardSection = !showOtherMethods;
  const showExpenseButton = !isSplitMode && !isOtherPaymentMode;
  const row2Count = 1 + (showExpenseButton ? 1 : 0);
  const visiblePrimaryTabs = currentAllowSplitOption
    ? primaryTabs
    : primaryTabs.filter((tab) => tab.id !== 2);

  const getRowBtnStyle = (count: number) => {
    if (count <= 1) return styles.footerBtnFull;
    return styles.footerBtnFlex;
  };

  const handlePrimaryTabPress = (tabId: number) => {
    if (tabId === 2) {
      if (!currentAllowSplitOption) {
        return;
      }
      if (currentSplitItems.length === 0) {
        showToast("error", "No items available for split payment.");
        return;
      }
      setShowOtherMethods(false);
      setIsSplitMode(true);
      setSplitPaymentMethod(0);
      return;
    }

    if (tabId === 99) {
      setGiftCard(null);
      setGiftCode("");
      setIsSplitMode(false);
      setShowOtherMethods(true);
      setActiveTab(99);
      return;
    }

    setIsSplitMode(false);
    setShowOtherMethods(false);
    setActiveTab(tabId);
  };

  const handleOtherBack = () => {
    setShowOtherMethods(false);
    setActiveTab(0);
  };

  const handleSplitBack = () => {
    setIsSplitMode(false);
    setShowOtherMethods(false);
    setActiveTab(0);
    setSplitPaymentMethod(0);
    setSplitSelections(currentSplitItems.map(() => 0));
    setSplitGiftCode("");
    setSplitGiftCard(null);
  };

  const updateSplitSelection = (index: number, delta: number) => {
    setSplitSelections((prev) => {
      const next = [...prev];
      const item = currentSplitItems[index];
      const maxQty = Math.max(0, Math.floor(toNumber(item?.quantity, 0)));
      const current = Math.max(0, Math.floor(next[index] || 0));
      next[index] = clamp(current + delta, 0, maxQty);
      return next;
    });
  };

  const resetAfterSplitPayment = (resetPayment?: {
    orderTotal?: number;
    splitItems?: SplitSelectableItem[];
    allowSplitOption?: boolean;
  }) => {
    const nextSplitItems = Array.isArray(resetPayment?.splitItems)
      ? resetPayment.splitItems
      : [];
    const nextAllowSplitOption =
      resetPayment?.allowSplitOption ??
      nextSplitItems.reduce(
        (sum, item) => sum + Math.max(toNumber(item?.quantity, 0), 0),
        0,
      ) > 1;

    setCurrentOrderTotal(toNumber(resetPayment?.orderTotal, currentOrderTotal));
    setCurrentSplitItems(nextSplitItems);
    setCurrentAllowSplitOption(nextAllowSplitOption);
    setTipValue("");
    setCashProvided("");
    setGiftCode("");
    setGiftCard(null);
    setSplitGiftCode("");
    setSplitGiftCard(null);
    setSplitPaymentMethod(0);
    setShowOtherMethods(false);
    setActiveTab(nextAllowSplitOption && nextSplitItems.length > 0 ? 2 : 0);
    setIsSplitMode(nextAllowSplitOption && nextSplitItems.length > 0);
  };

  const resolvePaymentMethod = () => {
    if (isSplitMode) return splitPaymentMethod;
    if (showOtherMethods || activeTab === 99) return selectedOtherMethod;
    return activeTab;
  };

  const buildPaymentOption = (
    print = false,
    isCorporate = false,
  ): PaymentOption => {
    const paymentMethod = resolvePaymentMethod();
    return {
      id: paymentMethod,
      label: getPaymentLabel(paymentMethod),
      paymentMethod,
      tip: tipNum,
      giftCardTotal,
      cashProvided: paymentMethod === 0 ? toAmount(cashProvided) : undefined,
      isCorporate,
      orderPaymentSummary: { paymentProcessorId: paymentMethod },
      isItemSplit: isSplitMode,
      splitSelections: isSplitMode ? splitSelections : undefined,
      splitItemTotal: isSplitMode ? splitItemTotal : undefined,
      ...(activeGiftCard ? { giftCard: activeGiftCard } : {}),
      ...(print ? { print } : {}),
    };
  };

  const closeWithReset = () => {
    closeFlow();
    if (navigation?.goBack) {
      navigation.goBack();
    }
  };

  const resetToDashboard = () => {
    closeFlow();
    const parentNavigation = navigation?.getParent?.();

    if (parentNavigation?.dispatch) {
      parentNavigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [
            {
              name: "Main",
              state: {
                index: 0,
                routes: [{ name: "Dashboard" }],
              },
            },
          ],
        }),
      );
      return;
    }

    if (navigation?.reset) {
      navigation.reset({
        index: 0,
        routes: [{ name: "Dashboard" }],
      });
      return;
    }
    if (navigation?.navigate) {
      navigation.navigate("Dashboard");
    }
  };

  const handleConfirm = async (print = false, isCorporate = false) => {
    if (isProcessing) return;
    if (isSplitInvalid) {
      showToast("error", "Select at least one item to split.");
      return;
    }
    const paymentMethod = resolvePaymentMethod();
    if (paymentMethod == null) {
      showToast("error", "Select a payment method.");
      return;
    }

    setIsProcessing(true);
    try {
      const option = buildPaymentOption(print, isCorporate);
      const result = await getCurrentFlowHandlers()?.onSelect?.(option);
      if ((result as any)?.keepOpen) {
        if ((result as any)?.resetPayment) {
          resetAfterSplitPayment((result as any)?.resetPayment);
        }
        return;
      }
      if ((result as any)?.resetToDashboard) {
        resetToDashboard();
        return;
      }
      if (!(result as any)?.keepOpen) {
        closeWithReset();
        return;
      }
    } catch (error) {
      console.error("Payment failed:", error);
      showToast("error", "Unable to process payment");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrintPreview = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const option = buildPaymentOption(true);
      await getCurrentFlowHandlers()?.onPrintPreview?.(option);
    } catch (error) {
      console.error("Print preview failed:", error);
      showToast("error", "Unable to generate print preview");
    } finally {
      setIsProcessing(false);
    }
  };

  const addGiftCard = async (forSplit: boolean) => {
    if (!companyId) {
      showToast("error", "Company details missing for gift card.");
      return;
    }
    const code = (forSplit ? splitGiftCode : giftCode).trim();
    if (!code) {
      showToast("error", "Enter a gift card code.");
      return;
    }

    setIsApplyingGiftCard(true);
    try {
      const response = await giftCardService.getCoupons({
        companyId: Number(companyId),
        couponCode: code,
      });
      const rawData = (response as any)?.data ?? response;
      const list = Array.isArray(rawData) ? rawData : rawData ? [rawData] : [];
      const gift = list.find(Boolean) || null;
      if (!gift) {
        showToast("error", "Invalid gift card code.");
        return;
      }

      const start = toStartOfDay(gift?.startDate ?? gift?.startDateTime);
      const expiry = toStartOfDay(gift?.expiryDate ?? gift?.expiryDateTime);
      const today = toStartOfDay(new Date());
      if (start && today && start > today) {
        showToast("error", `Gift card is valid from ${formatDate(start)}.`);
        return;
      }
      if (expiry && today && expiry < today) {
        showToast("error", `Gift card expired on ${formatDate(expiry)}.`);
        return;
      }

      if (forSplit) {
        setSplitGiftCard(gift);
        setSplitGiftCode("");
      } else {
        setGiftCard(gift);
        setGiftCode("");
      }
      showToast("success", "Gift card applied.");
    } catch (error) {
      console.error("Gift card lookup failed:", error);
      showToast("error", "Unable to apply gift card.");
    } finally {
      setIsApplyingGiftCard(false);
    }
  };

  const removeGiftCard = (forSplit: boolean) => {
    if (forSplit) {
      setSplitGiftCard(null);
      return;
    }
    setGiftCard(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, paddingHorizontal: 12 }}
          contentContainerStyle={{
            paddingTop: sectionGap,
            paddingBottom: insets.bottom + footerHeight + 120,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={isSplitMode}
          scrollIndicatorInsets={{ bottom: insets.bottom + footerHeight }}
        >
          <Card
            rounded={14}
            style={{
              padding: 12,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              marginBottom: sectionGap,
            }}
          >
            {showOtherMethods ? (
              <View>
                <View style={styles.sectionHeaderRow}>
                  <Text style={{ color: colors.textSecondary }}>
                    Other Payments
                  </Text>
                  <TouchableOpacity
                    onPress={handleOtherBack}
                    style={styles.linkBtn}
                  >
                    <Text style={{ color: colors.textSecondary }}>Back</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.methodWrap}>
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
            ) : isSplitMode ? (
              <View>
                <View style={styles.sectionHeaderRow}>
                  <Text style={{ color: colors.textSecondary }}>
                    Split items (pay selected quantity only)
                  </Text>
                </View>
                <View style={styles.splitHeaderRow}>
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
              </View>
            ) : (
              <View>
                <Text
                  style={{ color: colors.textSecondary, marginBottom: 8 }}
                >
                  Payment Methods
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tabRow}
                >
                  {visiblePrimaryTabs.map((tab) => (
                    <TouchableOpacity
                      key={tab.id}
                      onPress={() => handlePrimaryTabPress(tab.id)}
                      style={[
                        styles.tab,
                        {
                          backgroundColor:
                            activeTab === tab.id
                              ? colors.primary
                              : "transparent",
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
                </ScrollView>
              </View>
            )}
          </Card>

          <View>
            <Card style={{ padding: 12, borderColor: colors.border }}>
              {!isSplitMode && !showOtherMethods && activeTab === 0 && (
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

                  <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
                    Cash to return
                  </Text>
                  <View style={[styles.input, { justifyContent: "center" }]}>
                    <Text style={{ color: colors.text }}>
                      {formatCurrency(
                        Math.max(0, toAmount(cashProvided) - due),
                      )}
                    </Text>
                  </View>
                </View>
              )}

              {!isSplitMode && !showOtherMethods && activeTab === 1 && (
                <View>
                  <Text style={{ color: colors.textSecondary }}>
                    Card payment selected
                  </Text>
                </View>
              )}

              {isSplitMode ? (
                <View>
                  {currentSplitItems.length == 0 ? (
                    <Text
                      style={{ color: colors.textSecondary, marginTop: 8 }}
                    >
                      No items available for split.
                    </Text>
                  ) : (
                    currentSplitItems.map((item, index) => {
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
                              onPress={() => updateSplitSelection(index, -1)}
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
              ) : null}

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

              {showGiftCardSection ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ color: colors.textSecondary }}>
                    Gift Card
                  </Text>
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
                        <Text
                          style={{ color: colors.text, fontWeight: "700" }}
                        >
                          {getGiftCardLabel(activeGiftCard)}
                        </Text>
                        <Text
                          style={{
                            color: colors.textSecondary,
                            marginTop: 2,
                          }}
                        >
                          Applied: {formatCurrency(giftCardTotal)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => removeGiftCard(isSplitMode)}
                        style={[
                          styles.ghostBtn,
                          { borderColor: colors.border },
                        ]}
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
                        onFocus={() =>
                          scrollRef.current?.scrollToEnd({ animated: true })
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
                          !(isSplitMode
                            ? splitGiftCode.trim()
                            : giftCode.trim())
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
                          <Text style={{ color: colors.textInverse }}>
                            Add
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : null}
            </Card>

            <Card
              rounded={12}
              style={[
                styles.footerSummaryCard,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  marginTop: sectionGap,
                },
              ]}
            >
              <View style={styles.summaryRow}>
                <Text style={{ color: colors.textSecondary }}>Subtotal</Text>
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {formatCurrency(baseTotal)}
                </Text>
              </View>
              {tipNum > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={{ color: colors.textSecondary }}>Tip</Text>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>
                    {formatCurrency(tipNum)}
                  </Text>
                </View>
              ) : null}
              {giftCardTotal > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={{ color: colors.textSecondary }}>
                    Gift Card
                  </Text>
                  <Text style={{ color: colors.error, fontWeight: "700" }}>
                    -{formatCurrency(giftCardTotal)}
                  </Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.summaryRow,
                  {
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    paddingTop: 8,
                  },
                ]}
              >
                <Text style={{ color: colors.text, fontWeight: "800" }}>
                  Order Total
                </Text>
                <Text
                  style={{
                    color: colors.primary,
                    fontWeight: "800",
                    fontSize: 17,
                  }}
                >
                  {formatCurrency(due)}
                </Text>
              </View>
            </Card>
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.background,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <View style={styles.footerActions}>
            <View style={styles.footerRow}>
              {isSplitMode ? (
                <TouchableOpacity
                  onPress={handleSplitBack}
                  disabled={isProcessing}
                  style={[
                    styles.footerBtn,
                    getRowBtnStyle(row1Count),
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      opacity: isProcessing ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{ color: colors.textSecondary, fontWeight: "700" }}
                  >
                    Back
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={closeWithReset}
                  disabled={isProcessing}
                  style={[
                    styles.footerBtn,
                    getRowBtnStyle(row1Count),
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      opacity: isProcessing ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{ color: colors.textSecondary, fontWeight: "700" }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              )}
              {showPrintPreview ? (
                <TouchableOpacity
                  onPress={handlePrintPreview}
                  disabled={isProcessing}
                  style={[
                    styles.footerBtn,
                    getRowBtnStyle(row1Count),
                    {
                      borderColor: colors.border,
                      backgroundColor: isProcessing
                        ? colors.border
                        : colors.surface,
                      opacity: isProcessing ? 0.6 : 1,
                    },
                  ]}
                >
                  {isProcessing ? (
                    <ActivityIndicator color={colors.textInverse} />
                  ) : (
                    <Text style={{ color: colors.text, fontWeight: "700" }}>
                      Print Preview
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => {
                  handleConfirm(false);
                }}
                disabled={isSplitInvalid || isProcessing}
                style={[
                  styles.footerBtnPrimary,
                  getRowBtnStyle(row1Count),
                  {
                    backgroundColor:
                      isSplitInvalid || isProcessing
                        ? colors.border
                        : colors.primary,
                  },
                ]}
              >
                {isProcessing ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text
                    style={{ color: colors.textInverse, fontWeight: "700" }}
                  >
                    Pay
                  </Text>
                )}
              </TouchableOpacity>
            </View>
            <View
              style={styles.footerRow}
              key={showExpenseButton ? "row2-normal" : "row2-split"}
            >
              <TouchableOpacity
                onPress={() => {
                  handleConfirm(true);
                }}
                disabled={isSplitInvalid || isProcessing}
                style={[
                  styles.footerBtnPrimary,
                  getRowBtnStyle(row2Count),
                  {
                    backgroundColor:
                      isSplitInvalid || isProcessing
                        ? colors.border
                        : colors.primary,
                  },
                ]}
              >
                {isProcessing ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text
                    style={{ color: colors.textInverse, fontWeight: "700" }}
                  >
                    Pay & Print
                  </Text>
                )}
              </TouchableOpacity>
              {showExpenseButton ? (
                <TouchableOpacity
                  onPress={() => {
                    handleConfirm(true, true);
                  }}
                  disabled={isSplitInvalid || isProcessing}
                  style={[
                    styles.footerBtnPrimary,
                    getRowBtnStyle(row2Count),
                    {
                      backgroundColor:
                        isSplitInvalid || isProcessing
                          ? colors.border
                          : colors.success ||
                          colors.secondary ||
                          colors.primary,
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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

  subtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  methodWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  splitHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  footerSummaryCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  footerActions: {
    flexDirection: "column",
    gap: 8,
    marginTop: 10,
  },
  footerRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  footerBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  footerBtnHalf: {
    width: "45%",
  },
  footerBtnFull: {
    width: "100%",
  },
  footerBtnFlex: {
    flex: 1,
  },
  footerBtnThird: {
    width: "30%",
  },
  footerBtnPrimary: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  splitBackBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
  linkBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
});
