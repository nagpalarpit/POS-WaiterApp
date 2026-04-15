import React, {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { useTheme } from "../theme/ThemeProvider";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import Card from "../components/Card";
import orderService from "../services/orderService";
import localDatabase from "../services/localDatabase";
import tscService from "../services/tscService";
import commonFunctionService from "../services/commonFunctionService";
import { getOrderStatusLabel, ORDER_STATUS } from "../utils/orderUtils";
import {
  getAttributeValueName,
  getAttributeValuePrice,
  getAttributeValueQuantity,
  getCartItemQuantity,
  getItemLineTotal,
  getItemOptionsSummary,
  getItemUnitTotal,
} from "../utils/cartCalculations";
import PinModal from "../components/PinModal";
import CancelOrderModal from "../components/CancelOrderModal";
import { formatCurrency } from "../utils/currency";
import {
  emitOrderCompletionStarted,
  emitOrderSync,
  emitPosCancelPrint,
  emitPosPrint,
  emitPosPrintPreview,
  lockOrder,
  sanitizeOrderInfoForPos,
  lockPayment,
  unlockOrder,
} from "../services/orderSyncService";
import { useToast } from "../components/ToastProvider";
import { setPaymentFlowHandlers } from "../services/paymentFlowStore";
import serverConnection from "../services/serverConnection";
import { formatOrderServiceTime } from "../utils/orderServiceDisplay";
import { useTranslation } from "../contexts/LanguageContext";
import { getVoucherDetailLines } from "../utils/voucherDetails";
import {
  mergeOrderCustomerData,
  formatCustomerAddress,
  getCustomerDisplayName,
  getSelectedCustomerAddress,
  resolveOrderCustomer,
} from "../utils/customerData";
import { useSettings } from "../hooks/useSettings";

const TSC_OFFLINE_MESSAGE =
  "Active TSS not found for the given POS and company.";

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

const round2 = (value: number): number => Number(value.toFixed(2));
const normalizeGiftCardLogs = (value: any) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return Array.isArray(value) ? value : [value];
};
const mergeSnapshotObject = (primary: any, fallback: any) => ({
  ...(fallback && typeof fallback === "object" ? fallback : {}),
  ...(primary && typeof primary === "object" ? primary : {}),
});
const mergeUserAccessSnapshot = (...accessLists: any[]) => {
  const mergedByIndex: Record<number, any> = {};

  accessLists.forEach((accessList) => {
    if (!Array.isArray(accessList)) {
      return;
    }

    accessList.forEach((entry: any, index: number) => {
      mergedByIndex[index] = mergeSnapshotObject(entry, mergedByIndex[index] || {});

      if (mergedByIndex[index].userAccessTypeId === undefined) {
        mergedByIndex[index].userAccessTypeId = null;
      }
    });
  });

  return Object.keys(mergedByIndex)
    .map((key) => Number(key))
    .sort((a, b) => a - b)
    .map((key) => mergedByIndex[key]);
};
const enrichBulkSettleOrderInfo = (
  orderInfo: any,
  sourceOrder: any,
  sourceOrderDetails: any,
  sourceUserData: any,
  sourceSettings: any,
  options: { includeFinalSettlementFields?: boolean } = {},
) => {
  if (!orderInfo || typeof orderInfo !== "object") {
    return orderInfo;
  }

  const enriched = orderInfo;
  const userSources = [sourceUserData, sourceOrder?.user, sourceOrderDetails?.user].filter(
    (item) => item && typeof item === "object",
  );
  const userCompanySources = [
    sourceUserData?.company,
    sourceOrder?.user?.company,
    sourceOrderDetails?.user?.company,
  ].filter((item) => item && typeof item === "object");
  const tableAreaSources = [
    sourceOrder?.tableArea,
    sourceOrderDetails?.tableArea,
  ].filter((item) => item && typeof item === "object");
  const tableAreaCompanySources = [
    sourceOrder?.tableArea?.company,
    sourceOrderDetails?.tableArea?.company,
  ].filter((item) => item && typeof item === "object");
  const companySources = [
    sourceUserData?.company,
    sourceOrder?.company,
    sourceOrderDetails?.company,
  ].filter((item) => item && typeof item === "object");

  if (userSources.length > 0 || enriched.user) {
    const mergedUser = userSources.reduce(
      (acc, candidate) => mergeSnapshotObject(candidate, acc),
      {},
    );
    enriched.user = mergeSnapshotObject(enriched.user, mergedUser);
    if (enriched.user.imagePath === undefined) enriched.user.imagePath = null;
    if (enriched.user.designation === undefined) enriched.user.designation = null;
    if (enriched.user.steuerId === undefined) enriched.user.steuerId = null;
    if (enriched.user.customerCompanyName === undefined) {
      enriched.user.customerCompanyName = null;
    }
    if (enriched.user.role === undefined) enriched.user.role = null;
    enriched.user.company = mergeSnapshotObject(
      enriched.user.company,
      mergeSnapshotObject(
        sourceSettings?.company,
        userCompanySources.reduce(
          (acc, candidate) => mergeSnapshotObject(candidate, acc),
          {},
        ),
      ),
    );
    if (enriched.user.company.middleName === undefined) {
      enriched.user.company.middleName = null;
    }
    enriched.user.userAccess = mergeUserAccessSnapshot(
      sourceUserData?.userAccess,
      sourceOrder?.user?.userAccess,
      sourceOrderDetails?.user?.userAccess,
      enriched.user.userAccess,
    );
  }

  if (tableAreaSources.length > 0 || enriched.tableArea) {
    enriched.tableArea = mergeSnapshotObject(
      enriched.tableArea,
      tableAreaSources.reduce(
        (acc, candidate) => mergeSnapshotObject(candidate, acc),
        {},
      ),
    );
    enriched.tableArea.company = mergeSnapshotObject(
      enriched.tableArea.company,
      mergeSnapshotObject(
        sourceSettings?.company,
        tableAreaCompanySources.reduce(
          (acc, candidate) => mergeSnapshotObject(candidate, acc),
          {},
        ),
      ),
    );
    if (enriched.tableArea.freeTables === undefined) {
      enriched.tableArea.freeTables = "[]";
    }
    if (enriched.tableArea.company.middleName === undefined) {
      enriched.tableArea.company.middleName = null;
    }
  }

  enriched.company = mergeSnapshotObject(
    enriched.company,
    mergeSnapshotObject(
      sourceSettings?.company,
      companySources.reduce(
        (acc, candidate) => mergeSnapshotObject(candidate, acc),
        {},
      ),
    ),
  );
  if (enriched.company.middleName === undefined) {
    enriched.company.middleName = null;
  }
  if (enriched.company.vat === undefined) {
    enriched.company.vat =
      sourceSettings?.vat ??
      sourceSettings?.company?.vat ??
      sourceOrderDetails?.company?.vat ??
      sourceOrder?.company?.vat ??
      sourceUserData?.company?.vat ??
      undefined;
  }

  if (enriched.printObj === undefined) {
    enriched.printObj = sourceOrderDetails?.printObj ?? sourceOrder?.printObj;
  }

  if (options.includeFinalSettlementFields) {
    if (enriched.atgPinsPayloads === undefined) {
      enriched.atgPinsPayloads =
        sourceOrderDetails?.atgPinsPayloads ??
        sourceOrder?.atgPinsPayloads ??
        [];
    }

    if (enriched.reason === undefined) {
      enriched.reason = sourceOrderDetails?.reason ?? sourceOrder?.reason ?? "";
    }

    if (enriched.isDeleted === undefined) {
      enriched.isDeleted =
        sourceOrderDetails?.isDeleted ?? sourceOrder?.isDeleted ?? false;
    }

    if (enriched.isCorporate === undefined) {
      enriched.isCorporate =
        sourceOrderDetails?.isCorporate ?? sourceOrder?.isCorporate ?? false;
    }

    if (enriched.canceledOrderPayment === undefined) {
      enriched.canceledOrderPayment =
        sourceOrderDetails?.canceledOrderPayment ??
        sourceOrder?.canceledOrderPayment ??
        0;
    }
  }

  if (enriched.tip === undefined) {
    enriched.tip = sourceOrderDetails?.tip ?? sourceOrder?.tip ?? 0;
  }

  return enriched;
};
const buildOrderSyncInfo = (
  orderInfo: any,
  orderNumber?: string | number | null,
) => {
  const normalized = sanitizeOrderInfoForPos(mergeOrderCustomerData({
    ...(orderInfo || {}),
    orderNumber:
      orderInfo?.orderNumber ||
      orderInfo?.customOrderId ||
      orderNumber ||
      orderInfo?._id ||
      orderInfo?.id,
  }));

  delete normalized.isPaid;
  delete normalized.orderEditInOffline;

  return normalized;
};

const sanitizePersistedOrderDetails = (orderInfo: any) => {
  if (!orderInfo || typeof orderInfo !== "object") {
    return orderInfo;
  }

  const sanitized = {
    ...orderInfo,
  };

  delete sanitized._id;
  delete sanitized.id;

  return sanitized;
};
const buildDiscountPayload = (
  source: any,
  subtotal: number,
  discountAmount: number,
) => {
  const existing = source?.discount ?? source?.orderInfo?.discount;
  const existingValue = toNumber(existing?.discountValue, 0);
  if (existingValue > 0) return existing;

  const customValue = toNumber(
    source?.customDiscountValue ?? source?.orderInfo?.customDiscountValue,
    0,
  );
  if (customValue > 0) {
    return {
      ...(existing || {}),
      discountValue: customValue,
      discountType: "CUSTOM",
      discountName: existing?.discountName ?? "Custom",
    };
  }

  if (discountAmount > 0 && subtotal > 0) {
    const percentValue = round2((discountAmount / subtotal) * 100);
    return {
      ...(existing || {}),
      discountValue: percentValue,
      discountType: "PERCENTAGE",
      discountName: existing?.discountName ?? "Percentage",
    };
  }

  return existing ?? null;
};

const resolveDiscountId = (source: any, discountPayload: any) =>
  discountPayload?.id ??
  source?.discountId ??
  source?.discount?.id ??
  source?.orderInfo?.discountId ??
  source?.orderInfo?.discount?.id;

const getOrderItemCount = (items: any[]): number =>
  items.reduce(
    (sum: number, item: any) => sum + Math.max(getCartItemQuantity(item), 0),
    0,
  );

const normalizeTaxKey = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.includes("%")) return raw.replace(/\s+/g, "");
  const parsed = parseFloat(raw.replace(",", "."));
  if (Number.isFinite(parsed)) return `${parsed}%`;
  return raw;
};


const getOrderItemsForTax = (orderDetails: any): any[] => {
  const items =
    orderDetails?.orderItem ??
    orderDetails?.orderItems ??
    orderDetails?.items ??
    [];
  return Array.isArray(items) ? items : [];
};

const getPosItemToppings = (item: any) => {
  const toppings: Array<{ price: number; toppingCount: number }> = [];

  if (item?.orderItemVariant) {
    const attributes = Array.isArray(item?.orderItemVariant?.orderItemVariantAttributes)
      ? item.orderItemVariant.orderItemVariantAttributes
      : [];
    attributes.forEach((attribute: any) => {
      const values = Array.isArray(attribute?.orderItemVariantAttributeValues)
        ? attribute.orderItemVariantAttributeValues
        : [];
      values.forEach((value: any) => {
        toppings.push({
          price: toNumber(value?.unitPrice, 0),
          toppingCount: Math.max(toNumber(value?.quantity, 1), 1),
        });
      });
    });
    return toppings;
  }

  const variants = Array.isArray(item?.orderItemVariants)
    ? item.orderItemVariants
    : [];
  variants.forEach((variant: any) => {
    const attributes = Array.isArray(variant?.orderItemVariantAttributes)
      ? variant.orderItemVariantAttributes
      : [];
    attributes.forEach((attribute: any) => {
      const values = Array.isArray(attribute?.orderItemVariantAttributeValues)
        ? attribute.orderItemVariantAttributeValues
        : [];
      values.forEach((value: any) => {
        toppings.push({
          price: toNumber(value?.unitPrice, 0),
          toppingCount: Math.max(toNumber(value?.quantity, 1), 1),
        });
      });
    });
  });

  return toppings;
};

const getPosItemUnitPrice = (item: any): number => {
  const basePrice = toNumber(
    item?.unitPrice ?? item?.itemPrice ?? item?.price,
    0,
  );
  const variantPrice = toNumber(item?.orderItemVariant?.unitPrice, 0);
  return basePrice + variantPrice;
};

