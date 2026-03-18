export type PaymentFlowReset = {
  orderTotal?: number;
  splitItems?: any[];
  allowSplitOption?: boolean;
};

export type PaymentFlowResult =
  | {
      keepOpen?: boolean;
      resetPayment?: PaymentFlowReset;
      resetToDashboard?: boolean;
    }
  | void;

export type PaymentFlowHandlers = {
  onSelect?: (option: any) => Promise<PaymentFlowResult> | PaymentFlowResult;
  onPrintPreview?: (option: any) => Promise<void> | void;
  onClose?: () => void;
};

let currentHandlers: PaymentFlowHandlers | null = null;

export const setPaymentFlowHandlers = (handlers: PaymentFlowHandlers) => {
  currentHandlers = handlers;
};

export const getPaymentFlowHandlers = (): PaymentFlowHandlers | null => {
  return currentHandlers;
};

export const clearPaymentFlowHandlers = () => {
  currentHandlers = null;
};
