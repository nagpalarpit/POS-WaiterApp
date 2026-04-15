import localApi from './localApi';

export type TerminalDecision =
  | 'approved'
  | 'declined'
  | 'aborted'
  | 'pending'
  | 'unknown';

type PaymentTerminalSettings = {
  isPaymentTerminal?: boolean;
  paymentTerminal?: string;
  paymentTerminalHost?: string;
  paymentTerminalPort?: string | number;
  paymentTerminalPassword?: string | number | null;
};

type ProcessCardPaymentParams = {
  settings?: PaymentTerminalSettings | null;
  paymentMethod?: number | null;
  amount: number;
  orderNo?: string | number | null;
};

type TerminalIpConfig = {
  terminal: 'clover' | 'verifone';
  host: string;
  port: number;
  password?: string;
  orderNo?: string;
};

const CARD_PAYMENT_METHOD = 1;

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const buildZvtIpConfig = (
  settings: PaymentTerminalSettings,
  orderNo?: string | number | null,
): TerminalIpConfig => {
  const terminalRaw = String(settings?.paymentTerminal || '').toLowerCase();
  const terminal = terminalRaw === 'clover' ? 'clover' : 'verifone';
  const host = String(settings?.paymentTerminalHost || '').trim();
  const port = Number(settings?.paymentTerminalPort);
  const passwordRaw = settings?.paymentTerminalPassword;

  return {
    terminal,
    host,
    port,
    password:
      passwordRaw === undefined || passwordRaw === null || passwordRaw === ''
        ? undefined
        : String(passwordRaw).trim(),
    orderNo: orderNo === undefined || orderNo === null ? undefined : String(orderNo).trim(),
  };
};

const terminalOutcome = (res: any): string =>
  String(res?.paymentState || res?.outcome || res?.decision || res?.status || '').toLowerCase();

const terminalDecision = (res: any): TerminalDecision => {
  const outcome = terminalOutcome(res);
  const polls = [
    ...(Array.isArray(res?.completion?.polls) ? res.completion.polls : []),
    ...(Array.isArray(res?.terminalEvidence?.statusPolls)
      ? res.terminalEvidence.statusPolls
      : []),
  ];
  const pollMessages = polls
    .map((p: any) => String(p?.terminalMessage || '').toLowerCase())
    .filter(Boolean);
  const hasPollAborted = polls.some((p: any) => p?.aborted === true);
  const hasPollDeclined = polls.some((p: any) => p?.declined === true);
  const hasPollApproved = polls.some((p: any) => p?.approved === true);
  const signals = [
    outcome,
    String(res?.outcome || '').toLowerCase(),
    String(res?.decision || '').toLowerCase(),
    String(res?.status || '').toLowerCase(),
    String(res?.userMessage || '').toLowerCase(),
    String(res?.terminalEvidence?.terminalMessage || '').toLowerCase(),
    String(res?.completion?.terminalMessage || '').toLowerCase(),
    ...pollMessages,
  ].filter(Boolean);

  if (res?.completion?.terminalAborted === true || hasPollAborted) return 'aborted';
  if (res?.completion?.terminalDeclined === true || hasPollDeclined) return 'declined';

  if (
    signals.some((s) =>
      [
        'aborted',
        'cancelled',
        'canceled',
        'cancel',
        'abgebrochen',
        'abbruch',
        'storniert',
        'storno',
      ].some((k) => s.includes(k)),
    )
  ) {
    return 'aborted';
  }

  if (
    signals.some((s) =>
      ['declined', 'failed', 'error', 'denied', 'rejected'].some((k) => s.includes(k)),
    )
  ) {
    return 'declined';
  }

  const statusSignal = String(res?.status || '').toLowerCase();
  const isInferredNoFinalSuccess =
    statusSignal.includes('inferred_success') || statusSignal.includes('no_final');
  if (
    res?.ok === true &&
    res?.confirmed === false &&
    res?.completion?.terminalApproved !== true &&
    !hasPollApproved &&
    isInferredNoFinalSuccess
  ) {
    return 'pending';
  }

  if (
    !signals.length &&
    res?.ok === true &&
    (res?.confirmed === true ||
      res?.completion?.terminalApproved === true ||
      hasPollApproved)
  ) {
    return 'approved';
  }

  if (res?.confirmed === true && res?.ok === true) return 'approved';
  if (res?.completion?.terminalApproved === true) return 'approved';
  if (hasPollApproved) return 'approved';
  if (
    signals.some((s) =>
      ['approved', 'clover_final_received', 'payment approved'].includes(s),
    )
  ) {
    return 'approved';
  }
  if (signals.some((s) => s === 'pending')) return 'pending';
  return 'unknown';
};

const callTerminalEndpoint = async (endpoint: string, payload: any) => {
  const response = await localApi.post(endpoint, payload, { timeout: 60000 });
  return response?.data?.data ?? response?.data;
};

class CloverTerminalService {
  shouldUseTerminal(settings?: PaymentTerminalSettings | null, paymentMethod?: number | null) {
    return (
      settings?.isPaymentTerminal === true &&
      paymentMethod === CARD_PAYMENT_METHOD &&
      !!settings?.paymentTerminalHost &&
      !!settings?.paymentTerminalPort
    );
  }

  getDecision(response: any): TerminalDecision {
    return terminalDecision(response);
  }

  async processCardPaymentIfNeeded({
    settings,
    paymentMethod,
    amount,
    orderNo,
  }: ProcessCardPaymentParams): Promise<any | null> {
    if (!this.shouldUseTerminal(settings, paymentMethod)) return null;

    const ip = buildZvtIpConfig(settings as PaymentTerminalSettings, orderNo);
    const amountCents = Math.round(toNumber(amount, 0) * 100);
    if (!ip.host || !ip.port || amountCents <= 0) {
      throw new Error('Terminal configuration is incomplete.');
    }

    let response = await callTerminalEndpoint('/api/v1/payment-terminal/authorize', {
      ip,
      amountCents,
      opts: {
        useAuthSessionListener: true,
        quickProbeAfterAuth: true,
        useDualStatusProbe: true,
      },
    });

    if (terminalDecision(response) === 'pending') {
      response = await callTerminalEndpoint('/api/v1/payment-terminal/reconcileLast', {
        ip,
        opts: {
          attempts: 4,
          intervalMs: 1000,
          statusTimeoutMs: 7000,
          skipCooldown: true,
          registerBeforeStatus: true,
          useDualStatusProbe: true,
        },
      });
    }

    return response;
  }
}

export default new CloverTerminalService();
