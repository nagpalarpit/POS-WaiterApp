import type {
  PaymentTerminalAuthorizeOptions,
  PaymentTerminalDecision,
  PaymentTerminalForward,
  PaymentTerminalIpConfig,
  PaymentTerminalResponse,
} from './types';
import { zvtCloverAuthorize, zvtCloverReconcileLast } from './zvtCloverClient';
import { zvtVerifoneAuthorize, zvtVerifoneReconcileLast } from './zvtVerifoneClient';

const hasApprovalEvidence = (response: any): boolean => {
  if (!response || typeof response !== 'object') return false;
  if (response.confirmed === true) return true;
  if (response.completion?.terminalApproved === true) return true;
  const polls = [
    ...(Array.isArray(response.completion?.polls) ? response.completion.polls : []),
    ...(Array.isArray(response.terminalEvidence?.statusPolls)
      ? response.terminalEvidence.statusPolls
      : []),
  ];
  return polls.some((poll: any) => poll?.approved === true);
};

const shouldRetryVerifoneWithStandardPayload = (response: any): boolean => {
  if (!response || response?.terminal === 'clover') return false;
  if (hasApprovalEvidence(response)) return false;
  const signal = [
    response?.status,
    response?.outcome,
    response?.userMessage,
    response?.completion?.terminalMessage,
    response?.terminalEvidence?.terminalMessage,
    ...(Array.isArray(response?.completion?.polls)
      ? response.completion.polls.map((poll: any) => poll?.terminalMessage)
      : []),
    ...(Array.isArray(response?.terminalEvidence?.statusPolls)
      ? response.terminalEvidence.statusPolls.map((poll: any) => poll?.terminalMessage)
      : []),
  ]
    .map((value) => String(value || '').toLowerCase())
    .filter(Boolean)
    .join(' | ');

  return (
    signal.includes('abgebrochen') ||
    signal.includes('aborted') ||
    signal.includes('cancel') ||
    signal.includes('no_final') ||
    signal.includes('inferred_success')
  );
};

export const terminalDecision = (response: any): PaymentTerminalDecision => {
  const outcome = String(
    response?.paymentState || response?.outcome || response?.decision || response?.status || '',
  ).toLowerCase();
  const polls = [
    ...(Array.isArray(response?.completion?.polls) ? response.completion.polls : []),
    ...(Array.isArray(response?.terminalEvidence?.statusPolls)
      ? response.terminalEvidence.statusPolls
      : []),
  ];
  const messages = [
    outcome,
    String(response?.status || '').toLowerCase(),
    String(response?.userMessage || '').toLowerCase(),
    String(response?.terminalEvidence?.terminalMessage || '').toLowerCase(),
    ...polls.map((poll: any) => String(poll?.terminalMessage || '').toLowerCase()),
  ].filter(Boolean);

  if (response?.completion?.terminalAborted === true || polls.some((poll: any) => poll?.aborted)) {
    return 'aborted';
  }
  if (response?.completion?.terminalDeclined === true || polls.some((poll: any) => poll?.declined)) {
    return 'declined';
  }
  if (
    messages.some((message) =>
      ['aborted', 'cancelled', 'canceled', 'cancel', 'abgebrochen', 'storniert'].some((key) =>
        message.includes(key),
      ),
    )
  ) {
    return 'aborted';
  }
  if (
    messages.some((message) =>
      ['declined', 'failed', 'error', 'denied', 'rejected', 'not possible'].some((key) =>
        message.includes(key),
      ),
    )
  ) {
    return 'declined';
  }
  if (
    response?.ok === true &&
    (response?.confirmed === true ||
      response?.completion?.terminalApproved === true ||
      polls.some((poll: any) => poll?.approved))
  ) {
    return 'approved';
  }
  if (messages.some((message) => message.includes('approved') || message.includes('final_received'))) {
    return 'approved';
  }
  if (outcome.includes('pending') || response?.confirmed === false) return 'pending';
  return 'unknown';
};

export const authorizeTerminalPayment = async (
  ip: PaymentTerminalIpConfig,
  amountCents: number,
  opts: PaymentTerminalAuthorizeOptions = {},
  forward?: PaymentTerminalForward,
): Promise<PaymentTerminalResponse> => {
  if (ip.terminal === 'clover') {
    return zvtCloverAuthorize(ip, amountCents, opts, forward);
  }

  const baseOptions: PaymentTerminalAuthorizeOptions = {
    useAuthSessionListener: true,
    allowCloseAfterAuthAccepted: true,
    quickProbeAfterAuth: true,
    registerBeforeStatus: true,
    useDualStatusProbe: true,
    ...opts,
  };

  const useStandardExplicit = Object.prototype.hasOwnProperty.call(
    opts,
    'useStandardAuthorizePayload',
  );
  let response = await zvtVerifoneAuthorize(
    ip,
    amountCents,
    {
      ...baseOptions,
      useStandardAuthorizePayload: useStandardExplicit
        ? !!opts.useStandardAuthorizePayload
        : false,
    },
    forward,
  );

  if (!useStandardExplicit && shouldRetryVerifoneWithStandardPayload(response)) {
    const retryResponse = await zvtVerifoneAuthorize(
      ip,
      amountCents,
      {
        ...baseOptions,
        useStandardAuthorizePayload: true,
      },
      forward,
    ).catch(() => null);

    if (retryResponse && (hasApprovalEvidence(retryResponse) || !hasApprovalEvidence(response))) {
      response = retryResponse;
    }
  }

  return response;
};

export const reconcileTerminalPayment = (
  ip: PaymentTerminalIpConfig,
  opts: PaymentTerminalAuthorizeOptions = {},
  forward?: PaymentTerminalForward,
): Promise<PaymentTerminalResponse> => {
  if (ip.terminal === 'clover') {
    return zvtCloverReconcileLast(ip, opts, forward);
  }
  return zvtVerifoneReconcileLast(ip, opts, forward);
};
