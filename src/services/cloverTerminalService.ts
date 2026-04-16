import type {
  PaymentTerminalDecision as TerminalDecision,
  PaymentTerminalIpConfig,
  PaymentTerminalSettings,
} from './paymentTerminal/types';
import {
  authorizeTerminalPayment,
  reconcileTerminalPayment,
  terminalDecision,
} from './paymentTerminal/paymentTerminalClient';
import {
  addSentryBreadcrumb,
  captureTerminalError,
  captureTerminalEvent,
} from './sentry/sentryService';

export type { TerminalDecision };

type ProcessCardPaymentParams = {
  settings?: PaymentTerminalSettings | null;
  paymentMethod?: number | null;
  amount: number;
  orderNo?: string | number | null;
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

const normalizeTerminal = (terminal?: string | null): 'clover' | 'verifone' =>
  String(terminal || '').toLowerCase() === 'clover' ? 'clover' : 'verifone';

const safeTerminalConfig = (ip: PaymentTerminalIpConfig) => ({
  terminal: ip.terminal,
  host: ip.host,
  port: ip.port,
  orderNo: ip.orderNo,
});

const buildZvtIpConfig = (
  settings: PaymentTerminalSettings,
  orderNo?: string | number | null,
): PaymentTerminalIpConfig => {
  const host = String(settings?.paymentTerminalHost || '').trim();
  const port = Number(settings?.paymentTerminalPort);
  const passwordRaw = settings?.paymentTerminalPassword;

  return {
    terminal: normalizeTerminal(settings?.paymentTerminal),
    host,
    port,
    password:
      passwordRaw === undefined || passwordRaw === null || passwordRaw === ''
        ? undefined
        : String(passwordRaw).trim(),
    orderNo: orderNo === undefined || orderNo === null ? undefined : String(orderNo).trim(),
  };
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
      const error = new Error('Terminal configuration is incomplete.');
      captureTerminalError(error, 'configuration_error', {
        ...safeTerminalConfig(ip),
        amountCents,
      });
      throw error;
    }

    const forward = (entry: Record<string, any>) => {
      addSentryBreadcrumb('zvt_event', {
        ...safeTerminalConfig(ip),
        ...entry,
      });
    };

    captureTerminalEvent('authorize_start', {
      ...safeTerminalConfig(ip),
      amountCents,
    });

    try {
      let response = await authorizeTerminalPayment(
        ip,
        amountCents,
        {
          useAuthSessionListener: true,
          quickProbeAfterAuth: true,
          useDualStatusProbe: true,
          registerBeforeStatus: true,
        },
        forward,
      );
      let decision = terminalDecision(response);

      captureTerminalEvent(
        'authorize_result',
        {
          ...safeTerminalConfig(ip),
          amountCents,
          decision,
          ok: response?.ok,
          outcome: response?.outcome,
          status: response?.status,
          userMessage: response?.userMessage,
          terminalEvidence: response?.terminalEvidence,
        },
        decision === 'approved' ? 'info' : decision === 'pending' ? 'warning' : 'error',
      );

      if (decision === 'pending') {
        captureTerminalEvent('reconcile_start', safeTerminalConfig(ip), 'warning');
        response = await reconcileTerminalPayment(
          ip,
          {
            attempts: 4,
            intervalMs: 1000,
            statusTimeoutMs: 7000,
            skipCooldown: true,
            registerBeforeStatus: true,
            useDualStatusProbe: true,
          },
          forward,
        );
        decision = terminalDecision(response);
        captureTerminalEvent(
          'reconcile_result',
          {
            ...safeTerminalConfig(ip),
            amountCents,
            decision,
            ok: response?.ok,
            outcome: response?.outcome,
            status: response?.status,
            userMessage: response?.userMessage,
            terminalEvidence: response?.terminalEvidence,
          },
          decision === 'approved' ? 'info' : 'error',
        );
      }

      return {
        ...response,
        terminal: ip.terminal,
        orderNo: ip.orderNo,
      };
    } catch (error: any) {
      captureTerminalError(error, 'authorize_error', {
        ...safeTerminalConfig(ip),
        amountCents,
        message: error?.message || String(error),
        code: error?.code || '',
        name: error?.name || '',
      });
      throw error;
    }
  }
}

export default new CloverTerminalService();
