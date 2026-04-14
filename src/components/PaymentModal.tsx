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
import {
  getAttributeValueName,
  getAttributeValuePrice,
  getAttributeValueQuantity,
  getItemOptionsSummary,
} from "../utils/cartCalculations";
import { getVoucherDetailLines } from "../utils/voucherDetails";
import giftCardService from "../services/giftCardService";
import { useToast } from "./ToastProvider";
import {
  clearPaymentFlowHandlers,
  getPaymentFlowHandlers,
} from "../services/paymentFlowStore";
import AppBottomSheet from "./AppBottomSheet";
import AppBottomSheetTextInput from "./AppBottomSheetTextInput";
import CustomerDrawer from "./CustomerDrawer";
import { useSettings } from "../hooks/useSettings";
import { useTranslation } from "../contexts/LanguageContext";
import { Customer } from "../types/customer";
import {
  formatCustomerAddress,
  getCustomerDisplayName,
  getSelectedCustomerAddress,
} from "../utils/customerData";

type PaymentDetail = {
  paymentProcessorId: number;
  paymentTotal: number;
};

type SplitSelectableItem = {
  key: string;
  name: string;
  itemName?: string;
  customId?: number | string;
  quantity: number;
  unitTotal: number;
  variantName?: string;
  attributeName?: string;
  attributeValues?: any[];
  discountItems?: any[];
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
  deliveryCharge?: number;
  giftCard?: GiftCard | null;
  giftCardTotal?: number;
  cashProvided?: number;
  isCorporate?: boolean;
  orderPaymentSummary?: { paymentProcessorId: number };
  orderPaymentDetails?: PaymentDetail[];
  isItemSplit?: boolean;
  splitSelections?: number[];
  splitItemTotal?: number;
  selectedCustomer?: Customer | null;
  debitorCustomerDetails?: Record<string, any> | null;
  customerId?: number | string | null;
  customerAddressId?: number | string | null;
};

type PaymentRouteParams = {
  title?: string;
  orderTotal?: number;
  orderSubTotal?: number;
  orderDiscountTotal?: number;
  orderDeliveryCharge?: number;
  orderDeliveryTypeId?: number;
  selectedAddressDeliveryCharge?: number | null;
  companyId?: number;
  splitItems?: SplitSelectableItem[];
  allowSplitOption?: boolean;
  hidePrintPreview?: boolean;
  selectedCustomer?: Customer | null;
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

const sanitizeAmountInput = (value: string): string => {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole = "", ...rest] = cleaned.split(".");
  if (rest.length === 0) {
    return whole;
  }
  return `${whole}.${rest.join("")}`;
};

const normalizeNullableAmount = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return round2(Math.max(toNumber(value, 0), 0));
};

const getPaymentLabel = (
  method: number,
  t: (key: string) => string,
): string => {
  switch (method) {
    case 0:
      return t("cash");
    case 1:
      return t("card");
    case 2:
      return t("cashAndCard");
    case 3:
      return t("splitPayment");
    case 4:
      return t("giftCard");
    case 5:
      return t("debitorPayment");
    case 6:
      return "Lieferando";
    case 7:
      return "Uber";
    case 8:
      return "Wolt";
    case 9:
      return "Bolt";
    case 10:
      return "Schlemmerblock";
    default:
      return t("payment");
  }
};

const getGiftCardLabel = (
  giftCard: GiftCard,
  t: (key: string) => string,
): string => {
  if (!giftCard) return t("giftCard");
  const code =
    giftCard.couponCode ||
    giftCard.giftCardCode ||
    giftCard.cardCode ||
    giftCard.code ||
    "";
  if (!code) return t("giftCard");
  const remainingBalance = toNumber((giftCard as any).remainingBalance, 0);
  if (remainingBalance > 0) {
    return `${code} (${formatCurrency(remainingBalance)} ${t("remaining")})`;
  }
  return code;
};