const resolveTaxMeta = (
  orderDetails: any,
  item: any,
): { taxKey: string | null; taxAmount: number } => {
  const taxInfo = item?.tax ?? item?.taxInfo ?? item?.taxObj ?? null;
  let taxKey = normalizeTaxKey(
    taxInfo?.name ?? taxInfo?.taxName ?? taxInfo?.percentage,
  );
  let taxAmount = toNumber(taxInfo?.flatAmount ?? taxInfo?.taxAmount, 0);

  const parsedKey = taxKey
    ? parseFloat(taxKey.replace("%", "").replace(",", "."))
    : Number.NaN;

  if (!taxAmount && Number.isFinite(parsedKey)) {
    taxAmount = 1 + parsedKey / 100;
  }

  const orderIdNum = toNumber(
    orderDetails?.id ?? orderDetails?.orderId ?? orderDetails?.orderInfo?.id,
    Number.NaN,
  );
  if (Number.isFinite(orderIdNum)) {
    const defaultThreshold = 8162;
    const deliveryTypeId = Number(
      orderDetails?.orderDeliveryTypeId ??
      orderDetails?.orderInfo?.orderDeliveryTypeId ??
      0,
    );
    if (orderIdNum <= defaultThreshold && deliveryTypeId === 0) {
      taxKey = "19%";
      taxAmount = 1.19;
    }
  }

  return {
    taxKey,
    taxAmount: taxAmount || 1,
  };
};
const resolveDiscountAmount = (orderDetails: any, subtotal: number): number => {
  const explicit = round2(toNumber(orderDetails?.orderDiscountTotal, 0));
  if (explicit > 0) return explicit;

  const discount = orderDetails?.discount;
  const customValue = toNumber(
    orderDetails?.customDiscountValue ?? discount?.customDiscountValue,
    0,
  );
  const discountValue = toNumber(
    discount?.discountValue ?? discount?.value ?? customValue,
    0,
  );
  if (discountValue <= 0 || subtotal <= 0) return 0;

  const discountType = discount?.discountType;
  const isPercent =
    discountType === 1 ||
    discountType === "1" ||
    discountType === "PERCENTAGE" ||
    discountType === "CUSTOM";

  if (isPercent) {
    return round2(Math.min((subtotal * discountValue) / 100, subtotal));
  }

  return round2(Math.min(discountValue, subtotal));
};
const mergeCartItems = (cartItems: any[] = []) => {
  const mergedItems: Record<string, any> = {};
  cartItems.forEach((item: any) => {
    if (!item) return;
    const key = item.cartId || item.itemId || item.menuItemId || item._id;
    if (mergedItems[key]) {
      mergedItems[key].quantity += toNumber(item.quantity, 0);
    } else {
      mergedItems[key] = { ...item };
    }
  });
  return Object.values(mergedItems);
};

const getCanceledPayment = (items: any[] = []) => {
  let canceledOrderPayment = 0;
  items.forEach((raw) => {
    if (!raw) return;
    const item = {
      ...raw,
      itemPrice: toNumber(raw?.unitPrice ?? raw?.itemPrice, 0),
      quantity: toNumber(raw?.quantity, 0),
      variantPrice: toNumber(
        raw?.orderItemVariant?.unitPrice ?? raw?.variantPrice,
        0,
      ),
      attributeValues:
        raw?.orderItemVariant?.orderItemVariantAttributes?.[0]?.orderItemVariantAttributeValues?.map(
          (x: any) => ({
            ...x,
            attributeValuePrice: toNumber(x?.unitPrice, 0),
            quantity: toNumber(x?.quantity, 1),
          }),
        ) ||
        raw?.attributeValues ||
        [],
    };

    let total = item.itemPrice + (item.variantPrice || 0);
    total =
      item.attributeValues?.reduce(
        (acc: number, current: any) =>
          acc +
          toNumber(current?.attributeValuePrice ?? current?.price, 0) *
          toNumber(current?.quantity, 1),
        total,
      ) || total;
    canceledOrderPayment += total * toNumber(item.quantity, 0);
  });
  return canceledOrderPayment;
};

const normalizeAttributeValues = (values: any[] = []) => {
  return values.filter(Boolean).map((value: any) => ({
    attributeValueId:
      value.menuItemVariantAttributeValueId ??
      value.attributeValueId ??
      value.id,
    attributeValueName:
      value.menuItemVariantAttributeValue?.name ??
      value.attributeValueName ??
      value.name ??
      "",
    attributeValuePrice: toNumber(
      value.unitPrice ??
      value.attributeValuePrice ??
      value.price ??
      value.menuItemVariantAttributeValue?.price,
      0,
    ),
    attributeValueQuantity: Math.max(
      toNumber(value.quantity ?? value.attributeValueQuantity, 1),
      1,
    ),
  }));
};

const extractFromVariants = (variants: any[] = []) => {
  const variantNames = new Set<string>();
  let variantPrice = 0;
  const attributeNames = new Set<string>();
  const attributeValues: any[] = [];

  variants.forEach((variant: any) => {
    const variantName =
      variant?.menuItemVariant?.name ||
      variant?.name ||
      variant?.variantName ||
      "";
    if (variantName) variantNames.add(variantName);

    variantPrice += toNumber(
      variant?.unitPrice ??
      variant?.price ??
      variant?.variantPrice ??
      variant?.menuItemVariant?.price,
      0,
    );

    const variantAttributes = Array.isArray(variant?.orderItemVariantAttributes)
      ? variant.orderItemVariantAttributes
      : Array.isArray(variant?.menuItemVariantAttributes)
        ? variant.menuItemVariantAttributes
        : [];

    variantAttributes.forEach((attribute: any) => {
      const attributeName =
        attribute?.menuItemVariantAttribute?.name ||
        attribute?.attributeName ||
        attribute?.name ||
        "";
      if (attributeName) attributeNames.add(attributeName);

      const values = Array.isArray(attribute?.orderItemVariantAttributeValues)
        ? attribute.orderItemVariantAttributeValues
        : Array.isArray(attribute?.menuItemVariantAttributeValues)
          ? attribute.menuItemVariantAttributeValues
          : Array.isArray(attribute?.attributeValues)
            ? attribute.attributeValues
            : [];
      attributeValues.push(...normalizeAttributeValues(values));
    });
  });

  return {
    variantName: Array.from(variantNames).join(", "),
    variantPrice,
    attributeName:
      attributeNames.size === 1 ? Array.from(attributeNames)[0] : undefined,
    attributeValues,
  };
};

const normalizeOrderItem = (item: any, index: number) => {
  const variantCandidates = Array.isArray(item?.orderItemVariants)
    ? item.orderItemVariants
    : item?.orderItemVariant
      ? [item.orderItemVariant]
      : [];

  const variantDetails = extractFromVariants(variantCandidates);
  const directAttributeValues = normalizeAttributeValues(
    item?.attributeValues || [],
  );
  const quantity = Math.max(toNumber(item?.quantity, 1), 1);

  return {
    ...item,
    cartId:
      item?.cartId ||
      item?._id ||
      `order-item-${item?.menuItemId || item?.itemId || item?.customId || index}-${index}`,
    quantity,
    itemName: item?.itemName || item?.name || "",
    itemPrice: toNumber(item?.itemPrice ?? item?.unitPrice ?? item?.price, 0),
    variantName:
      item?.variantName ||
      item?.orderItemVariant?.name ||
      variantDetails.variantName,
    variantPrice: toNumber(
      item?.variantPrice ??
      item?.orderItemVariant?.variantPrice ??
      item?.orderItemVariant?.price ??
      item?.orderItemVariant?.unitPrice,
      variantDetails.variantPrice,
    ),
    attributeName: item?.attributeName || variantDetails.attributeName,
    attributeValues:
      directAttributeValues.length > 0
        ? directAttributeValues
        : variantDetails.attributeValues,
    orderItemNote: item?.orderItemNote || item?.note || "",
  };
};

const getOrderTypeLabel = (deliveryType: number, t: (key: string) => string, tableNo?: number) => {
  if (tableNo) return `${t("table")} ${tableNo}`;
  if (deliveryType === 1) return t("delivery");
  if (deliveryType === 2) return t("pickup");
  return t("dineIn");
};

const getStatusTone = (statusLabel: string, colors: any) => {
  const normalized = statusLabel.toLowerCase();
  if (normalized.includes("pending"))
    return { fg: colors.warning, bg: colors.warning + "20" };
  if (normalized.includes("confirm") || normalized.includes("transit")) {
    return {
      fg: colors.info || colors.primary,
      bg: (colors.info || colors.primary) + "20",
    };
  }
  if (normalized.includes("deliver") || normalized.includes("paid")) {
    return { fg: colors.success, bg: colors.success + "20" };
  }
  if (normalized.includes("cancel") || normalized.includes("reject")) {
    return { fg: colors.error, bg: colors.error + "20" };
  }
  return {
    fg: colors.textSecondary,
    bg: colors.surfaceHover || colors.background,
  };
};

