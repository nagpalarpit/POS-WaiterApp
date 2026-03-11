import React, { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import Card from './Card';
import { formatCurrency } from '../utils/currency';

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

type PaymentOption = {
  id: number;
  label: string;
  paymentMethod?: number;
  tip?: number;
  giftCard?: { code: string; amount: number };
  cashProvided?: number;
  orderPaymentSummary?: { paymentProcessorId: number };
  orderPaymentDetails?: PaymentDetail[];
  isItemSplit?: boolean;
  splitSelections?: number[];
  splitItemTotal?: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (option: PaymentOption & { print?: boolean }) => void | Promise<void>;
  orderTotal?: number;
  splitItems?: SplitSelectableItem[];
  allowSplitOption?: boolean;
};

const toAmount = (value: string): number => {
  const parsed = parseFloat(value || '0');
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
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
  orderTotal = 0,
  splitItems = [],
  allowSplitOption = true,
}: Props) {
  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();

  const primaryTabs = useMemo(
    () => [
      { id: 0, label: 'Cash' },
      { id: 1, label: 'Card' },
      ...(allowSplitOption ? [{ id: 3, label: 'Split' }] : []),
      { id: 99, label: 'Other' },
    ],
    [allowSplitOption]
  );

  const otherMethods: PaymentOption[] = [
    { id: 5, label: 'Debitor' },
    { id: 6, label: 'Liefernado' },
    { id: 7, label: 'Uber' },
    { id: 8, label: 'Wolt' },
    { id: 9, label: 'Bolt' },
    { id: 10, label: 'Schlemmerblock' },
  ];

  const [activeTab, setActiveTab] = useState<number>(0);
  const [tipValue, setTipValue] = useState('');
  const [giftCode, setGiftCode] = useState('');
  const [giftAmount, setGiftAmount] = useState('');
  const [cashProvided, setCashProvided] = useState('');
  const [selectedOtherMethod, setSelectedOtherMethod] = useState<number>(5);
  const [splitSelections, setSplitSelections] = useState<number[]>([]);
  const [splitPaymentMethod, setSplitPaymentMethod] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);

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
  const giftNum = toAmount(giftAmount);

  const splitItemTotal = useMemo(() => {
    return round2(
      splitItems.reduce((sum, item, index) => {
        const selectedQty = Math.max(0, Math.floor(splitSelections[index] || 0));
        return sum + item.unitTotal * selectedQty;
      }, 0)
    );
  }, [splitItems, splitSelections]);

  const baseTotal = activeTab === 3 ? splitItemTotal : orderTotal;
  const isSplitMode = activeTab === 3;
  const useTallSplitModal = isSplitMode && splitItems.length > 5;
  const splitModalHeight = useTallSplitModal ? windowHeight * 0.95 : windowHeight * 0.86;
  const defaultModalHeight = windowHeight * 0.78;
  const due = Math.max(0, round2(baseTotal + tipNum - giftNum));
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
    setTipValue('');
    setGiftCode('');
    setGiftAmount('');
    setCashProvided('');
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
    setTipValue('');
    setGiftCode('');
    setGiftAmount('');
    setCashProvided('');
  };

  const buildSingleMethodPayload = (
    method: number,
    print: boolean
  ): PaymentOption & { print: boolean } => ({
    id: method,
    label:
      method === 99
        ? 'Other'
        : primaryTabs.find((tab) => tab.id === method)?.label || 'Payment',
    paymentMethod: method,
    tip: tipNum,
    giftCard: giftCode ? { code: giftCode, amount: giftNum } : undefined,
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

  const hasSplitSelection = splitSelections.some((qty) => Math.floor(qty || 0) > 0);
  const isSplitInvalid = activeTab === 3 && !hasSplitSelection;

  const handleConfirm = async (print = false) => {
    if (isProcessing) return;
    if (activeTab === 3) {
      if (isSplitInvalid) return;
      setIsProcessing(true);
      const splitPaymentTotal = round2(due);
      const payload = {
        id: 3,
        label: 'Split Payment',
        paymentMethod: splitPaymentMethod,
        tip: tipNum,
        giftCard: giftCode ? { code: giftCode, amount: giftNum } : undefined,
        isItemSplit: true,
        splitSelections: splitSelections.map((qty) => Math.max(0, Math.floor(qty || 0))),
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
      setTipValue('');
      setGiftCode('');
      setGiftAmount('');
      setCashProvided('');
      setSplitSelections(splitItems.map(() => 0));
      return;
    }

    if (activeTab === 99) {
      setIsProcessing(true);
      const payload = buildSingleMethodPayload(selectedOtherMethod, print);
      try {
        await Promise.resolve(onSelect(payload));
      } finally {
        setIsProcessing(false);
      }
      reset();
      return;
    }

    setIsProcessing(true);
    const payload = buildSingleMethodPayload(activeTab, print);
    try {
      await Promise.resolve(onSelect(payload));
    } finally {
      setIsProcessing(false);
    }
    reset();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={closeWithReset}
      allowSwipeDismissal={true}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <Card
          padding={0}
          rounded={16}
          style={[
            styles.card,
            {
              borderColor: colors.border,
              maxHeight: isSplitMode ? splitModalHeight : defaultModalHeight,
              height: isSplitMode ? splitModalHeight : undefined,
            },
          ]}
        >
          <View style={[styles.headerRow, { paddingHorizontal: 18, paddingTop: 0 }]}>
            <View style={styles.headerTitleWrap}>
              <Text style={[styles.title, { color: colors.text }]}>Save & Final Settle</Text>
            </View>
            <View style={styles.headerActionsWrap}>
              <TouchableOpacity onPress={closeWithReset}>
                <Text style={{ color: colors.textSecondary, fontSize: 20 }}>x</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.dragIndicatorContainer}>
            <View style={[styles.dragIndicator, { backgroundColor: colors.border }]} />
          </View>
          <View style={isSplitMode ? { flex: 1 } : undefined}>
            {!isSplitMode ? (
            <View style={{ flexDirection: 'row', marginTop: 8, marginBottom: 6, gap: 8 }}>
              {primaryTabs.map((tab) => (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  style={[
                    styles.tab,
                    {
                      backgroundColor: activeTab === tab.id ? colors.primary : 'transparent',
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: activeTab === tab.id ? colors.textInverse : colors.text }}>
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
                flex: isSplitMode ? 1 : undefined,
                maxHeight: isSplitMode ? undefined : 390,
              },
            ]}
            contentContainerStyle={{
              paddingBottom: isSplitMode ? 8 : 0,
              flexGrow: 1,
            }}
            showsVerticalScrollIndicator={isSplitMode}
          >
            {activeTab === 99 ? (
              <View>
                <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>Other Payments</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {otherMethods.map((method) => {
                    const selected = selectedOtherMethod === method.id;
                    return (
                      <TouchableOpacity
                        key={method.id}
                        onPress={() => setSelectedOtherMethod(method.id)}
                        style={[
                          styles.pill,
                          {
                            borderColor: selected ? colors.primary : colors.border,
                            backgroundColor: selected ? colors.primary + '15' : 'transparent',
                          },
                        ]}
                      >
                        <Text style={{ color: selected ? colors.primary : colors.text }}>
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
                    <Text style={{ color: colors.textSecondary }}>Cash provided</Text>
                    <TextInput
                      keyboardType="numeric"
                      placeholder="Enter cash amount"
                      placeholderTextColor={colors.textSecondary}
                      value={cashProvided}
                      onChangeText={setCashProvided}
                      style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                    />

                    <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Cash to return</Text>
                    <View style={[styles.input, { justifyContent: 'center' }]}> 
                      <Text style={{ color: colors.text }}>
                        {formatCurrency(Math.max(0, toAmount(cashProvided) - due))}
                      </Text>
                    </View>
                  </View>
                )}

                {activeTab === 1 && (
                  <View>
                    <Text style={{ color: colors.textSecondary }}>Card payment selected</Text>
                  </View>
                )}

                {isSplitMode && (
                  <View>
                    <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>
                      Split items (pay selected quantity only)
                    </Text>

                    <View style={styles.splitMethodRow}>
                      {[{ id: 0, label: 'Cash' }, { id: 1, label: 'Card' }].map((method) => {
                        const selected = splitPaymentMethod === method.id;
                        return (
                          <TouchableOpacity
                            key={method.id}
                            onPress={() => setSplitPaymentMethod(method.id)}
                            style={[
                              styles.splitMethodBtn,
                              {
                                borderColor: selected ? colors.primary : colors.border,
                                backgroundColor: selected ? colors.primary : 'transparent',
                              },
                            ]}
                          >
                            <Text style={{ color: selected ? colors.textInverse : colors.text }}>
                              {method.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {splitItems.length === 0 ? (
                      <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
                        No items available for split.
                      </Text>
                    ) : (
                      splitItems.map((item, index) => {
                        const selectedQty = Math.max(0, Math.floor(splitSelections[index] || 0));
                        return (
                          <View
                            key={item.key || `${index}`}
                            style={[
                              styles.splitItemCard,
                              {
                                borderColor: colors.border,
                                backgroundColor: colors.surfaceHover || colors.surface,
                              },
                            ]}
                          >
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={{ color: colors.text, fontWeight: '700' }}>{item.name}</Text>
                              <Text style={{ color: colors.textSecondary, marginTop: 2 }}>
                                Qty: {item.quantity} x {formatCurrency(item.unitTotal)}
                              </Text>
                            </View>

                            <View style={styles.splitCounterWrap}>
                              <TouchableOpacity
                                onPress={() => updateSplitSelection(index, -1)}
                                style={[styles.splitCounterBtn, { borderColor: colors.border }]}
                              >
                                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>-</Text>
                              </TouchableOpacity>
                              <Text style={{ color: colors.text, width: 28, textAlign: 'center', fontWeight: '700' }}>
                                {selectedQty}
                              </Text>
                              <TouchableOpacity
                                onPress={() => updateSplitSelection(index, 1)}
                                style={[styles.splitCounterBtn, { borderColor: colors.border }]}
                              >
                                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>+</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })
                    )}

                    <View style={[styles.splitSummary, { borderColor: colors.border }]}> 
                      <Text style={{ color: colors.textSecondary }}>
                        Selected: {formatCurrency(splitItemTotal)}
                      </Text>
                      <Text style={{ color: colors.text, fontWeight: '700' }}>
                        Remaining: {formatCurrency(splitRemainingAmount)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: colors.textSecondary }}>Add Tip (optional)</Text>
              <TextInput
                keyboardType="numeric"
                placeholder="Enter tip amount"
                placeholderTextColor={colors.textSecondary}
                value={tipValue}
                onChangeText={setTipValue}
                style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              />
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: colors.textSecondary }}>Gift Card (optional)</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <TextInput
                  placeholder="Gift card code"
                  placeholderTextColor={colors.textSecondary}
                  value={giftCode}
                  onChangeText={setGiftCode}
                  style={[styles.input, { flex: 1, borderColor: colors.border, color: colors.text, marginTop: 0 }]}
                />
                <TextInput
                  keyboardType="numeric"
                  placeholder="Amount"
                  placeholderTextColor={colors.textSecondary}
                  value={giftAmount}
                  onChangeText={setGiftAmount}
                  style={[styles.input, { width: 96, borderColor: colors.border, color: colors.text, marginTop: 0 }]}
                />
              </View>
            </View>
          </ScrollView>
          </View>

          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}
          >
            <Text style={{ color: colors.text, fontWeight: '700' }}>{formatCurrency(due)}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
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
              <TouchableOpacity
                onPress={() => {
                  handleConfirm(false);
                }}
                disabled={isSplitInvalid || isProcessing}
                style={[
                  styles.payBtn,
                  { backgroundColor: isSplitInvalid || isProcessing ? colors.border : colors.primary },
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
                disabled={isSplitInvalid || isProcessing}
                style={[
                  styles.payBtnPrimary,
                  { backgroundColor: isSplitInvalid || isProcessing ? colors.border : colors.primary },
                ]}
              >
                {isProcessing ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={{ color: colors.textInverse }}>Pay & Print</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 0,
  },
  card: {
    width: '100%',
    maxHeight: '78%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 22,
    borderWidth: 1,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  splitBackBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragIndicatorContainer: {
    alignItems: 'center',
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
  ghostBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  payBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  payBtnPrimary: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  splitMethodRow: {
    flexDirection: 'row',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  splitCounterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  splitCounterBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitSummary: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});