const buildDebitorCustomerDetails = (
  customer?: Customer | null,
  companyId?: number,
) => {
  if (!customer) return null;

  const selectedAddress = getSelectedCustomerAddress(customer);

  return {
    id: customer.id ?? null,
    roleId: 4,
    companyId: companyId ?? null,
    firstName: customer.firstName || "",
    lastName: customer.lastName || "",
    email: customer.email || "",
    mobileNo: customer.mobileNo || "",
    steuerId: customer.steuerId || "",
    customerCompanyName: customer.customerCompanyName || "",
    addressLine1: selectedAddress?.addressLine1 || "",
    city: selectedAddress?.city || "",
    landMark: selectedAddress?.landmark || "",
    pincode: selectedAddress?.pincode || "",
    customerAddressId:
      customer.customerAddressId ?? selectedAddress?.id ?? null,
  };
};

export default function PaymentScreen(props: PaymentScreenProps) {
  const { navigation, route } = props;
  const params: PaymentRouteParams = route?.params || {};
  const {
    title = "Payment",
    orderTotal = 0,
    orderSubTotal = 0,
    orderDiscountTotal = 0,
    orderDeliveryCharge = 0,
    orderDeliveryTypeId = 0,
    selectedAddressDeliveryCharge = null,
    companyId,
    splitItems = [],
    allowSplitOption = true,
    hidePrintPreview = false,
    selectedCustomer = null,
  } = params;
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const { settings } = useSettings();
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const closeHandledRef = useRef(false);
  const primaryTabs = [
    { id: 0, label: t("cash") },
    { id: 1, label: t("card") },
    { id: 2, label: t("split") },
    { id: 99, label: t("other") },
  ];
  const otherMethods = [
    { id: 5, label: t("debitorPayment") },
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
  const [deliveryChargeValue, setDeliveryChargeValue] = useState("");
  const [deliveryChargeDraft, setDeliveryChargeDraft] = useState("");
  const [cashProvided, setCashProvided] = useState("");
  const [giftCode, setGiftCode] = useState("");
  const [splitGiftCode, setSplitGiftCode] = useState("");
  const [giftCard, setGiftCard] = useState<GiftCard | null>(null);
  const [splitGiftCard, setSplitGiftCard] = useState<GiftCard | null>(null);
  const [isApplyingGiftCard, setIsApplyingGiftCard] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [showOtherMethods, setShowOtherMethods] = useState(false);
  const [deliveryChargeEditorVisible, setDeliveryChargeEditorVisible] =
    useState(false);
  const [splitPaymentMethod, setSplitPaymentMethod] = useState(0);
  const [currentOrderTotal, setCurrentOrderTotal] = useState(() =>
    round2(toNumber(orderTotal, 0)),
  );
  const [currentOrderSubTotal, setCurrentOrderSubTotal] = useState(() =>
    round2(toNumber(orderSubTotal, toNumber(orderTotal, 0))),
  );
  const [currentOrderDiscountTotal, setCurrentOrderDiscountTotal] = useState(
    () => round2(Math.max(toNumber(orderDiscountTotal, 0), 0)),
  );
  const [currentOrderDeliveryCharge, setCurrentOrderDeliveryCharge] = useState(
    () => round2(Math.max(toNumber(orderDeliveryCharge, 0), 0)),
  );
  const [currentOrderDeliveryTypeId, setCurrentOrderDeliveryTypeId] = useState(
    () => Math.max(0, Math.floor(toNumber(orderDeliveryTypeId, 0))),
  );
  const [customDeliveryCharge, setCustomDeliveryCharge] = useState<number | null>(
    null,
  );
  const [
    currentSelectedAddressDeliveryCharge,
    setCurrentSelectedAddressDeliveryCharge,
  ] = useState<number | null>(() =>
    selectedAddressDeliveryCharge == null
      ? null
      : round2(Math.max(toNumber(selectedAddressDeliveryCharge, 0), 0)),
  );
  const [currentSplitItems, setCurrentSplitItems] =
    useState<SplitSelectableItem[]>(splitItems);
  const [currentAllowSplitOption, setCurrentAllowSplitOption] =
    useState(allowSplitOption);
  const [splitSelections, setSplitSelections] = useState<number[]>(() =>
    splitItems.map(() => 0),
  );
  const [customerDrawerVisible, setCustomerDrawerVisible] = useState(false);
  const [customerDrawerMode, setCustomerDrawerMode] = useState<"list" | "form">(
    "list",
  );
  const [selectedDebitorCustomer, setSelectedDebitorCustomer] =
    useState<Customer | null>(() =>
      selectedCustomer?.isDebitor === true ? selectedCustomer : null,
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
      navigation.setOptions({ headerTitle: title || t("payment") });
    }
  }, [navigation, title, t]);

  useEffect(() => {
    if (!getCurrentFlowHandlers()?.onSelect) {
      showToast("error", t("paymentSessionExpired"));
      if (navigation?.goBack) {
        navigation.goBack();
      }
      return;
    }
  }, [navigation, showToast, t]);

  useEffect(() => {
    return () => {
      closeFlow();
    };
  }, []);

  useEffect(() => {
    setCurrentOrderTotal(round2(toNumber(orderTotal, 0)));
  }, [orderTotal]);

  useEffect(() => {
    setCurrentOrderSubTotal(
      round2(toNumber(orderSubTotal, toNumber(orderTotal, 0))),
    );
  }, [orderSubTotal, orderTotal]);

  useEffect(() => {
    setCurrentOrderDiscountTotal(
      round2(Math.max(toNumber(orderDiscountTotal, 0), 0)),
    );
  }, [orderDiscountTotal]);

  useEffect(() => {
    setCurrentOrderDeliveryCharge(
      round2(Math.max(toNumber(orderDeliveryCharge, 0), 0)),
    );
  }, [orderDeliveryCharge]);

  useEffect(() => {
    setCurrentOrderDeliveryTypeId(
      Math.max(0, Math.floor(toNumber(orderDeliveryTypeId, 0))),
    );
  }, [orderDeliveryTypeId]);

  useEffect(() => {
    setCustomDeliveryCharge(null);
  }, [orderDeliveryCharge, orderDeliveryTypeId, selectedAddressDeliveryCharge]);

  useEffect(() => {
    const normalizedSelectedCharge =
      selectedAddressDeliveryCharge == null
        ? null
        : round2(Math.max(toNumber(selectedAddressDeliveryCharge, 0), 0));
    setCurrentSelectedAddressDeliveryCharge(normalizedSelectedCharge);
  }, [selectedAddressDeliveryCharge]);

  useEffect(() => {
    setCurrentSplitItems(splitItems);
  }, [splitItems]);

  useEffect(() => {
    setCurrentAllowSplitOption(allowSplitOption);
  }, [allowSplitOption]);

  useEffect(() => {
    setSplitSelections(currentSplitItems.map(() => 0));
  }, [currentSplitItems]);

  useEffect(() => {
    setSelectedDebitorCustomer(
      selectedCustomer?.isDebitor === true ? selectedCustomer : null,
    );
  }, [selectedCustomer]);

  const footerHeight = 200;
  const sectionGap = 8;
  const activeGiftCard = isSplitMode ? splitGiftCard : giftCard;
  const resolvedOrderTotal = round2(toNumber(currentOrderTotal, 0));
  const resolvedOrderDiscountTotal = round2(
    Math.max(toNumber(currentOrderDiscountTotal, 0), 0),
  );
  const resolvedSettingsDeliveryCharge = normalizeNullableAmount(
    settings?.deliveryCharge,
  );
  const resolvedOrderDeliveryCharge = round2(
    Math.max(toNumber(currentOrderDeliveryCharge, 0), 0),
  );
  const deliveryChargeNum = round2(
    clamp(toAmount(deliveryChargeValue), 0, 999999),
  );
  const resolvedOrderSubTotal = round2(
    Math.max(
      toNumber(currentOrderSubTotal, 0),
      resolvedOrderTotal + resolvedOrderDiscountTotal,
    ),
  );

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
    () => round2(Math.max(resolvedOrderSubTotal - splitItemTotal, 0)),
    [resolvedOrderSubTotal, splitItemTotal],
  );

  const splitDiscountTotal = useMemo(() => {
    if (
      !isSplitMode ||
      resolvedOrderDiscountTotal <= 0 ||
      resolvedOrderSubTotal <= 0
    ) {
      return 0;
    }
    const splitRatio = clamp(splitItemTotal / resolvedOrderSubTotal, 0, 1);
    return round2(
      Math.min(resolvedOrderDiscountTotal * splitRatio, splitItemTotal),
    );
  }, [
    isSplitMode,
    resolvedOrderDiscountTotal,
    resolvedOrderSubTotal,
    splitItemTotal,
  ]);

  const displaySubTotal = isSplitMode ? splitItemTotal : resolvedOrderSubTotal;
  const displayDiscount = isSplitMode
    ? splitDiscountTotal
    : resolvedOrderDiscountTotal;
  const showDeliveryChargeField = currentOrderDeliveryTypeId === 1;
  const lockedDeliveryChargeSource =
    currentSelectedAddressDeliveryCharge != null
      ? "address"
      : resolvedSettingsDeliveryCharge != null
        ? "settings"
        : null;
  const displayDeliveryCharge = showDeliveryChargeField
    ? isSplitMode && splitRemainingAmount > 0
      ? 0
      : deliveryChargeNum
    : 0;
  const baseTotal = round2(Math.max(displaySubTotal - displayDiscount, 0));
  const tipNum = round2(clamp(toAmount(tipValue), 0, 999999));
  const giftCardTotal = useMemo(
    () =>
      round2(
        getGiftCardDiscount(
          activeGiftCard,
          baseTotal + displayDeliveryCharge + tipNum,
        ),
      ),
    [activeGiftCard, baseTotal, displayDeliveryCharge, tipNum],
  );
  const due = round2(
    Math.max(baseTotal + displayDeliveryCharge + tipNum - giftCardTotal, 0),
  );
  const showPrintPreview =
    !!getCurrentFlowHandlers()?.onPrintPreview &&
    !hidePrintPreview &&
    !isSplitMode;
  const isSplitInvalid = isSplitMode && splitItemTotal <= 0;
  const row1Count = 2 + (showPrintPreview ? 1 : 0);
  const isOtherPaymentMode = showOtherMethods || activeTab === 99;
  const showGiftCardSection = !showOtherMethods;
  const showExpenseButton = !isSplitMode && !isOtherPaymentMode;
  const row2Count = 1 + (showExpenseButton ? 1 : 0);
  const visiblePrimaryTabs = currentAllowSplitOption
    ? primaryTabs
    : primaryTabs.filter((tab) => tab.id !== 2);
  const debitorCustomerAddress = getSelectedCustomerAddress(
    selectedDebitorCustomer,
  );
  const debitorCustomerName =
    getCustomerDisplayName(selectedDebitorCustomer) ||
    selectedDebitorCustomer?.mobileNo ||
    "";
  const debitorCustomerAddressText = formatCustomerAddress(
    debitorCustomerAddress,
  );

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
        showToast("error", t("noItemsAvailableForSplit"));
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
    setSelectedDebitorCustomer(null);
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
    orderSubTotal?: number;
    orderDiscountTotal?: number;
    orderDeliveryCharge?: number;
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
    setCurrentOrderSubTotal(
      toNumber(resetPayment?.orderSubTotal, currentOrderSubTotal),
    );
    setCurrentOrderDiscountTotal(
      Math.max(
        toNumber(resetPayment?.orderDiscountTotal, currentOrderDiscountTotal),
        0,
      ),
    );
    setCurrentOrderDeliveryCharge(
      Math.max(
        toNumber(resetPayment?.orderDeliveryCharge, currentOrderDeliveryCharge),
        0,
      ),
    );
    setCustomDeliveryCharge(null);
    setDeliveryChargeValue(
      `${Math.max(
        toNumber(resetPayment?.orderDeliveryCharge, currentOrderDeliveryCharge),
        0,
      )}`,
    );
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

  useEffect(() => {
    const preferredDeliveryCharge =
      currentOrderDeliveryTypeId === 1 &&
      customDeliveryCharge != null
        ? customDeliveryCharge
        : currentOrderDeliveryTypeId === 1 &&
      currentSelectedAddressDeliveryCharge != null
        ? currentSelectedAddressDeliveryCharge
        : currentOrderDeliveryTypeId === 1 &&
            resolvedSettingsDeliveryCharge != null
          ? resolvedSettingsDeliveryCharge
          : resolvedOrderDeliveryCharge;
    setDeliveryChargeValue(
      preferredDeliveryCharge > 0 ? `${preferredDeliveryCharge}` : "",
    );
  }, [
    customDeliveryCharge,
    resolvedOrderDeliveryCharge,
    currentOrderDeliveryTypeId,
    currentSelectedAddressDeliveryCharge,
    resolvedSettingsDeliveryCharge,
  ]);

  const openDeliveryChargeEditor = () => {
    if (!showDeliveryChargeField || isSplitMode) {
      return;
    }

    setDeliveryChargeDraft(
      deliveryChargeValue ||
        `${Math.max(
          toNumber(currentSelectedAddressDeliveryCharge, 0),
          toNumber(resolvedSettingsDeliveryCharge, 0),
          toNumber(currentOrderDeliveryCharge, 0),
          0,
        )}`,
    );
    setDeliveryChargeEditorVisible(true);
  };

  const handleSaveDeliveryCharge = () => {
    const nextDeliveryCharge = round2(
      clamp(toAmount(deliveryChargeDraft), 0, 999999),
    );
    setCurrentOrderDeliveryCharge(nextDeliveryCharge);
    setCustomDeliveryCharge(nextDeliveryCharge);
    setDeliveryChargeValue(
      nextDeliveryCharge > 0 ? `${nextDeliveryCharge}` : "",
    );
    setDeliveryChargeEditorVisible(false);
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
    const debitorCustomerDetails =
      paymentMethod === 5
        ? buildDebitorCustomerDetails(selectedDebitorCustomer, companyId)
        : null;
    return {
      id: paymentMethod,
      label: getPaymentLabel(paymentMethod, t),
      paymentMethod,
      tip: tipNum,
      deliveryCharge: displayDeliveryCharge,
      giftCardTotal,
      cashProvided: paymentMethod === 0 ? toAmount(cashProvided) : undefined,
      isCorporate,
      orderPaymentSummary: { paymentProcessorId: paymentMethod },
      isItemSplit: isSplitMode,
      splitSelections: isSplitMode ? splitSelections : undefined,
      splitItemTotal: isSplitMode ? splitItemTotal : undefined,
      ...(paymentMethod === 5 && selectedDebitorCustomer
        ? {
            selectedCustomer: selectedDebitorCustomer,
            debitorCustomerDetails,
            customerId: selectedDebitorCustomer.id ?? null,
            customerAddressId:
              selectedDebitorCustomer.customerAddressId ??
              debitorCustomerAddress?.id ??
              null,
          }
        : {}),
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
      showToast("error", t("selectAtLeastOneItemToSplit"));
      return;
    }
    const paymentMethod = resolvePaymentMethod();
    if (paymentMethod == null) {
      showToast("error", t("selectPaymentMethod"));
      return;
    }
    if (paymentMethod === 5 && !selectedDebitorCustomer) {
      showToast("error", t("pleaseSelectDebitorCustomer"));
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
      console.log("Payment failed:", error);
      showToast("error", t("unableToProcessPayment"));
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrintPreview = async () => {
    if (isProcessing) return;
    if (resolvePaymentMethod() === 5 && !selectedDebitorCustomer) {
      showToast("error", t("pleaseSelectDebitorCustomer"));
      return;
    }
    setIsProcessing(true);
    try {
      const option = buildPaymentOption(true);
      await getCurrentFlowHandlers()?.onPrintPreview?.(option);
    } catch (error) {
      console.error("Print preview failed:", error);
      showToast("error", t("unableToGeneratePrintPreview"));
    } finally {
      setIsProcessing(false);
    }
  };

  const addGiftCard = async (forSplit: boolean) => {
    if (!companyId) {
      showToast("error", t("companyDetailsMissingForGiftCard"));
      return;
    }
    const code = (forSplit ? splitGiftCode : giftCode).trim();
    if (!code) {
      showToast("error", t("enterGiftCardCode"));
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
        showToast("error", t("invalidGiftCardCode"));
        return;
      }

      if (gift.remainingBalance <= 0 || gift.remainingBalance == 0.0) {
        showToast("error", t("giftCardZeroBalance"));
        return;
      }

      const start = toStartOfDay(gift?.startDate ?? gift?.startDateTime);
      const expiry = toStartOfDay(gift?.expiryDate ?? gift?.expiryDateTime);
      const today = toStartOfDay(new Date());
      if (start && today && start > today) {
        showToast("error", t("giftCardValidFrom", { date: formatDate(start) }));
        return;
      }
      if (expiry && today && expiry < today) {
        showToast(
          "error",
          t("giftCardExpiredOn", { date: formatDate(expiry) }),
        );
        return;
      }

      if (forSplit) {
        setSplitGiftCard(gift);
        setSplitGiftCode("");
      } else {
        setGiftCard(gift);
        setGiftCode("");
      }
      showToast("success", t("giftCardApplied"));
    } catch (error) {
      console.error("Gift card lookup failed:", error);
      showToast("error", t("unableToApplyGiftCard"));
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
                    {t("otherPayments")}
                  </Text>
                  <TouchableOpacity
                    onPress={handleOtherBack}
                    style={styles.linkBtn}
                  >
                    <Text style={{ color: colors.textSecondary }}>
                      {t("back")}
                    </Text>
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
                {selectedOtherMethod === 5 ? (
                  <View style={{ marginTop: 8 }}>
                    <Text
                      style={{ color: colors.textSecondary, marginBottom: 8 }}
                    >
                      {t("debitorCustomer")}
                    </Text>

                    {selectedDebitorCustomer ? (
                      <View
                        style={[
                          styles.debitorCustomerCard,
                          {
                            borderColor: colors.primary,
                            backgroundColor:
                              colors.surfaceHover || colors.surface,
                          },
                        ]}
                      >
                        <Text style={{ color: colors.text, fontWeight: "800" }}>
                          {debitorCustomerName}
                        </Text>
                        {selectedDebitorCustomer.customerCompanyName ? (
                          <Text
                            style={{
                              color: colors.textSecondary,
                              marginTop: 4,
                            }}
                          >
                            {selectedDebitorCustomer.customerCompanyName}
                          </Text>
                        ) : null}
                        {selectedDebitorCustomer.mobileNo ? (
                          <Text
                            style={{
                              color: colors.textSecondary,
                              marginTop: 4,
                            }}
                          >
                            {selectedDebitorCustomer.mobileNo}
                          </Text>
                        ) : null}
                        {debitorCustomerAddressText ? (
                          <Text
                            style={{
                              color: colors.textSecondary,
                              marginTop: 4,
                              lineHeight: 18,
                            }}
                          >
                            {debitorCustomerAddressText}
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.debitorCustomerCard,
                          {
                            borderColor: colors.border,
                            backgroundColor: colors.surface,
                          },
                        ]}
                      >
                        <Text style={{ color: colors.textSecondary }}>
                          {t("searchSelectCreateDebitorCustomerForThisPayment")}
                        </Text>
                      </View>
                    )}

                    <View style={styles.debitorActionRow}>
                      <TouchableOpacity
                        onPress={() => {
                          setCustomerDrawerMode("list");
                          setCustomerDrawerVisible(true);
                        }}
                        style={[
                          styles.ghostBtn,
                          styles.debitorActionBtn,
                          { borderColor: colors.border },
                        ]}
                      >
                        <Text style={{ color: colors.text, fontWeight: "700" }}>
                          {t("selectCustomer")}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          setCustomerDrawerMode("form");
                          setCustomerDrawerVisible(true);
                        }}
                        style={[
                          styles.debitorAddBtn,
                          { backgroundColor: colors.primary },
                        ]}
                      >
                        <Text
                          style={{
                            color: colors.textInverse,
                            fontWeight: "700",
                          }}
                        >
                          {t("addCustomer")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : isSplitMode ? (
              <View>
                <View style={styles.sectionHeaderRow}>
                  <Text style={{ color: colors.textSecondary }}>
                    {t("splitItemsPaySelectedQuantityOnly")}
                  </Text>
                </View>
                <View style={styles.splitHeaderRow}>
                  {[
                    { id: 0, label: t("cash") },
                    { id: 1, label: t("card") },
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
                            color: selected ? colors.textInverse : colors.text,
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
                <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>
                  {t("paymentMethods")}
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
                    {t("cashProvided")}
                  </Text>
                  <TextInput
                    keyboardType="numeric"
                    placeholder={t("enterCashAmount")}
                    placeholderTextColor={colors.textSecondary}
                    value={cashProvided}
                    onChangeText={setCashProvided}
                    style={[
                      styles.input,
                      { borderColor: colors.border, color: colors.text },
                    ]}
                  />

                  <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
                    {t("cashToReturn")}
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
                    {t("cardPaymentSelected")}
                  </Text>
                </View>
              )}

              {isSplitMode ? (
                <View>
                  {currentSplitItems.length == 0 ? (
                    <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
                      {t("noItemsAvailableForSplit")}
                    </Text>
                  ) : (
                    currentSplitItems.map((item, index) => {
                      const selectedQty = Math.max(
                        0,
                        Math.floor(splitSelections[index] || 0),
                      );
                      const optionsSummary = getItemOptionsSummary(item as any);
                      const voucherDetailLines = getVoucherDetailLines(
                        item as any,
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
                            {!!optionsSummary && (
                              <Text
                                style={{
                                  color: colors.textSecondary,
                                  marginTop: 2,
                                  fontSize: 12,
                                }}
                              >
                                {optionsSummary}
                              </Text>
                            )}
                            {voucherDetailLines.length > 0 && (
                              <View style={{ marginTop: 2, marginBottom: 4 }}>
                                {voucherDetailLines.map((line) => (
                                  <Text
                                    key={`${item.key}-${line.key}`}
                                    style={{
                                      color: colors.textSecondary,
                                      marginTop: 2,
                                      marginLeft: line.indent,
                                      fontSize: line.isSection ? 10 : 12,
                                      fontWeight:
                                        line.isSection || line.isItem
                                          ? "600"
                                          : "400",
                                      textTransform: line.isSection
                                        ? "uppercase"
                                        : "none",
                                      letterSpacing: line.isSection ? 0.6 : 0,
                                    }}
                                  >
                                    {line.text}
                                  </Text>
                                ))}
                              </View>
                            )}
                            {Array.isArray(item.attributeValues) &&
                            item.attributeValues.length > 0 ? (
                              <View style={{ marginTop: 2, marginBottom: 4 }}>
                                {item.attributeValues.map(
                                  (attributeValue: any, valueIndex: number) => {
                                    const name =
                                      getAttributeValueName(attributeValue);
                                    const valueQuantity =
                                      getAttributeValueQuantity(attributeValue);
                                    const valuePrice =
                                      getAttributeValuePrice(attributeValue);
                                    if (!name) return null;

                                    return (
                                      <Text
                                        key={`${item.key}-value-${valueIndex}`}
                                        style={{
                                          color: colors.textSecondary,
                                          marginTop: 2,
                                          fontSize: 12,
                                        }}
                                      >
                                        • {valueQuantity} x {name}
                                        {valuePrice > 0
                                          ? ` (+${formatCurrency(valuePrice)})`
                                          : ""}
                                      </Text>
                                    );
                                  },
                                )}
                              </View>
                            ) : null}
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
                      {t("selected")}: {formatCurrency(splitItemTotal)}
                    </Text>
                    <Text style={{ color: colors.text, fontWeight: "700" }}>
                      {t("remaining")}: {formatCurrency(splitRemainingAmount)}
                    </Text>
                  </View>
                </View>
              ) : null}

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: colors.textSecondary }}>
                  {t("addTipOptional")}
                </Text>
                <TextInput
                  keyboardType="numeric"
                  placeholder={t("enterTipAmount")}
                  placeholderTextColor={colors.textSecondary}
                  value={tipValue}
                  onChangeText={setTipValue}
                  style={[
                    styles.input,
                    { borderColor: colors.border, color: colors.text },
                  ]}
                />
              </View>

              {showDeliveryChargeField ? (
                <View style={{ marginTop: 12 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 8,
                      gap: 10,
                    }}
                  >
                    <Text style={{ color: colors.textSecondary }}>
                      {t("deliveryCharge")}
                    </Text>
                    {!isSplitMode ? (
                      <TouchableOpacity
                        onPress={openDeliveryChargeEditor}
                        style={{
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: colors.border,
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          backgroundColor:
                            colors.surfaceHover || colors.surface,
                        }}
                      >
                        <Text
                          style={{
                            color: colors.primary,
                            fontWeight: "700",
                            fontSize: 12,
                          }}
                        >
                          {t("change")}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.input,
                      {
                        borderColor: colors.border,
                        justifyContent: "center",
                        backgroundColor: colors.surfaceHover || colors.surface,
                      },
                    ]}
                  >
                    <Text style={{ color: colors.text, fontWeight: "700" }}>
                      {formatCurrency(deliveryChargeNum)}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 12,
                      marginTop: 8,
                      lineHeight: 18,
                    }}
                  >
                    {isSplitMode && splitRemainingAmount > 0
                      ? t("deliveryChargeAppliedOnlyWhenFinalSplitSettled")
                      : currentSelectedAddressDeliveryCharge != null
                          ? t("deliveryChargeUnlockedAddress")
                          : resolvedSettingsDeliveryCharge != null
                            ? t("deliveryChargeUnlockedSettings")
                            : t("deliveryChargeNoAddress")}
                  </Text>
                </View>
              ) : null}

              {showGiftCardSection ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ color: colors.textSecondary }}>
                    {t("giftCard")}
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
                        <Text style={{ color: colors.text, fontWeight: "700" }}>
                          {getGiftCardLabel(activeGiftCard, t)}
                        </Text>
                        <Text
                          style={{
                            color: colors.textSecondary,
                            marginTop: 2,
                          }}
                        >
                          {t("selected")}: {formatCurrency(giftCardTotal)}
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
                          {t("remove")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.giftCardInputRow}>
                      <TextInput
                        placeholder={t("giftCardCode")}
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
                            {t("add")}
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
                <Text style={{ color: colors.textSecondary }}>
                  {t("subtotal")}
                </Text>
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {formatCurrency(displaySubTotal)}
                </Text>
              </View>
              {displayDiscount > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={{ color: colors.textSecondary }}>
                    {t("discount")}
                  </Text>
                  <Text style={{ color: colors.error, fontWeight: "700" }}>
                    -{formatCurrency(displayDiscount)}
                  </Text>
                </View>
              ) : null}
              {displayDeliveryCharge > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={{ color: colors.textSecondary }}>
                    {t("deliveryCharge")}
                  </Text>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>
                    {formatCurrency(displayDeliveryCharge)}
                  </Text>
                </View>
              ) : null}
              {tipNum > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={{ color: colors.textSecondary }}>
                    {t("tip")}
                  </Text>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>
                    {formatCurrency(tipNum)}
                  </Text>
                </View>
              ) : null}
              {giftCardTotal > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={{ color: colors.textSecondary }}>
                    {t("giftCard")}
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
                  {t("orderTotal")}
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
                    {t("back")}
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
                    {t("cancel")}
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
                      {t("printPreview")}
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
                    {t("pay")}
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
                    {t("payAndPrint")}
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
                      {t("operatingExpense")}
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </View>
      <AppBottomSheet
        visible={deliveryChargeEditorVisible}
        onClose={() => setDeliveryChargeEditorVisible(false)}
        title={t("deliveryCharge")}
        subtitle={`${t("change")} ${t("deliveryCharge")}`}
        snapPoints={["40%"]}
        scrollable={false}
        footer={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={() => setDeliveryChargeEditorVisible(false)}
              style={[
                styles.footerBtn,
                {
                  flex: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>
                {t("cancel")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSaveDeliveryCharge}
              style={[
                styles.footerBtnPrimary,
                {
                  flex: 1,
                  backgroundColor: colors.primary,
                },
              ]}
            >
              <Text style={{ color: colors.textInverse, fontWeight: "700" }}>
                {t("save")}
              </Text>
            </TouchableOpacity>
          </View>
        }
      >
        <View>
          <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>
            {t("deliveryCharge")}
          </Text>
          <AppBottomSheetTextInput
            keyboardType="numeric"
            placeholder={t("enterDeliveryCharge")}
            placeholderTextColor={colors.textSecondary}
            value={deliveryChargeDraft}
            onChangeText={(value) =>
              setDeliveryChargeDraft(sanitizeAmountInput(value))
            }
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.text, marginTop: 0 },
            ]}
          />
        </View>
      </AppBottomSheet>
      <CustomerDrawer
        visible={customerDrawerVisible}
        selectedCustomer={selectedDebitorCustomer}
        debitorOnly
        forceDebitor
        initialMode={customerDrawerMode}
        onClose={() => setCustomerDrawerVisible(false)}
        onSelect={(customer) => {
          setSelectedDebitorCustomer(
            customer?.isDebitor === true ? customer : null,
          );
        }}
      />
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
  debitorCustomerCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  debitorActionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  debitorActionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  debitorAddBtn: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
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
