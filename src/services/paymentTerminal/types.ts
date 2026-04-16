export type PaymentTerminalName = 'clover' | 'verifone';

export type PaymentTerminalDecision =
  | 'approved'
  | 'declined'
  | 'aborted'
  | 'pending'
  | 'unknown';

export type PaymentTerminalIpConfig = {
  terminal: PaymentTerminalName;
  host: string;
  port: number;
  password?: string;
  orderNo?: string;
};

export type PaymentTerminalSettings = {
  isPaymentTerminal?: boolean;
  paymentTerminal?: string;
  paymentTerminalHost?: string;
  paymentTerminalPort?: string | number;
  paymentTerminalPassword?: string | number | null;
};

export type PaymentTerminalForward = (entry: Record<string, any>) => void;

export type ZvtRunResult = {
  ok: boolean;
  name: string;
  receivedAt: string;
  hex: string;
  bytes: number;
  note: string;
  sawAnyData: boolean;
  sawNonAck: boolean;
  sawAuthAccepted: boolean;
};

export type PaymentTerminalAuthorizeOptions = {
  timeoutMs?: number;
  statusTimeoutMs?: number;
  attempts?: number;
  intervalMs?: number;
  skipCooldown?: boolean;
  registerBeforeStatus?: boolean;
  useDualStatusProbe?: boolean;
  quickProbeAfterAuth?: boolean;
  useAuthSessionListener?: boolean;
  useStandardAuthorizePayload?: boolean;
  allowCloseAfterAuthAccepted?: boolean;
  gapMs?: number;
  reference?: string | number;
};

export type PaymentTerminalResponse = {
  ok: boolean;
  outcome: 'success' | 'failed' | 'pending' | 'unknown';
  confirmed?: boolean;
  definitive?: boolean;
  paymentState?: string;
  status: string;
  userMessage?: string;
  register?: ZvtRunResult | null;
  auth?: ZvtRunResult | null;
  completion?: Record<string, any> | null;
  terminalEvidence?: Record<string, any>;
};