const formatTimestamp = (timestamp?: string, fallback = "") => {
  if (!timestamp) return fallback;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return fallback;
  return `${date.toLocaleDateString()} � ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

export default function OrderDetailsScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { t, language } = useTranslation();
  const insets = useSafeAreaInsets();
  const [activeSection, setActiveSection] = useState<
    "items" | "notes" | "payment"
  >("items");
  const order = route.params?.order;
  const [marking, setMarking] = useState(false);
  const editingRef = useRef(false);
  const { showToast } = useToast();
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [canceling, setCanceling] = useState(false);

  if (!order) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background }}
        edges={['bottom']}
      >
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <Text style={{ color: colors.textSecondary }}>{t("noOrderProvided")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const [workingOrderDetails, setWorkingOrderDetails] = useState<any>(
    order?.orderDetails || {},
  );
  const displayedOrderDetails =
    workingOrderDetails || order?.orderDetails || {};
  const resolvedCompanyId =
    Number(order.companyId || displayedOrderDetails?.companyId || 0) || 0;
  const shouldShowGroupSections =
    Number(displayedOrderDetails?.orderDeliveryTypeId ?? 0) === 0;

  const rawItems = displayedOrderDetails?.orderItem || [];
  const items = useMemo(
    () =>
      rawItems.map((item: any, index: number) =>
        normalizeOrderItem(item, index),
      ),
    [rawItems],
  );
  const groupedItems = useMemo(() => {
    if (!shouldShowGroupSections) {
      return [
        {
          groupType: 1,
          items: items.map((item: any) => ({
            ...item,
            groupType: 1,
            groupLabel: '',
          })),
          label: '',
        },
      ];
    }

    const groups = items.reduce((acc: Record<number, any[]>, item: any) => {
      const groupType = item.groupType || 1;
      if (!acc[groupType]) acc[groupType] = [];
      acc[groupType].push(item);
      return acc;
    }, {});
    const types = Object.keys(groups)
      .map((key) => Number(key))
      .sort((a, b) => a - b);
    return types.map((groupType) => ({
      groupType,
      items: groups[groupType],
      label:
        groups[groupType].find((item: any) => item.groupLabel)?.groupLabel ||
        `Gange ${groupType}`,
    }));
  }, [items, shouldShowGroupSections]);

  const splitPaymentItems = useMemo(
    () =>
      items.map((item: any, index: number) => ({
        key: `${item.cartId || item.menuItemId || index}-${index}`,
        name: `${item.customId ? `${item.customId}. ` : ""}${item.itemName || t("item")}`,
        itemName: item.itemName || t("item"),
        customId: item.customId,
        quantity: Math.max(getCartItemQuantity(item), 0),
        unitTotal: round2(getItemUnitTotal(item)),
        variantName: item.variantName,
        attributeName: item.attributeName,
        attributeValues: item.attributeValues ?? [],
        discountItems: item.discountItems ?? [],
      })),
    [items],
  );

  const remainingSplitItemUnits = useMemo(
    () =>
      splitPaymentItems.reduce(
        (sum: number, item: any) =>
          sum + Math.max(toNumber(item?.quantity, 0), 0),
        0,
      ),
    [splitPaymentItems],
  );

  const allowSplitOption = useMemo(() => {
    if (
      Array.isArray(displayedOrderDetails?.giftCardLogs) &&
      displayedOrderDetails.giftCardLogs.length > 0
    ) {
      return false;
    }
    return remainingSplitItemUnits > 1;
  }, [displayedOrderDetails?.giftCardLogs, remainingSplitItemUnits]);

  const totals = useMemo(() => {
    const od = displayedOrderDetails || {};
    const subtotal = Number(od.orderSubTotal ?? od.orderCartSubTotal ?? 0) || 0;
    const discount = resolveDiscountAmount(od, subtotal);
    const total = round2(Math.max(subtotal - discount, 0));
    return { subtotal, discount, total };
  }, [displayedOrderDetails]);

  const paymentProcessorId =
    displayedOrderDetails?.orderPaymentSummary?.paymentProcessorId;
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(
    paymentProcessorId ?? null,
  );
  const [pendingSettle, setPendingSettle] = useState(false);
  const pendingSettleRef = useRef(false);
  const { settings } = useSettings();
  const PAYMENT_METHOD_LABELS: Record<number, string> = {
    0: t("cash"),
    1: t("card"),
    2: t("cashAndCard"),
    3: t("splitPayment"),
    4: t("giftCard"),
    5: t("debitorPayment"),
    6: "Liefernado",
    7: "Uber",
    8: "Wolt",
    9: "Bolt",
    10: "Schlemmerblock",
  };

  useEffect(() => {
    pendingSettleRef.current = pendingSettle;
  }, [pendingSettle]);
  const [expandedGroupType, setExpandedGroupType] = useState<number | null>(
    null,
  );
  const groupCount = groupedItems.length;
  const latestGroupType =
    groupCount > 0 ? groupedItems[groupCount - 1].groupType : null;

  const paymentLabel =
    PAYMENT_METHOD_LABELS[selectedPaymentId ?? paymentProcessorId] || t("notSet");
  const serviceTypeId = displayedOrderDetails?.orderDeliveryTypeId ?? 0;
  const serviceTimeLabel = formatOrderServiceTime(
    displayedOrderDetails?.pickupDateTime,
  );
  const familyName = String(displayedOrderDetails?.familyName || "").trim();
  const selectedCustomer = resolveOrderCustomer(displayedOrderDetails);
  const selectedCustomerName = getCustomerDisplayName(selectedCustomer);
  const selectedCustomerAddress = getSelectedCustomerAddress(selectedCustomer);
  const selectedCustomerAddressText = formatCustomerAddress(selectedCustomerAddress);
  const settingsDeliveryCharge =
    settings?.deliveryCharge !== undefined &&
    settings?.deliveryCharge !== null
      ? toNumber(settings.deliveryCharge, 0)
      : null;
  const customerAddressDeliveryCharge =
    selectedCustomerAddress?.deliveryCharge !== undefined &&
    selectedCustomerAddress?.deliveryCharge !== null
      ? toNumber(selectedCustomerAddress.deliveryCharge, 0)
      : null;
  const storedDeliveryCharge =
    displayedOrderDetails?.deliveryCharge !== undefined &&
    displayedOrderDetails?.deliveryCharge !== null
      ? toNumber(displayedOrderDetails.deliveryCharge, 0)
      : null;
  const resolvedDeliveryCharge =
    serviceTypeId === 1
      ? customerAddressDeliveryCharge ??
        settingsDeliveryCharge ??
        storedDeliveryCharge ??
        0
      : 0;
  const orderStatusLabel = getOrderStatusLabel(order, language);
  const statusTone = getStatusTone(orderStatusLabel, colors);
  const isPaid = displayedOrderDetails?.isPaid === 1;
  const statusId = displayedOrderDetails?.orderStatusId ?? order?.orderStatusId;
  const isOrderPaid = isPaid || statusId === ORDER_STATUS.DELIVERED;
  const hasSplitPaidItems = useMemo(
    () => items.some((item: any) => toNumber(item?.splitPaidQuantity, 0) > 0),
    [items],
  );
  const resolvedPaymentMethod = toNumber(
    displayedOrderDetails?.paymentMethod ?? paymentProcessorId,
    0,
  );
  const isSplitPaymentMethod =
    resolvedPaymentMethod === 3 || paymentProcessorId === 3;
  const hideDeleteForSplit =
    displayedOrderDetails?.isSplitOrder === true &&
    isSplitPaymentMethod &&
    hasSplitPaidItems &&
    !isOrderPaid;

  useFocusEffect(
    useCallback(() => {
      editingRef.current = false;
      return () => { };
    }, []),
  );

  useEffect(() => {
    if (!groupCount) {
      setExpandedGroupType(null);
      return;
    }
    setExpandedGroupType(latestGroupType);
  }, [groupCount, latestGroupType]);

  useEffect(() => {
    if (!order) return;
    lockOrder(order);
    return () => {
      if (!editingRef.current) {
        unlockOrder(order);
      }
    };
  }, [order]);

  useEffect(() => {
    setWorkingOrderDetails(order?.orderDetails || {});
  }, [order?._id, order?.id]);

  const onEdit = () => {
    editingRef.current = true;
    const editableOrder = {
      ...order,
      orderDetails: displayedOrderDetails,
      customOrderId:
        displayedOrderDetails?.customOrderId || order?.customOrderId,
    };
    lockOrder(editableOrder);
    navigation.navigate("Menu", {
      tableNo: displayedOrderDetails?.tableNo,
      deliveryType: displayedOrderDetails?.orderDeliveryTypeId ?? 0,
      existingOrder: editableOrder,
      tableArea: displayedOrderDetails?.tableArea ?? null,
    });
  };

  const handleDeletePress = () => {
    if (isOrderPaid) {
      showToast("error", t("paidOrdersCannotBeCancelled"));
      return;
    }
    if (canceling) return;
    setPinModalVisible(true);
  };

  const handlePinVerified = () => {
    setPinModalVisible(false);
    setCancelModalVisible(true);
  };

  const cancelOrder = async (reason: string) => {
    if (!order) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      showToast("error", t("pleaseEnterReason"));
      return;
    }
    if (canceling) return;

    setCanceling(true);
    try {
      const now = new Date().toISOString();
      const orderDetails = displayedOrderDetails || {};
      const companyId =
        Number(order.companyId || orderDetails?.companyId || 0) || 0;
      const orderItems = Array.isArray(orderDetails?.orderItem)
        ? orderDetails.orderItem
        : Array.isArray(orderDetails?.orderItems)
          ? orderDetails.orderItems
          : [];

      const canceledObj = mergeCartItems([
        ...(orderDetails?.canceledObj || []),
        ...orderItems,
      ]);
      const canceledCount = canceledObj.reduce(
        (acc: number, item: any) => acc + toNumber(item?.quantity, 0),
        0,
      );
      const canceledOrderPayment = getCanceledPayment(canceledObj);

      const updatedDetails: any = {
        ...orderDetails,
        orderStatusId: ORDER_STATUS.CANCELED,
        updatedAt: now,
        reason: trimmed,
        isDeleted: false,
        paymentMethod: 0,
        canceledObj,
        canceledCount,
        canceledOrderPayment,
        isPaid: 0,
      };

      const deliveryTypeId = toNumber(
        orderDetails?.orderDeliveryTypeId ?? order?.orderDeliveryTypeId ?? 0,
        0,
      );
      const orderType =
        orderDetails?.orderType ||
        (deliveryTypeId === 1
          ? "delivery"
          : deliveryTypeId === 2
            ? "pickup"
            : deliveryTypeId === 3
              ? "kiosk"
              : "table");
      const baseOrderId =
        order?._id ||
        order?.id ||
        order?.orderId ||
        orderDetails?.localOrderId ||
        "";
      const customOrderId =
        order?.customOrderId ||
        orderDetails?.customOrderId ||
        orderDetails?.orderNumber ||
        baseOrderId;

      const customerIdValue = toNumber(orderDetails?.customerId, 0);
      const placeOrderPayload: any = mergeOrderCustomerData({
        ...orderDetails,
        companyId,
        orderDeliveryTypeId: deliveryTypeId,
        orderType,
        isPickup: orderDetails?.isPickup ?? deliveryTypeId === 2,
        currency: orderDetails?.currency || "EUR",
        isPriceIncludingTax: orderDetails?.isPriceIncludingTax ?? false,
        orderSubTotal: toNumber(orderDetails?.orderSubTotal, 0),
        orderPromoCodeDiscountTotal: toNumber(
          orderDetails?.orderPromoCodeDiscountTotal,
          0,
        ),
        orderDiscountTotal: toNumber(orderDetails?.orderDiscountTotal, 0),
        orderTotal: toNumber(orderDetails?.orderTotal, 0),
        orderNotes: orderDetails?.orderNotes || "",
        countryCode: orderDetails?.countryCode || "IN",
        count: toNumber(orderDetails?.count, getOrderItemCount(orderItems) || 1),
        customerId: customerIdValue > 0 ? customerIdValue : undefined,
        userEmail: orderDetails?.userEmail || "",
        userFirstName: orderDetails?.userFirstName || "",
        userLastName: orderDetails?.userLastName || "",
        userMobile: orderDetails?.userMobile ?? null,
        customerAddressId: orderDetails?.customerAddressId ?? undefined,
        addresses: orderDetails?.addresses || [],
        addedBy: orderDetails?.addedBy ?? null,
        posId: orderDetails?.posId || "",
        orderItem: orderItems,
        id: null,
        customOrderId,
        localOrderId: baseOrderId,
        orderStatusId: ORDER_STATUS.CANCELED,
        reason: trimmed,
        isDeleted: false,
        paymentMethod: 0,
        canceledObj,
        canceledCount,
        canceledOrderPayment,
      }, selectedCustomer);

      Object.keys(placeOrderPayload).forEach((key) => {
        if (
          placeOrderPayload[key] === undefined ||
          placeOrderPayload[key] === null
        ) {
          delete placeOrderPayload[key];
        }
      });

      if (!orderDetails?.isTscOffline) {
        const tscArray = Array.isArray(orderDetails?.tsc)
          ? orderDetails.tsc
          : [];
        let maxRevision = 0;
        let tscGuid: string | undefined;

        tscArray.forEach((item: any) => {
          if (item?.success === true) {
            maxRevision = Math.max(
              maxRevision,
              toNumber(item?.data?.revision, 0),
            );
            if (item?.data?._id) {
              tscGuid = item.data._id;
            }
          }
        });

        try {
          const tscRes = await tscService.updateTransaction({
            _id: order?._id || order?.id,
            customOrderId:
              order?.customOrderId ||
              orderDetails?.customOrderId ||
              orderDetails?.orderNumber ||
              "",
            orderDetails: {
              ...updatedDetails,
              orderStatusId: ORDER_STATUS.CANCELED,
            },
            companyId,
            revision: maxRevision + 1 || 1,
            guid: tscGuid,
            state: "CANCELLED",
          });
          const tscData = tscRes?.data?.data ?? tscRes?.data ?? [];
          const tscEntries = Array.isArray(tscData)
            ? tscData
            : [tscData].filter(Boolean);
          const lastObj = tscEntries[tscEntries.length - 1];

          if (!lastObj?.success) {
            updatedDetails.isTscOffline = true;
            if (lastObj?.data === TSC_OFFLINE_MESSAGE) {
              showToast("error", t("tscOfflinePleaseCheckConnection"));
            }
          } else {
            updatedDetails.tsc = [...tscArray, ...tscEntries];
          }
        } catch (error) {
          console.error("Error updating TSC transaction:", error);
          updatedDetails.isTscOffline = true;
        }
      }

      const updatePayload: any = {
        orderStatusId: ORDER_STATUS.CANCELED,
        orderDetails: updatedDetails,
        reason: trimmed,
        canceledObj,
        canceledCount,
        canceledOrderPayment,
        updatedAt: now,
      };

      const orderId =
        order?._id || order?.id || order?.orderId || orderDetails?.localOrderId;
      if (!orderId) {
        throw new Error("Order id missing");
      }

      await orderService.updateOrder(`${orderId}`, updatePayload);

      emitPosCancelPrint({
        ...order,
        orderDetails: {
          ...updatedDetails,
          orderItem: orderItems,
        },
      });

      orderService
        .placeOrder(placeOrderPayload)
        .then((response) => {
          const status =
            response?.status ||
            response?.data?.status ||
            response?.data?.data?.status;
          if (status === "SUCCESS") {
            const tsc =
              response?.data?.tsc ||
              response?.data?.data?.tsc ||
              response?.dataValues?.tsc;
            if (tsc) {
              orderService.updateOrder(`${orderId}`, {
                orderDetails: {
                  ...updatedDetails,
                  tsc,
                },
              });
            }
          }
        })
        .catch((err) => {
          console.warn("Cancel order sync failed:", err);
        });

      await emitOrderSync("ORDER_CANCELLED", {
        tableNo: orderDetails?.tableNo ?? null,
        orderNumber: order?.customOrderId || order?._id,
        orderDeliveryTypeId:
          orderDetails?.orderDeliveryTypeId ?? order?.orderDeliveryTypeId ?? 0,
      });
      await unlockOrder(order);

      showToast("success", t("orderCancelledSuccessfully"));
      setCancelModalVisible(false);
      navigation.goBack();
    } catch (error) {
      console.error("Cancel order failed:", error);
      showToast("error", t("unableToCancelOrder"));
    } finally {
      setCanceling(false);
    }
  };

  const settleOrderWithPayment = async (option: any) => {
    try {
      setMarking(true);
      const now = new Date().toISOString();
      const selectedPaymentMethod = toNumber(
        option?.paymentMethod ?? option?.id,
        0,
      );
      const userDataStr = await AsyncStorage.getItem(STORAGE_KEYS.authUser);
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      const paidBy = Number(userData?.id || userData?.userId || 0) || null;
      const orderDetails = displayedOrderDetails || {};
      const isCorporate =
        option?.isCorporate ?? orderDetails?.isCorporate ?? false;
      const companyId =
        Number(
          order.companyId ||
          orderDetails?.companyId ||
          userData?.companyId ||
          0,
        ) || 0;
      const invoiceNumber =
        await commonFunctionService.generateInvoice(companyId);
      const tip = toNumber((option as any).tip, 0);
      const giftCard = (option as any).giftCard;
      const giftCardTotal = toNumber(
        option?.giftCardTotal ?? giftCard?.amount,
        0,
      );
      const deliveryCharge = toNumber(
        option?.deliveryCharge,
        resolvedDeliveryCharge,
      );
      const currency = orderDetails?.currency || "EUR";
      const defaultAmount = totals.total + tip + deliveryCharge - giftCardTotal;
      const incomingPaymentDetails = Array.isArray(option?.orderPaymentDetails)
        ? option.orderPaymentDetails
          .map((detail: any) => ({
            paymentProcessorId: toNumber(
              detail?.paymentProcessorId,
              selectedPaymentMethod,
            ),
            paymentTotal: toNumber(detail?.paymentTotal, 0),
          }))
          .filter((detail: any) => detail.paymentTotal > 0)
        : [];
      let orderPaymentDetails =
        incomingPaymentDetails.length > 0
          ? incomingPaymentDetails
          : [
            {
              paymentProcessorId: selectedPaymentMethod,
              paymentTotal: toNumber(defaultAmount, 0),
            },
          ];
      const splitAmount = orderPaymentDetails.reduce(
        (sum: number, detail: any) => sum + toNumber(detail?.paymentTotal, 0),
        0,
      );
      let amount = splitAmount > 0 ? splitAmount : defaultAmount;
      let orderPaymentSummary = option?.orderPaymentSummary ?? {
        paymentProcessorId: selectedPaymentMethod,
      };
      const localOrderId = order._id || order.id || order.orderId;
      const tsc = orderDetails?.tsc;
      const orderDeliveryTypeId = Number(
        orderDetails?.orderDeliveryTypeId ?? order?.orderDeliveryTypeId ?? 0,
      );
      const orderType =
        orderDetails?.orderType ||
        (orderDeliveryTypeId === 1
          ? "delivery"
          : orderDeliveryTypeId === 2
            ? "pickup"
            : orderDeliveryTypeId === 3
              ? "kiosk"
              : "table");
      const paymentCustomer =
        selectedPaymentMethod === 5
          ? resolveOrderCustomer(option, option?.selectedCustomer ?? selectedCustomer)
          : selectedCustomer;

      const rawOrderItems = Array.isArray(orderDetails?.orderItem)
        ? orderDetails.orderItem
        : Array.isArray(orderDetails?.orderItems)
          ? orderDetails.orderItems
          : [];
      const orderLevelDiscountId =
        orderDetails?.discountId ??
        orderDetails?.discount?.discountId ??
        orderDetails?.discount?.id ??
        null;

      let normalizedOrderItems = rawOrderItems.map((item: any) => ({
        companyId: item.companyId ?? companyId,
        discountId:
          item.discountId ??
          item.discount?.discountId ??
          item.discount?.id ??
          orderLevelDiscountId,
        categoryId:
          item.categoryId ?? item.menuCategoryId ?? item.category?.id ?? 0,
        cartId: item.cartId,
        categoryName:
          item.categoryName ??
          item.menuCategoryName ??
          item.category?.name ??
          "",
        menuItemId: item.menuItemId ?? item.itemId ?? item.id ?? 0,
        itemName: item.itemName ?? item.name ?? "",
        quantity: Math.max(toNumber(item.quantity, 1), 1),
        unitPrice: `${item.unitPrice ?? item.itemPrice ?? item.price ?? 0}`,
        orderItemNote: item.orderItemNote ?? item.note ?? "",
        groupType: item.groupType ?? 0,
        groupLabel: item.groupLabel ?? "",
        customId: item.customId ?? item.customID ?? item.customId ?? null,
        tax: item.tax ?? item.taxInfo ?? item.taxObj ?? null,
        discountItems: item.discountItems ?? [],
        splitPaidQuantity: toNumber(item.splitPaidQuantity, 0),
        atgPinsSale: item.atgPinsSale ?? false,
        atgVatPercent: toNumber(item.atgVatPercent, 0),
        atgOrderPayload: item.atgOrderPayload ?? null,
        ...(item.extraCategory !== undefined && item.extraCategory !== null
          ? { extraCategory: item.extraCategory }
          : {}),
        ...(item.orderItemVariant
          ? { orderItemVariant: item.orderItemVariant }
          : {}),
        ...(item.orderItemVariants
          ? { orderItemVariants: item.orderItemVariants }
          : {}),
      }));

      let payableSubTotal = round2(
        toNumber(orderDetails?.orderSubTotal, totals.subtotal),
      );
      let payableDiscount = resolveDiscountAmount(
        orderDetails,
        payableSubTotal,
      );
      let payableTotal = round2(
        Math.max(payableSubTotal - payableDiscount, 0),
      );
      let payableCount = toNumber(
        orderDetails?.count,
        getOrderItemCount(normalizedOrderItems) || 1,
      );
      let payableDeliveryCharge = deliveryCharge;

      let splitSelections = Array.isArray(option?.splitSelections)
        ? option.splitSelections.map((qty: any) =>
          Math.max(0, Math.floor(toNumber(qty, 0))),
        )
        : [];
      const isExistingSplitOrder =
        orderDetails?.isSplitOrder === true ||
        order?.orderDetails?.isSplitOrder === true ||
        order?.isSplitOrder === true;
      let isItemSplit =
        option?.isItemSplit === true &&
        splitSelections.some((qty: number) => qty > 0);

      // Match POS PaymentComponent: when the current order is already split,
      // a regular Pay action should finalize via the split/bulk flow.
      const shouldFinalizeExistingSplit =
        !isItemSplit && isExistingSplitOrder;

      if (shouldFinalizeExistingSplit) {
        splitSelections = normalizedOrderItems.map((item: any) =>
          Math.max(0, Math.floor(toNumber(item?.quantity, 0))),
        );
        isItemSplit = splitSelections.some((qty: number) => qty > 0);
      }

      if (isItemSplit) {
        const selectedOrderItems: any[] = [];
        const remainingOrderItems: any[] = [];
        let selectedSubTotal = 0;
        let remainingSubTotal = 0;

        normalizedOrderItems.forEach((item: any, index: number) => {
          const availableQty = Math.max(
            Math.floor(toNumber(item.quantity, 0)),
            0,
          );
          const selectedQty = Math.min(
            availableQty,
            splitSelections[index] || 0,
          );
          const remainingQty = Math.max(0, availableQty - selectedQty);
          const unitTotal = toNumber(
            splitPaymentItems[index]?.unitTotal,
            toNumber(item.unitPrice, 0),
          );

          if (selectedQty > 0) {
            selectedSubTotal += unitTotal * selectedQty;
            selectedOrderItems.push({
              ...item,
              quantity: selectedQty,
            });
          }

          if (remainingQty > 0) {
            remainingSubTotal += unitTotal * remainingQty;
            remainingOrderItems.push({
              ...item,
              quantity: remainingQty,
              splitPaidQuantity:
                toNumber(item.splitPaidQuantity, 0) + selectedQty,
            });
          }
        });

        if (selectedOrderItems.length === 0) {
          throw new Error("No items selected for split payment");
        }

        selectedSubTotal = round2(selectedSubTotal);
        remainingSubTotal = round2(remainingSubTotal);

        const baseSubTotal = round2(selectedSubTotal + remainingSubTotal);
        const sourceSubTotal = round2(
          toNumber(orderDetails?.orderSubTotal, totals.subtotal),
        );
        const effectiveSubTotal =
          sourceSubTotal > 0 ? sourceSubTotal : baseSubTotal;
        const sourceDiscount = resolveDiscountAmount(
          orderDetails,
          sourceSubTotal,
        );
        const splitRatio =
          effectiveSubTotal > 0
            ? Math.min(1, selectedSubTotal / effectiveSubTotal)
            : 1;

        const selectedDiscount = round2(sourceDiscount * splitRatio);
        const remainingDiscount = round2(sourceDiscount - selectedDiscount);
        const selectedTotal = round2(
          Math.max(0, selectedSubTotal - selectedDiscount),
        );
        const remainingTotal = round2(
          Math.max(0, remainingSubTotal - remainingDiscount),
        );
        const splitDeliveryCharge =
          remainingOrderItems.length > 0 ? 0 : deliveryCharge;
        const splitDefaultAmount = round2(
          Math.max(
            0,
            selectedTotal + tip + splitDeliveryCharge - giftCardTotal,
          ),
        );
        const splitPaymentDetails =
          incomingPaymentDetails.length > 0
            ? incomingPaymentDetails
            : [
              {
                paymentProcessorId: selectedPaymentMethod,
                paymentTotal: splitDefaultAmount,
              },
            ];
        const splitPaymentSummary = option?.orderPaymentSummary ?? {
          paymentProcessorId: selectedPaymentMethod,
        };
        const splitAmount = round2(
          splitPaymentDetails.reduce(
            (sum: number, detail: any) =>
              sum + toNumber(detail?.paymentTotal, 0),
            0,
          ) || splitDefaultAmount,
        );
        const splitOrderInfo: any = mergeOrderCustomerData({
          companyId,
          currency,
          isPickup: orderDetails?.isPickup ?? orderDeliveryTypeId === 2,
          pickupDateTime: orderDetails?.pickupDateTime ?? null,
          familyName: orderDetails?.familyName ?? "",
          orderType,
          isSandbox: orderDetails?.isSandbox ?? false,
          isPriceIncludingTax: orderDetails?.isPriceIncludingTax ?? false,
          orderDeliveryTypeId,
          orderPromoCodeDiscountTotal: toNumber(
            orderDetails?.orderPromoCodeDiscountTotal,
            0,
          ),
          countryCode:
            orderDetails?.countryCode || userData?.countryCode || "IN",
          orderNotes: orderDetails?.orderNotes || "",
          orderDiscountTotal: selectedDiscount,
          orderItem: selectedOrderItems,
          orderStatusId: ORDER_STATUS.DELIVERED,
          orderSubTotal: selectedSubTotal,
          orderTotal: selectedTotal,
          createdAt: orderDetails?.createdAt || order?.createdAt || now,
          count: getOrderItemCount(selectedOrderItems),
          user: orderDetails?.user || order?.user || userData || null,
          addedBy: orderDetails?.addedBy ?? paidBy ?? null,
          posId: orderDetails?.posId || order?.posId || "",
          onHold: false,
          holdingName: "",
          atgPinsPayloads: orderDetails?.atgPinsPayloads ?? [],
          tableNo: orderDetails?.tableNo ?? null,
          tableArea: orderDetails?.tableArea ?? null,
          tsc: tsc ?? undefined,
          customOrderId:
            orderDetails?.customOrderId || order?.customOrderId || "",
          parentLocalOrderId: localOrderId,
          reason: orderDetails?.reason ?? "",
          isDeleted: false,
          updatedAt: now,
          paidAt: now,
          isCorporate,
          isFinalBillPrint: !!option.print,
          canceledOrderPayment: 0,
          invoiceNumber,
          paidBy: paidBy || undefined,
          company: orderDetails?.company || order?.company || undefined,
          printObj: orderDetails?.printObj ?? order?.printObj ?? undefined,
          paymentMethod: selectedPaymentMethod,
          orderPaymentSummary: splitPaymentSummary,
          orderPaymentDetails: splitPaymentDetails,
          tip,
          deliveryCharge: splitDeliveryCharge,
          isSplitOrder: true,
        }, selectedCustomer);

        const splitDiscountPayload = buildDiscountPayload(
          orderDetails,
          selectedSubTotal,
          selectedDiscount,
        );
        if (splitDiscountPayload) {
          splitOrderInfo.discount = splitDiscountPayload;
          const splitDiscountId = resolveDiscountId(
            orderDetails,
            splitDiscountPayload,
          );
          if (splitDiscountId != null) {
            splitOrderInfo.discountId = splitDiscountId;
          }
          if (
            splitDiscountPayload.discountType === "CUSTOM" &&
            splitOrderInfo.customDiscountValue == null
          ) {
            splitOrderInfo.customDiscountValue =
              splitDiscountPayload.discountValue;
          }
        }

        if (giftCard) {
          splitOrderInfo.giftCard = giftCard;
          splitOrderInfo.appliedGiftCard = giftCard;
          splitOrderInfo.giftCardTotal = giftCardTotal;
          splitOrderInfo.isfullPaidWithGiftCard =
            giftCardTotal > 0 && Math.abs(selectedTotal - giftCardTotal) < 0.01;
        }

        if (option?.cloverResponse) {
          splitOrderInfo.cloverResponse = option.cloverResponse;
        }

        enrichBulkSettleOrderInfo(
          splitOrderInfo,
          order,
          orderDetails,
          userData,
          settings,
        );

        const splitSettlePayload: any = {
          currency,
          paymentMethod: selectedPaymentMethod,
          amount: splitAmount,
          tip,
          deliveryCharge: splitDeliveryCharge,
          isEditPayment: false,
          orderInfo: splitOrderInfo,
        };

        try {
          const tscStartPayload: any = {
            orderStatusId: ORDER_STATUS.DELIVERED,
            orderDetails: sanitizePersistedOrderDetails(splitOrderInfo),
            companyId,
            parentLocalOrderId: localOrderId,
            revision: 1,
          };
          const tscStartRes: any =
            await tscService.startTransaction(tscStartPayload);
          const rawTscData = tscStartRes?.data?.data ?? tscStartRes?.data ?? [];
          const tscData = Array.isArray(rawTscData)
            ? rawTscData
            : [rawTscData].filter(Boolean);
          const lastObj = tscData[tscData.length - 1];

          if (!lastObj?.success) {
            splitOrderInfo.isTscOffline = true;
          } else {
            const filteredTscData = tscData
              .filter((item: any) => item?.data?.state === "FINISHED")
              .reduce(
                (acc: any, item: any) => {
                  const isReceipt =
                    item?.data?.schema?.standard_v1?.receipt?.receipt_type ===
                    "RECEIPT";
                  if (isReceipt) {
                    acc.receipt = { ...item.data, success: item.success };
                  } else {
                    acc.order = { ...item.data, success: item.success };
                  }
                  return acc;
                },
                { order: null, receipt: null },
              );
            splitOrderInfo.tsc = filteredTscData;
          }
        } catch (tscErr) {
          console.warn("startNewTransaction failed for split order:", tscErr);
          splitOrderInfo.isTscOffline = true;
        }

        const splitCreatePayload: any = {
          orderStatusId: ORDER_STATUS.DELIVERED,
          orderDetails: sanitizePersistedOrderDetails(splitOrderInfo),
          companyId,
          settleInfo: splitSettlePayload,
          parentLocalOrderId: localOrderId,
        };

        const createdSplitOrder =
          await orderService.createOrder(splitCreatePayload);
        const createdSplitOrderId =
          createdSplitOrder?._id ||
          createdSplitOrder?.id ||
          createdSplitOrder?.orderId ||
          createdSplitOrder?.localOrderId;
        const splitOrderForPrint = {
          ...splitOrderInfo,
          localOrderId: createdSplitOrderId || undefined,
          customOrderId:
            createdSplitOrder?.customOrderId || splitOrderInfo.customOrderId,
        };

        if (remainingOrderItems.length > 0) {
          const remainingOrderDetails: any = {
            ...orderDetails,
            orderItem: remainingOrderItems,
            orderStatusId: ORDER_STATUS.PENDING,
            orderSubTotal: remainingSubTotal,
            orderTotal: remainingTotal,
            orderDiscountTotal: remainingDiscount,
            orderPaymentSummary: { paymentProcessorId: 3 },
            paymentMethod: 3,
            count: getOrderItemCount(remainingOrderItems),
            isSplitOrder: true,
            updatedAt: now,
            tip: 0,
            isPaid: 0,
            deliveryCharge,
          };

          const remainingDiscountPayload = buildDiscountPayload(
            orderDetails,
            remainingSubTotal,
            remainingDiscount,
          );
          if (remainingDiscountPayload) {
            remainingOrderDetails.discount = remainingDiscountPayload;
            const remainingDiscountId = resolveDiscountId(
              orderDetails,
              remainingDiscountPayload,
            );
            if (remainingDiscountId != null) {
              remainingOrderDetails.discountId = remainingDiscountId;
            }
            if (
              remainingDiscountPayload.discountType === "CUSTOM" &&
              remainingOrderDetails.customDiscountValue == null
            ) {
              remainingOrderDetails.customDiscountValue =
                remainingDiscountPayload.discountValue;
            }
          }

          await orderService.updateOrder(`${localOrderId}`, {
            orderStatusId: ORDER_STATUS.PENDING,
            orderDetails: sanitizePersistedOrderDetails(remainingOrderDetails),
            settleInfo: {
              ...splitSettlePayload,
              splitLog: true,
            },
          });

          if (option?.print) {
            emitPosPrint(splitOrderForPrint, selectedPaymentMethod);
          }

          await emitOrderSync("ORDER_UPDATED", {
            orderInfo: buildOrderSyncInfo(
              {
                ...remainingOrderDetails,
                localOrderId,
                customOrderId:
                  order?.customOrderId || remainingOrderDetails?.customOrderId,
              },
              order?.customOrderId || order?._id,
            ),
          });
          await lockPayment({
            ...order,
            orderDetails: remainingOrderDetails,
            customOrderId:
              order?.customOrderId || remainingOrderDetails?.customOrderId,
          });

          setWorkingOrderDetails(remainingOrderDetails);
          const refreshedSplitItems = remainingOrderItems.map(
            (item: any, index: number) => {
              const normalizedItem = normalizeOrderItem(item, index);
              return {
                key: `${normalizedItem.cartId || normalizedItem.menuItemId || index}-${index}`,
                name: `${normalizedItem.customId ? `${normalizedItem.customId}. ` : ""}${normalizedItem.itemName || t("item")}`,
                itemName: normalizedItem.itemName || t("item"),
                customId: normalizedItem.customId,
                quantity: Math.max(getCartItemQuantity(normalizedItem), 0),
                unitTotal: round2(getItemUnitTotal(normalizedItem)),
                variantName: normalizedItem.variantName,
                attributeName: normalizedItem.attributeName,
                attributeValues: normalizedItem.attributeValues ?? [],
                discountItems: normalizedItem.discountItems ?? [],
              };
            },
          );
          const refreshedSplitUnits = refreshedSplitItems.reduce(
            (sum: number, item: any) =>
              sum + Math.max(toNumber(item?.quantity, 0), 0),
            0,
          );
          const paidItemQty = selectedOrderItems.reduce(
            (sum: number, item: any) => sum + toNumber(item?.quantity, 0),
            0,
          );
          showToast(
            "success",
            t("splitPaymentSaved"),
          );
          setMarking(false);
          return {
            keepModalOpen: true,
            resetPayment: {
              orderTotal: remainingTotal,
              orderSubTotal: remainingSubTotal,
              orderDiscountTotal: remainingDiscount,
              orderDeliveryCharge: toNumber(
                remainingOrderDetails?.deliveryCharge,
                0,
              ),
              splitItems: refreshedSplitItems,
              allowSplitOption:
                refreshedSplitUnits > 1 &&
                !(
                  Array.isArray(remainingOrderDetails?.giftCardLogs) &&
                  remainingOrderDetails.giftCardLogs.length > 0
                ),
            },
          };
        }

        const splitOrdersFromDb = await localDatabase.select("order", {
          where: {
            parentLocalOrderId: localOrderId,
          },
        });
        const splitOrders = Array.isArray(splitOrdersFromDb)
          ? [...splitOrdersFromDb]
          : [];
        if (
          createdSplitOrderId &&
          !splitOrders.some(
            (splitOrder: any) =>
              `${splitOrder?._id || splitOrder?.id || ""}` ===
              `${createdSplitOrderId}`,
          )
        ) {
          splitOrders.push({
            ...(createdSplitOrder || {}),
            _id: createdSplitOrderId,
            parentLocalOrderId: localOrderId,
            orderDetails: splitOrderInfo,
          });
        }

        const itemMap = new Map<string, any>();
        let mainOrderSubTotal = 0;
        let mainOrderTotal = 0;
        let mainOrderDiscount = 0;
        let finalOrderTip = 0;
        let finalOrderDeliveryCharge = 0;

        splitOrders.forEach((splitOrder: any, index: number) => {
          const details = splitOrder?.orderDetails || {};
          mainOrderSubTotal += toNumber(details.orderSubTotal, 0);
          mainOrderTotal += toNumber(details.orderTotal, 0);
          mainOrderDiscount += toNumber(details.orderDiscountTotal, 0);
          finalOrderTip += toNumber(details.tip, 0);
          finalOrderDeliveryCharge += toNumber(details.deliveryCharge, 0);

          const splitItems = Array.isArray(details.orderItem)
            ? details.orderItem
            : [];
          splitItems.forEach((splitItem: any, itemIndex: number) => {
            const key =
              splitItem?.cartId ||
              `${splitItem?.menuItemId || splitItem?.itemName || "item"}-${index}-${itemIndex}`;
            if (itemMap.has(key)) {
              const existing = itemMap.get(key);
              existing.quantity =
                toNumber(existing.quantity, 0) +
                toNumber(splitItem.quantity, 0);
              delete existing.splitPaidQuantity;
            } else {
              const cloned = { ...splitItem };
              delete cloned.splitPaidQuantity;
              itemMap.set(key, cloned);
            }
          });
        });

        const mergedOrderItems = Array.from(itemMap.values());
        const mainOrderInvoiceNumber =
          (await commonFunctionService.generateInvoice(companyId)) ||
          invoiceNumber;
        const finalizedMainOrderInfo: any = {
          ...orderDetails,
          orderItem: mergedOrderItems,
          orderSubTotal: round2(mainOrderSubTotal),
          orderTotal: round2(mainOrderTotal),
          orderDiscountTotal: round2(mainOrderDiscount),
          orderStatusId: ORDER_STATUS.DELIVERED,
          updatedAt: now,
          paidAt: now,
          tip: round2(finalOrderTip),
          deliveryCharge: round2(finalOrderDeliveryCharge),
          count: getOrderItemCount(mergedOrderItems) || toNumber(orderDetails?.count, 1),
          isSplitOrder: true,
          isPaid: 1,
          orderEditInOffline: true,
          localOrderId,
          customOrderId: order?.customOrderId || orderDetails?.customOrderId,
          parentLocalOrderId: undefined,
          invoiceNumber: mainOrderInvoiceNumber,
          paidBy: paidBy || undefined,
          paymentMethod: 3,
          orderPaymentSummary: {
            paymentProcessorId: 3,
          },
        };

        enrichBulkSettleOrderInfo(
          finalizedMainOrderInfo,
          order,
          orderDetails,
          userData,
          settings,
          { includeFinalSettlementFields: true },
        );

        const bulkOrdersObj: any[] = splitOrders.map((splitOrder: any) => {
          const details = splitOrder?.orderDetails || {};
          const paymentMethod = toNumber(
            details?.paymentMethod ??
            details?.orderPaymentSummary?.paymentProcessorId,
            selectedPaymentMethod,
          );
          const splitLocalOrderId =
            splitOrder?._id || splitOrder?.id || details?.localOrderId;
          const splitOrderInfo = enrichBulkSettleOrderInfo(
            {
              orderStatusId: ORDER_STATUS.DELIVERED,
              ...details,
              updatedAt: now,
              localOrderId: splitLocalOrderId,
              parentLocalOrderId:
                splitOrder?.parentLocalOrderId || localOrderId,
              customOrderId:
                splitOrder?.customOrderId || details?.customOrderId,
            },
            order,
            orderDetails,
            userData,
            settings,
          );

          return {
            currency: details?.currency || currency,
            paymentMethod,
            amount: toNumber(details?.orderTotal, 0),
            moneyBack: 0,
            tip: toNumber(details?.tip, 0),
            deliveryCharge: toNumber(details?.deliveryCharge, 0),
            orderInfo: splitOrderInfo,
          };
        });

        const bulkMainOrderInfo = {
          ...finalizedMainOrderInfo,
        };
        delete bulkMainOrderInfo.isPaid;
        delete bulkMainOrderInfo.orderEditInOffline;

        const mainBulkSettleObj = {
          currency,
          paymentMethod: 3,
          amount: round2(mainOrderTotal),
          tip: round2(finalOrderTip),
          deliveryCharge: round2(finalOrderDeliveryCharge),
          orderInfo: {
            ...bulkMainOrderInfo,
            localOrderId,
            customOrderId: order?.customOrderId || orderDetails?.customOrderId,
            paymentMethod: 3,
            orderPaymentSummary: {
              paymentProcessorId: 3,
            },
          },
          isEditPayment: false,
          isOrderPaid,
        };

        const mainLocalSettleInfo = {
          currency,
          paymentMethod: selectedPaymentMethod,
          amount: round2(mainOrderTotal),
          moneyBack: 0,
          tip: round2(finalOrderTip),
          deliveryCharge: round2(finalOrderDeliveryCharge),
          orderInfo: {
            ...bulkMainOrderInfo,
            companyId,
            localOrderId,
            customOrderId: order?.customOrderId || orderDetails?.customOrderId,
            paymentMethod: selectedPaymentMethod,
            orderPaymentDetails: [
              {
                paymentProcessorId: selectedPaymentMethod,
                paymentTotal: round2(mainOrderTotal),
              },
            ],
            orderPaymentSummary: {
              paymentProcessorId: selectedPaymentMethod,
            },
          },
        };

        bulkOrdersObj.push({
          ...mainBulkSettleObj,
        });

        await orderService.updateOrder(`${localOrderId}`, {
          orderStatusId: ORDER_STATUS.DELIVERED,
          orderDetails: sanitizePersistedOrderDetails(finalizedMainOrderInfo),
          settleInfo: {
            ...mainLocalSettleInfo,
            splitLog: true,
          },
        });

        try {
          console.log(
            "settleBulkOrder payload:",
            JSON.stringify(bulkOrdersObj),
          );
          const bulkSettleRes: any =
            await orderService.settleBulkOrder(bulkOrdersObj);
          const bulkSettleRows = Array.isArray(bulkSettleRes?.data)
            ? bulkSettleRes.data
            : Array.isArray(bulkSettleRes?.data?.data)
              ? bulkSettleRes.data.data
              : Array.isArray(bulkSettleRes)
                ? bulkSettleRes
                : [];

          if (bulkSettleRows.length > 0) {
            const localOrdersToUpdate = new Map<string, any>();

            splitOrders.forEach((splitOrder: any) => {
              const splitId =
                splitOrder?._id ||
                splitOrder?.id ||
                splitOrder?.orderDetails?.localOrderId;
              if (
                splitId !== undefined &&
                splitId !== null &&
                `${splitId}` !== ""
              ) {
                localOrdersToUpdate.set(`${splitId}`, splitOrder);
              }
            });

            if (
              localOrderId !== undefined &&
              localOrderId !== null &&
              `${localOrderId}` !== ""
            ) {
              localOrdersToUpdate.set(`${localOrderId}`, {
                _id: localOrderId,
                id: order?.id,
                customOrderId:
                  order?.customOrderId || orderDetails?.customOrderId,
                orderDetails: finalizedMainOrderInfo,
                settleInfo: {
                  ...mainLocalSettleInfo,
                  splitLog: true,
                },
              });
            }

            const bulkRowByLocalId = new Map<string, any>();
            bulkSettleRows.forEach((row: any) => {
              const localIdCandidates = [
                row?.dataValues?.localOrderId,
                row?.localOrderId,
                row?.orderInfo?.localOrderId,
                row?.orderDetails?.localOrderId,
                row?.data?.localOrderId,
                row?.data?.dataValues?.localOrderId,
              ];

              localIdCandidates.forEach((candidateId) => {
                if (
                  candidateId !== undefined &&
                  candidateId !== null &&
                  `${candidateId}` !== ""
                ) {
                  bulkRowByLocalId.set(`${candidateId}`, row);
                }
              });
            });

            const localOrderUpdateTasks: Promise<any>[] = [];

            localOrdersToUpdate.forEach(
              (localOrderRecord: any, currentLocalId: string) => {
                const settledRow = bulkRowByLocalId.get(currentLocalId);
                const existingOrderDetails =
                  localOrderRecord?.orderDetails || {};
                const settledDataValues =
                  settledRow?.dataValues ??
                  settledRow?.data?.dataValues ??
                  settledRow?.data ??
                  {};
                const updatedPaidAt =
                  settledDataValues?.paidAt ??
                  settledRow?.paidAt ??
                  existingOrderDetails?.paidAt ??
                  now;
                const updatedOrderDetails: any = {
                  ...existingOrderDetails,
                  orderStatusId: ORDER_STATUS.DELIVERED,
                  updatedAt: now,
                  paidAt: updatedPaidAt,
                  localOrderId: currentLocalId,
                  parentLocalOrderId:
                    localOrderRecord?.parentLocalOrderId ??
                    existingOrderDetails?.parentLocalOrderId,
                  isTscOffline:
                    settledRow?.isTscOffline ??
                    settledDataValues?.isTscOffline ??
                    existingOrderDetails?.isTscOffline,
                  tsc:
                    settledRow?.tsc ??
                    settledDataValues?.tsc ??
                    existingOrderDetails?.tsc,
                  orderPaymentSummary:
                    settledRow?.orderPaymentSummary ??
                    settledDataValues?.orderPaymentSummary ??
                    existingOrderDetails?.orderPaymentSummary,
                  orderPaymentDetails:
                    settledRow?.orderPaymentDetails ??
                    settledDataValues?.orderPaymentDetails ??
                    existingOrderDetails?.orderPaymentDetails,
                  giftCard:
                    settledRow?.giftCard ??
                    settledDataValues?.giftCard ??
                    existingOrderDetails?.giftCard ??
                    null,
                  appliedGiftCard:
                    settledRow?.appliedGiftCard ??
                    settledDataValues?.appliedGiftCard ??
                    existingOrderDetails?.appliedGiftCard ??
                    null,
                  giftCardTotal:
                    toNumber(
                      settledRow?.giftCardTotal ??
                      settledDataValues?.giftCardTotal ??
                      existingOrderDetails?.giftCardTotal,
                      0,
                    ) || 0,
                  giftCardLogs: normalizeGiftCardLogs(
                    settledRow?.giftCardLogs ??
                    settledDataValues?.giftCardLogs ??
                    existingOrderDetails?.giftCardLogs ??
                    null,
                  ),
                  orderCustomerDetails:
                    settledRow?.orderCustomerDetails ??
                    settledDataValues?.orderCustomerDetails ??
                    existingOrderDetails?.orderCustomerDetails,
                  invoiceNumber:
                    settledDataValues?.invoiceNumber ??
                    settledRow?.invoiceNumber ??
                    existingOrderDetails?.invoiceNumber,
                };

                if (!updatedOrderDetails?.parentLocalOrderId) {
                  delete updatedOrderDetails.parentLocalOrderId;
                }

                const isSplitChildOrder = !!localOrderRecord?.parentLocalOrderId;
                const updatedSettleOrderInfo = {
                  ...(localOrderRecord?.settleInfo?.orderInfo || {}),
                  ...updatedOrderDetails,
                  isSynced: true,
                  localOrderId: currentLocalId,
                  parentLocalOrderId:
                    localOrderRecord?.parentLocalOrderId || undefined,
                  customOrderId:
                    localOrderRecord?.customOrderId ||
                    updatedOrderDetails?.customOrderId,
                };

                const updatedSettleInfo = isSplitChildOrder
                  ? {
                      orderInfo: updatedSettleOrderInfo,
                    }
                  : {
                      ...(localOrderRecord?.settleInfo || {}),
                      splitLog: true,
                      orderInfo: updatedSettleOrderInfo,
                    };

                const localOrderUpdatePayload: any = {
                  orderStatusId: ORDER_STATUS.DELIVERED,
                  isSynced: true,
                  orderDetails: sanitizePersistedOrderDetails(updatedOrderDetails),
                  settleInfo: updatedSettleInfo,
                };

                if (localOrderRecord?.parentLocalOrderId) {
                  localOrderUpdatePayload.parentLocalOrderId =
                    localOrderRecord.parentLocalOrderId;
                }

                if (localOrderRecord?.customOrderId) {
                  localOrderUpdatePayload.customOrderId =
                    localOrderRecord.customOrderId;
                }

                localOrderUpdateTasks.push(
                  orderService.updateOrder(currentLocalId, localOrderUpdatePayload),
                );
              },
            );

            if (localOrderUpdateTasks.length > 0) {
              await Promise.all(localOrderUpdateTasks);
            }
          }
        } catch (bulkErr) {
          console.warn(
            "settleBulkOrder failed; orders kept local for sync:",
            bulkErr,
          );
        }

        if (option?.print) {
          emitPosPrint(splitOrderForPrint, selectedPaymentMethod);
        }

        await emitOrderSync("ORDER_PAID", {
          orderInfo: buildOrderSyncInfo(
            {
              ...finalizedMainOrderInfo,
              localOrderId,
              customOrderId:
                order?.customOrderId || finalizedMainOrderInfo?.customOrderId,
            },
            order?.customOrderId || order?._id,
          ),
        });

        showToast("success", t("splitPaymentCompleted"));
        await unlockOrder(order);
        setMarking(false);
        return { keepModalOpen: false, resetToDashboard: true };
      }

      const orderInfo: any = mergeOrderCustomerData({
        companyId,
        currency,
        isPickup: orderDetails?.isPickup ?? orderDeliveryTypeId === 2,
        pickupDateTime: orderDetails?.pickupDateTime ?? null,
        familyName: orderDetails?.familyName ?? "",
        orderType,
        isSandbox: orderDetails?.isSandbox ?? false,
        isPriceIncludingTax: orderDetails?.isPriceIncludingTax ?? false,
        orderDeliveryTypeId,
        orderPromoCodeDiscountTotal: toNumber(
          orderDetails?.orderPromoCodeDiscountTotal,
          0,
        ),
        countryCode: orderDetails?.countryCode || userData?.countryCode || "IN",
        orderNotes: orderDetails?.orderNotes || "",
        orderDiscountTotal: payableDiscount,
        orderItem: normalizedOrderItems,
        orderStatusId: ORDER_STATUS.DELIVERED,
        orderSubTotal: payableSubTotal,
        orderTotal: payableTotal,
        createdAt: orderDetails?.createdAt || order?.createdAt || now,
        count: payableCount,
        user: orderDetails?.user || order?.user || userData || null,
        addedBy: orderDetails?.addedBy ?? paidBy ?? null,
        posId: orderDetails?.posId || order?.posId || "",
        onHold: orderDetails?.onHold ?? false,
        holdingName: orderDetails?.holdingName ?? "",
        atgPinsPayloads: orderDetails?.atgPinsPayloads ?? [],
        tableNo: orderDetails?.tableNo ?? null,
        tableArea: orderDetails?.tableArea ?? null,
        tsc: tsc ?? undefined,
        customOrderId:
          orderDetails?.customOrderId || order?.customOrderId || "",
        localOrderId,
        reason: orderDetails?.reason ?? "",
        isDeleted: orderDetails?.isDeleted ?? order?.isDeleted ?? false,
        updatedAt: now,
        paidAt: now,
        isCorporate,
        isFinalBillPrint: !!option.print,
        canceledObj: orderDetails?.canceledObj ?? undefined,
        canceledCount: orderDetails?.canceledCount ?? undefined,
        canceledOrderPayment: orderDetails?.canceledOrderPayment ?? 0,
        orderEditInOffline: true,
        invoiceNumber,
        paidBy: paidBy || undefined,
        company: orderDetails?.company || order?.company || undefined,
        printObj: orderDetails?.printObj ?? order?.printObj ?? undefined,
        paymentMethod: selectedPaymentMethod,
        tip,
        deliveryCharge: payableDeliveryCharge,
      }, paymentCustomer);
      if (isItemSplit || isExistingSplitOrder) {
        orderInfo.isSplitOrder = true;
      }
      if (selectedPaymentMethod === 5 && option?.debitorCustomerDetails) {
        orderInfo.debitorCustomerDetails = option.debitorCustomerDetails;
      }

      const resolvedDiscountPayload = buildDiscountPayload(
        orderDetails,
        payableSubTotal,
        payableDiscount,
      );
      if (resolvedDiscountPayload) {
        orderInfo.discount = resolvedDiscountPayload;
        const resolvedDiscountId = resolveDiscountId(
          orderDetails,
          resolvedDiscountPayload,
        );
        if (resolvedDiscountId != null) {
          orderInfo.discountId = resolvedDiscountId;
        }
        if (
          resolvedDiscountPayload.discountType === "CUSTOM" &&
          orderInfo.customDiscountValue == null
        ) {
          orderInfo.customDiscountValue = resolvedDiscountPayload.discountValue;
        }
      }

      orderInfo.orderPaymentSummary = orderPaymentSummary;
      orderInfo.orderPaymentDetails = orderPaymentDetails;

      if (giftCard) {
        orderInfo.giftCard = giftCard;
        orderInfo.appliedGiftCard = giftCard;
        orderInfo.giftCardTotal = giftCardTotal;
        orderInfo.isfullPaidWithGiftCard =
          giftCardTotal > 0 && Math.abs(totals.total - giftCardTotal) < 0.01;
      }

      if (option?.cloverResponse) {
        orderInfo.cloverResponse = option.cloverResponse;
      }

      const settlePayload: any = {
        currency,
        paymentMethod: selectedPaymentMethod,
        amount,
        tip,
        deliveryCharge: payableDeliveryCharge,
        isEditPayment: false,
        orderInfo,
      };

      const allowOfflineFallback = serverConnection.isConnected();
      const settleRes = await orderService.settleOrder(
        order._id || order.id || order.orderId,
        settlePayload,
        allowOfflineFallback,
      );
      if (settleRes?.remote === false && settleRes?.isNetworkError && allowOfflineFallback) {
        const offlineOrderInfo = {
          ...orderInfo,
          isTscOffline: true,
        };
        try {
          const orderId =
            order?._id || order?.id || order?.orderId || orderDetails?.localOrderId;
          if (orderId) {
            await orderService.updateOrder(`${orderId}`, {
              orderStatusId: ORDER_STATUS.DELIVERED,
              updatedAt: offlineOrderInfo.updatedAt ?? now,
              orderDetails: sanitizePersistedOrderDetails({
                ...offlineOrderInfo,
                isTscOffline: true,
              }),
              settleInfo: orderService.buildLocalSettleInfo(
                settlePayload,
                {
                  ...offlineOrderInfo,
                  isTscOffline: true,
                },
                {
                  isTscOffline: true,
                },
              ),
              isSynced: false,
            });
            setWorkingOrderDetails({ ...offlineOrderInfo });
          }
        } catch (localErr) {
          console.warn("Offline settle local update failed:", localErr);
        }
        if (option?.print) {
          emitPosPrint(offlineOrderInfo, selectedPaymentMethod);
        }
        await emitOrderSync("ORDER_PAID", {
          orderInfo: buildOrderSyncInfo(
            {
              ...offlineOrderInfo,
              localOrderId:
                order?._id || order?.id || order?.orderId || orderDetails?.localOrderId,
              customOrderId:
                order?.customOrderId || offlineOrderInfo?.customOrderId,
            },
            order?.customOrderId || order?._id,
          ),
        });
        await unlockOrder(order);
        setMarking(false);
        return { keepModalOpen: false, resetToDashboard: true };
      }
      const normalized = settleRes?.normalized;
      console.log(normalized);
      if (normalized) {
        orderInfo.orderPaymentSummary =
          normalized.orderPaymentSummary ?? orderInfo.orderPaymentSummary;
        if (normalized.orderPaymentDetails) {
          orderInfo.orderPaymentDetails = normalized.orderPaymentDetails;
        }
        if (normalized.paidAt) {
          orderInfo.paidAt = normalized.paidAt;
        }
        if (normalized.tsc !== undefined) {
          console.log("tsc===>", normalized.tsc);
          orderInfo.tsc = normalized.tsc;
        }
        if (normalized.invoiceNumber !== undefined) {
          orderInfo.invoiceNumber = normalized.invoiceNumber;
        }
        if (normalized.giftCardLogs !== undefined) {
          orderInfo.giftCardLogs = normalizeGiftCardLogs(
            normalized.giftCardLogs,
          );
        }
        if (normalized.orderCustomerDetails !== undefined) {
          orderInfo.orderCustomerDetails = normalized.orderCustomerDetails;
        }
      }

      // Ensure local order captures gift card data after settlement
      try {
        const orderId =
          order?._id || order?.id || order?.orderId || orderDetails?.localOrderId;
        if (orderId) {
          await orderService.updateOrder(`${orderId}`, {
            orderStatusId: ORDER_STATUS.DELIVERED,
            updatedAt: orderInfo.updatedAt ?? now,
            orderDetails: sanitizePersistedOrderDetails(orderInfo),
            settleInfo: orderService.buildLocalSettleInfo(
              settlePayload,
              orderInfo,
              {
                splitLog: order?.settleInfo?.splitLog,
              },
            ),
            isSynced: true,
          });
          setWorkingOrderDetails({ ...orderInfo });
        }
      } catch (localErr) {
        console.warn("Local order update after settle failed:", localErr);
      }
      if (option?.print) {
        emitPosPrint(orderInfo, selectedPaymentMethod);
      }
      await emitOrderSync("ORDER_PAID", {
        orderInfo: buildOrderSyncInfo(
          {
            ...orderInfo,
            localOrderId:
              order?._id || order?.id || order?.orderId || orderDetails?.localOrderId,
            customOrderId: order?.customOrderId || orderInfo?.customOrderId,
          },
          order?.customOrderId || order?._id,
        ),
      });
      await unlockOrder(order);
      setMarking(false);
      return { keepModalOpen: false, resetToDashboard: true };
    } catch (err) {
      setMarking(false);
      console.error("Error settling order after payment selection:", JSON.stringify(err));
      showToast("error", t("unableToCompletePayment"));
      return { keepModalOpen: false };
    }
  };

  const handlePaymentSelect = async (option: any) => {
    setSelectedPaymentId(
      toNumber(option?.paymentMethod ?? option?.id, 0),
    );

    if (!pendingSettleRef.current) {
      return { keepOpen: true };
    }

    const isSplitSelection = option?.isItemSplit === true;
    const settleResult = await settleOrderWithPayment(option);

    if (isSplitSelection && settleResult?.keepModalOpen) {
      setPendingSettle(true);
      pendingSettleRef.current = true;
      return {
        keepOpen: true,
        resetPayment: settleResult?.resetPayment,
      };
    }

    setPendingSettle(false);
    pendingSettleRef.current = false;
    return {
      keepOpen: false,
      resetToDashboard: settleResult?.resetToDashboard === true,
    };
  };

  const handlePrintPreview = async (option: any) => {
    try {
      const orderDetails = displayedOrderDetails || {};
      const paymentMethod = toNumber(option?.paymentMethod ?? option?.id, 0);
      const paymentCustomer =
        paymentMethod === 5
          ? resolveOrderCustomer(option, option?.selectedCustomer ?? selectedCustomer)
          : selectedCustomer;
      const orderItems = Array.isArray(orderDetails?.orderItem)
        ? orderDetails.orderItem
        : Array.isArray(orderDetails?.orderItems)
          ? orderDetails.orderItems
          : [];
      const previewOrderInfo: any = mergeOrderCustomerData({
        ...orderDetails,
        orderItem: orderItems,
        invoiceNumber: "printPreview",
        paymentMethod,
        isPrint: true,
        printReceipt: true,
        tip: toNumber(option?.tip, 0),
        giftCard: option?.giftCard ?? null,
        appliedGiftCard: option?.giftCard ?? null,
        giftCardTotal: toNumber(option?.giftCardTotal, 0),
        deliveryCharge: toNumber(
          option?.deliveryCharge,
          resolvedDeliveryCharge,
        ),
        orderPaymentSummary:
          option?.orderPaymentSummary ?? { paymentProcessorId: paymentMethod },
        orderPaymentDetails: Array.isArray(option?.orderPaymentDetails)
          ? option.orderPaymentDetails
          : undefined,
      }, paymentCustomer);
      if (paymentMethod === 5 && option?.debitorCustomerDetails) {
        previewOrderInfo.debitorCustomerDetails = option.debitorCustomerDetails;
      }
      emitPosPrintPreview(previewOrderInfo, paymentMethod);
    } catch (error) {
      console.error("Print preview failed:", error);
      showToast("error", t("unableToGeneratePrintPreview"));
    }
  };

  useEffect(() => {
    if (!pendingSettle) {
      return;
    }

    setPaymentFlowHandlers({
      onSelect: handlePaymentSelect,
      onPrintPreview: handlePrintPreview,
      onClose: () => {
        setPendingSettle(false);
        pendingSettleRef.current = false;
      },
    });
  }, [pendingSettle, handlePaymentSelect, handlePrintPreview]);

  const registerPaymentHandlers = useCallback((shouldSettle: boolean) => {
    setPendingSettle(shouldSettle);
    pendingSettleRef.current = shouldSettle;

    setPaymentFlowHandlers({
      onSelect: handlePaymentSelect,
      onPrintPreview: handlePrintPreview,
      onClose: () => {
        setPendingSettle(false);
        pendingSettleRef.current = false;
      },
    });
  }, [handlePaymentSelect, handlePrintPreview]);

  const openPaymentScreen = useCallback((mode: "settle" | "method") => {
    const shouldSettle = mode === "settle";
    registerPaymentHandlers(shouldSettle);

    navigation.push("Payment", {
        title: shouldSettle ? t("payment") : t("changePaymentMethod"),
        orderTotal: totals.total,
        orderSubTotal: totals.subtotal,
        orderDiscountTotal: totals.discount,
        orderDeliveryCharge: resolvedDeliveryCharge,
        orderDeliveryTypeId: serviceTypeId,
        selectedAddressDeliveryCharge:
          selectedCustomerAddress?.deliveryCharge ?? null,
        companyId: resolvedCompanyId,
        orderNo:
          order?.customOrderId ||
          order?.orderDetails?.customOrderId ||
          order?.orderDetails?.orderNumber ||
          order?._id ||
          order?.id ||
          null,
        terminalPaymentEnabled: shouldSettle,
        splitItems: splitPaymentItems,
        allowSplitOption,
        hidePrintPreview: hideDeleteForSplit,
        selectedCustomer,
      });
  }, [
    allowSplitOption,
    hideDeleteForSplit,
    navigation,
    registerPaymentHandlers,
    resolvedDeliveryCharge,
    resolvedCompanyId,
    serviceTypeId,
    selectedCustomer,
    selectedCustomerAddress?.deliveryCharge,
    splitPaymentItems,
    totals.total,
    totals.subtotal,
    totals.discount,
  ]);

  const handleOpenPaymentModal = useCallback(() => {
    openPaymentScreen("method");
  }, [openPaymentScreen]);

  const handleMarkAsPaid = useCallback(() => {
    if (isPaid) return;
    void emitOrderCompletionStarted("PAY", {
      tableNo: order?.orderDetails?.tableNo ?? null,
      orderNumber:
        order?.customOrderId ||
        order?.orderDetails?.customOrderId ||
        order?.orderDetails?.orderNumber ||
        order?._id ||
        order?.id,
    });
    lockPayment(order);
    openPaymentScreen("settle");
  }, [isPaid, marking, openPaymentScreen, order]);

  useEffect(() => {
    if (!pendingSettle) {
      return;
    }

    registerPaymentHandlers(true);
  }, [pendingSettle, registerPaymentHandlers]);

  const footerHeight = 212;

  const renderItemCard = (it: any) => {
    const quantity = getCartItemQuantity(it);
    const itemUnitTotal = getItemUnitTotal(it);
    const itemLineTotal = getItemLineTotal(it);
    const optionsSummary = getItemOptionsSummary(it);
    const voucherDetailLines = getVoucherDetailLines(it);

    return (
      <Card
        key={it.cartId}
        style={{
          marginBottom: 10,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <View style={styles.itemRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={[styles.itemName, { color: colors.text }]}>
              {it.customId ? `${it.customId}. ` : ""}
              {it.itemName}
            </Text>

            {!!optionsSummary && (
              <Text
                style={[styles.optionText, { color: colors.textSecondary }]}
              >
                {optionsSummary}
              </Text>
            )}

            {voucherDetailLines.length > 0 && (
              <View style={{ marginTop: 2, marginBottom: 6 }}>
                {voucherDetailLines.map((line) => (
                  <Text
                    key={`${it.cartId || it.itemId}-${line.key}`}
                    style={{
                      color: colors.textSecondary,
                      marginTop: 2,
                      marginLeft: line.indent,
                      fontSize: line.isSection ? 10 : 12,
                      fontWeight: line.isSection || line.isItem ? "600" : "400",
                      textTransform: line.isSection ? "uppercase" : "none",
                      letterSpacing: line.isSection ? 0.6 : 0,
                    }}
                  >
                    {line.text}
                  </Text>
                ))}
              </View>
            )}

            {Array.isArray(it.attributeValues) &&
              it.attributeValues.length > 0 && (
                <View style={{ marginTop: 6 }}>
                  {it.attributeValues.map(
                    (attributeValue: any, valueIndex: number) => {
                      const name = getAttributeValueName(attributeValue);
                      const valueQuantity =
                        getAttributeValueQuantity(attributeValue);
                      const valuePrice = getAttributeValuePrice(attributeValue);
                      if (!name) return null;

                      return (
                        <Text
                          key={`${it.cartId}-value-${valueIndex}`}
                          style={{
                            color: colors.textSecondary,
                            fontSize: 12,
                            marginTop: 2,
                          }}
                        >
                          � {valueQuantity} x {name}
                          {valuePrice > 0
                            ? ` (+${formatCurrency(valuePrice)})`
                            : ""}
                        </Text>
                      );
                    },
                  )}
                </View>
              )}

            {it.orderItemNote ? (
              <Text
                style={{
                  color: colors.textSecondary,
                  marginTop: 7,
                  fontStyle: "italic",
                  fontSize: 12,
                }}
              >
                {t('note')}: {it.orderItemNote}
              </Text>
            ) : null}
          </View>

          <View
            style={{
              alignItems: "flex-end",
              justifyContent: "space-between",
            }}
          >
            <View
              style={{
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 4,
                backgroundColor: colors.primary + "18",
              }}
            >
              <Text
                style={{
                  color: colors.primary,
                  fontWeight: "700",
                  fontSize: 11,
                }}
              >
                x{quantity}
              </Text>
            </View>

            <View style={{ alignItems: "flex-end", marginTop: 20 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                {formatCurrency(itemUnitTotal)} each
              </Text>
              <Text
                style={{
                  color: colors.text,
                  fontWeight: "800",
                  fontSize: 15,
                  marginTop: 2,
                }}
              >
                {formatCurrency(itemLineTotal)}
              </Text>
            </View>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
        <Card rounded={14} style={{ padding: 12, borderColor: colors.border }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                Order ID
              </Text>
              <Text
                style={{
                  color: colors.text,
                  fontWeight: "800",
                  fontSize: 17,
                  marginTop: 2,
                }}
              >
                {order.customOrderId || order._id}
              </Text>
            </View>

            <View
              style={{
                backgroundColor: statusTone.bg,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 5,
              }}
            >
              <Text
                style={{
                  color: statusTone.fg,
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                {isPaid ? t("paid") : orderStatusLabel}
              </Text>
            </View>
          </View>

          <View
            style={{
              flexDirection: "row",
              marginTop: 10,
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <View
              style={[
                styles.metaChip,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceHover || colors.background,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="silverware-fork-knife"
                size={14}
                color={colors.textSecondary}
              />
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 11,
                  marginLeft: 4,
                }}
              >
                {getOrderTypeLabel(
                  displayedOrderDetails?.orderDeliveryTypeId ?? 0,
                  t,
                  displayedOrderDetails?.tableNo,
                )}
              </Text>
            </View>
            <View
              style={[
                styles.metaChip,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceHover || colors.background,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="clock-outline"
                size={14}
                color={colors.textSecondary}
              />
              <Text
                numberOfLines={1}
                style={{
                  color: colors.textSecondary,
                  fontSize: 11,
                  marginLeft: 4,
                }}
              >
                {formatTimestamp(
                  order.createdAt || displayedOrderDetails?.createdAt,
                  t("notAvailable"),
                )}
              </Text>
            </View>
          </View>

          {serviceTypeId !== 0 && (serviceTimeLabel || (serviceTypeId === 2 && familyName)) ? (
            <View
              style={[
                styles.serviceInfoCard,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceHover || colors.background,
                },
              ]}
            >
              {serviceTimeLabel ? (
                <View style={styles.serviceInfoRow}>
                  <MaterialCommunityIcons
                    name="clock-outline"
                    size={15}
                    color={colors.textSecondary}
                  />
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 6 }}>
                    {serviceTypeId === 1 ? t("deliveryTime") : t("pickupTime")}:{" "}
                    <Text style={{ color: colors.text, fontWeight: "700" }}>
                      {serviceTimeLabel}
                    </Text>
                  </Text>
                </View>
              ) : null}

              {serviceTypeId === 2 && familyName ? (
                <View style={styles.serviceInfoRow}>
                  <MaterialCommunityIcons
                    name="account-group-outline"
                    size={15}
                    color={colors.textSecondary}
                  />
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 6 }}>
                    {t("familyName")}:{" "}
                    <Text style={{ color: colors.text, fontWeight: "700" }}>
                      {familyName}
                    </Text>
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {selectedCustomer ? (
            <View
              style={[
                styles.serviceInfoCard,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceHover || colors.background,
                },
              ]}
            >
              <View style={styles.serviceInfoRow}>
                <MaterialCommunityIcons
                  name="account-outline"
                  size={15}
                  color={colors.textSecondary}
                />
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 6 }}>
                  {t("customer")}:{" "}
                  <Text style={{ color: colors.text, fontWeight: "700" }}>
                    {selectedCustomerName || selectedCustomer.mobileNo || t("selectedCustomer")}
                  </Text>
                </Text>
              </View>

              {selectedCustomer.mobileNo ? (
                <View style={styles.serviceInfoRow}>
                  <MaterialCommunityIcons
                    name="phone-outline"
                    size={15}
                    color={colors.textSecondary}
                  />
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 6 }}>
                    {selectedCustomer.mobileNo}
                  </Text>
                </View>
              ) : null}

              {serviceTypeId === 1 && selectedCustomerAddressText ? (
                <View style={styles.serviceInfoRow}>
                  <MaterialCommunityIcons
                    name="map-marker-outline"
                    size={15}
                    color={colors.textSecondary}
                  />
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 6, flex: 1 }}>
                    {selectedCustomerAddressText}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View
            style={{
              marginTop: 10,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <MaterialCommunityIcons
              name="credit-card-outline"
              size={15}
              color={colors.textSecondary}
            />
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 12,
                marginLeft: 6,
              }}
            >
              {t("payment")}:{" "}
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                {paymentLabel}
              </Text>
            </Text>
          </View>

          <View style={{ flexDirection: "row", marginTop: 12, gap: 8 }}>
            {(["items", "notes"] as const).map((section) => {
              const selected = activeSection === section;
              return (
                <TouchableOpacity
                  key={section}
                  onPress={() => setActiveSection(section)}
                  style={[
                    styles.sectionTab,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected
                        ? colors.primary + "15"
                        : colors.surface,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selected ? colors.primary : colors.textSecondary,
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    {section === "items" ? t("items") : t("notes")}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 12, marginTop: 12 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + footerHeight }}
        showsVerticalScrollIndicator={false}
      >
        {items.length === 0 ? (
          <Card style={{ padding: 14 }}>
              <Text style={{ color: colors.textSecondary }}>
              {t("noItemsInThisOrder")}
            </Text>
          </Card>
        ) : activeSection === "items" ? (
          shouldShowGroupSections ? (
            groupedItems.map((group) => {
              const isExpanded =
                groupCount <= 1 || expandedGroupType === group.groupType;

              return (
                <View
                  key={`group-${group.groupType}`}
                  style={{ marginBottom: 12 }}
                >
                  <TouchableOpacity
                    activeOpacity={groupCount > 1 ? 0.8 : 1}
                    onPress={() => {
                      if (groupCount > 1) {
                        setExpandedGroupType(group.groupType);
                      }
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: "700" }}>
                      {group.label}
                    </Text>
                    {groupCount > 1 ? (
                      <MaterialCommunityIcons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={colors.textSecondary}
                      />
                    ) : null}
                  </TouchableOpacity>

                  {isExpanded
                    ? group.items.map((it: any) => renderItemCard(it))
                    : null}
                </View>
              );
            })
          ) : (
            items.map((it: any) => renderItemCard(it))
          )
        ) : activeSection === "notes" ? (
          <Card style={{ padding: 12, borderColor: colors.border }}>
            <Text
              style={{ color: colors.text, fontWeight: "700", marginBottom: 8 }}
            >
                {t("orderNote")}
              </Text>
              <Text style={{ color: colors.textSecondary }}>
              {displayedOrderDetails?.orderNotes || t("noOrderNoteAdded")}
            </Text>

            <View
              style={{
                marginTop: 12,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: 10,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontWeight: "700",
                  marginBottom: 8,
                }}
              >
                {t("itemNotes")}
              </Text>
              {items.some((it: any) => !!it.orderItemNote) ? (
                items
                  .filter((it: any) => !!it.orderItemNote)
                  .map((it: any) => (
                    <View key={`${it.cartId}-note`} style={{ marginBottom: 8 }}>
                      <Text
                        style={{
                          color: colors.text,
                          fontWeight: "600",
                          fontSize: 13,
                        }}
                      >
                        {it.itemName}
                      </Text>
                      <Text
                        style={{
                          color: colors.textSecondary,
                          marginTop: 2,
                          fontSize: 12,
                        }}
                      >
                        {it.orderItemNote}
                      </Text>
                    </View>
                  ))
              ) : (
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {t("noItemLevelNotes")}
                </Text>
              )}
            </View>
          </Card>
        ) : (
          <>
            <Card style={{ padding: 12, borderColor: colors.border }}>
              <Text
                style={{ color: colors.text, fontWeight: "700", marginBottom: 8 }}
              >
                {t("paymentSummary")}
              </Text>
              <View style={styles.paymentRow}>
                <Text style={{ color: colors.textSecondary }}>
                  {t("currentMethod")}
                </Text>
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {paymentLabel}
                </Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={{ color: colors.textSecondary }}>{t("totalAmount")}</Text>
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {formatCurrency(totals.total)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleOpenPaymentModal}
                style={[
                  styles.changePaymentBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceHover || colors.background,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="credit-card-edit-outline"
                  size={16}
                  color={colors.text}
                />
                <Text
                  style={{
                    color: colors.text,
                    fontWeight: "700",
                    marginLeft: 6,
                    fontSize: 12,
                  }}
                >
                  {t("changePaymentMethod")}
                </Text>
              </TouchableOpacity>
            </Card>
          </>
        )}
      </ScrollView>

      <PinModal
        visible={pinModalVisible}
        onClose={() => setPinModalVisible(false)}
        onVerified={handlePinVerified}
      />

      <CancelOrderModal
        visible={cancelModalVisible}
        onClose={() => setCancelModalVisible(false)}
        onConfirm={cancelOrder}
        loading={canceling}
      />

      <View
        style={[
          styles.footer,
          {
            borderTopColor: colors.border,
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + 10,
          },
        ]}
      >
        <View
          style={[
            styles.footerSummaryCard,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
        >
          <View style={styles.summaryRow}>
            <Text style={{ color: colors.textSecondary }}>{t("subtotal")}</Text>
            <Text style={{ color: colors.text, fontWeight: "700" }}>
              {formatCurrency(totals.subtotal)}
            </Text>
          </View>
          {totals.discount > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={{ color: colors.textSecondary }}>{t("discount")}</Text>
              <Text style={{ color: colors.error, fontWeight: "700" }}>
                {formatCurrency(-totals.discount)}
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
            <Text style={{ color: colors.text, fontWeight: "800" }}>{t("total")}</Text>
            <Text
              style={{ color: colors.primary, fontWeight: "800", fontSize: 17 }}
            >
              {formatCurrency(totals.total)}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          {!hideDeleteForSplit ? (
            <TouchableOpacity
              onPress={handleDeletePress}
              disabled={isOrderPaid || canceling}
              style={[
                styles.footerIconBtn,
                {
                  backgroundColor:
                    isOrderPaid || canceling ? colors.border : colors.error,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={18}
                color={colors.textInverse || "#fff"}
              />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={onEdit}
            style={[
              styles.footerBtn,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="pencil-outline"
              size={16}
              color={colors.text}
            />
            <Text
              style={{
                color: colors.text,
                marginLeft: 6,
                fontWeight: "700",
                fontSize: 12,
              }}
            >
              {t("editOrder")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleMarkAsPaid}
            disabled={marking || isPaid}
            style={[
              styles.footerBtnPrimary,
              {
                backgroundColor:
                  marking || isPaid ? colors.border : colors.primary,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={isPaid ? "check-circle-outline" : "cash-check"}
              size={17}
              color={colors.textInverse || "#fff"}
            />
            <Text
              style={{
                color: colors.textInverse || "#fff",
                marginLeft: 6,
                fontWeight: "800",
                fontSize: 12,
              }}
            >
              {marking
                ? t("processing")
                : isPaid
                  ? t("alreadyPaid")
                  : t("markAsPaid")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  metaChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "100%",
  },
  serviceInfoCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  serviceInfoRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionTab: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  itemName: {
    fontWeight: "700",
    fontSize: 15,
  },
  optionText: {
    marginTop: 4,
    fontSize: 12,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  changePaymentBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
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
  footerBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  footerBtnPrimary: {
    flex: 1.3,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  footerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});



