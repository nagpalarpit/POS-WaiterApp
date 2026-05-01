import { ZvtClient } from "@nagpal_a_hsl/zvt-client";
import type { Settings } from "../hooks/useSettings";

export type PaymentTerminalType = "clover" | "verifone";
export type PaymentTerminalDecision =
  | "approved"
  | "declined"
  | "aborted"
  | "pending"
  | "unknown";

export type PaymentTerminalConfig = {
  terminal: PaymentTerminalType;
  host: string;
  port: number;
  password?: string;
  orderNo?: string;
};

export type PaymentTerminalResult = {
  config: PaymentTerminalConfig;
  response: any;
  decision: PaymentTerminalDecision;
};

const normalizeTerminalType = (value: unknown): PaymentTerminalType | null => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "clover" || normalized === "verifone") {
    return normalized;
  }
  return null;
};

export const buildPaymentTerminalConfig = (
  settings: Settings | null | undefined,
  orderNo?: string | number | null,
): PaymentTerminalConfig | null => {
  const terminal = normalizeTerminalType(settings?.paymentTerminal);
  const host = String(settings?.paymentTerminalHost || "").trim();
  const port = Number(settings?.paymentTerminalPort);
  const passwordRaw = settings?.paymentTerminalPassword;
  const resolvedOrderNo = orderNo == null ? "" : String(orderNo).trim();

  if (!terminal || !host || !Number.isFinite(port) || port <= 0) {
    return null;
  }

  return {
    terminal,
    host,
    port,
    password:
      passwordRaw === undefined || passwordRaw === null || passwordRaw === ""
        ? undefined
        : String(passwordRaw).trim(),
    orderNo: resolvedOrderNo || undefined,
  };
};

const terminalOutcome = (response: any): string =>
  String(
    response?.paymentState ||
      response?.outcome ||
      response?.decision ||
      response?.status ||
      "",
  ).toLowerCase();

export const getPaymentTerminalDecision = (
  response: any,
): PaymentTerminalDecision => {
  const outcome = terminalOutcome(response);
  const polls = [
    ...(response?.completion?.polls || []),
    ...(response?.terminalEvidence?.statusPolls || []),
  ];
  const pollMessages = polls
    .map((poll: any) => String(poll?.terminalMessage || "").toLowerCase())
    .filter(Boolean);
  const hasPollAborted = polls.some((poll: any) => poll?.aborted === true);
  const hasPollDeclined = polls.some((poll: any) => poll?.declined === true);
  const hasPollApproved = polls.some((poll: any) => poll?.approved === true);
  const signals = [
    outcome,
    String(response?.outcome || "").toLowerCase(),
    String(response?.decision || "").toLowerCase(),
    String(response?.status || "").toLowerCase(),
    String(response?.userMessage || "").toLowerCase(),
    String(response?.terminalEvidence?.terminalMessage || "").toLowerCase(),
    String(response?.completion?.terminalMessage || "").toLowerCase(),
    ...pollMessages,
  ].filter(Boolean);

  if (response?.completion?.terminalAborted === true || hasPollAborted) {
    return "aborted";
  }
  if (response?.completion?.terminalDeclined === true || hasPollDeclined) {
    return "declined";
  }

  if (
    signals.some((signal) =>
      [
        "aborted",
        "cancelled",
        "canceled",
        "cancel",
        "abgebrochen",
        "abbruch",
        "storniert",
        "storno",
      ].some((keyword) => signal.includes(keyword)),
    )
  ) {
    return "aborted";
  }

  if (
    signals.some((signal) =>
      ["declined", "failed", "error", "denied", "rejected"].some((keyword) =>
        signal.includes(keyword),
      ),
    )
  ) {
    return "declined";
  }

  const statusSignal = String(response?.status || "").toLowerCase();
  const isInferredNoFinalSuccess =
    statusSignal.includes("inferred_success") ||
    statusSignal.includes("no_final");
  if (
    response?.ok === true &&
    response?.confirmed === false &&
    response?.completion?.terminalApproved !== true &&
    !hasPollApproved &&
    isInferredNoFinalSuccess
  ) {
    return "pending";
  }

  if (
    !signals.length &&
    response?.ok === true &&
    (response?.confirmed === true ||
      response?.completion?.terminalApproved === true ||
      hasPollApproved)
  ) {
    return "approved";
  }
  if (response?.confirmed === true && response?.ok === true) return "approved";
  if (response?.completion?.terminalApproved === true) return "approved";
  if (hasPollApproved) return "approved";

  if (
    signals.some((signal) =>
      ["approved", "clover_final_received", "payment approved"].includes(
        signal,
      ),
    )
  ) {
    return "approved";
  }
  if (signals.some((signal) => signal === "pending")) return "pending";
  return "unknown";
};

const getTerminalErrorPayload = (error: any): any => {
  if (!error) return null;
  const payload =
    error?.response || error?.result || error?.data || error?.payload;
  if (payload !== undefined && payload !== null) return payload;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: (error as any)?.code || "",
    };
  }
  return error;
};

export const authorizeTerminalPayment = async (
  settings: Settings | null | undefined,
  amountCents: number,
  orderNo?: string | number | null,
): Promise<PaymentTerminalResult> => {
  const config = buildPaymentTerminalConfig(settings, orderNo);
  if (!config) {
    throw new Error("PAYMENT_TERMINAL_NOT_CONFIGURED");
  }

  const client = new ZvtClient(config);
  try {
    let response: any = await client.authorize(amountCents, {
      useAuthSessionListener: true,
      quickProbeAfterAuth: true,
      useDualStatusProbe: true,
    });

    if (getPaymentTerminalDecision(response) === "pending") {
      response = await client.reconcileLast({
        attempts: 4,
        intervalMs: 1000,
        statusTimeoutMs: 7000,
        skipCooldown: true,
        registerBeforeStatus: true,
        useDualStatusProbe: true,
      });
    }

    return {
      config,
      response,
      decision: getPaymentTerminalDecision(response),
    };
  } catch (error) {
    const errorPayload = getTerminalErrorPayload(error);
    const errorDecision = getPaymentTerminalDecision(errorPayload);
    const errorText = String(
      errorPayload?.message ||
        (error instanceof Error ? error.message : "") ||
        "",
    ).toLowerCase();
    const hasStructuredTerminalPayload =
      !!errorPayload &&
      typeof errorPayload === "object" &&
      [
        "ok",
        "outcome",
        "status",
        "confirmed",
        "completion",
        "terminalEvidence",
      ].some((key) => Object.prototype.hasOwnProperty.call(errorPayload, key));
    const looksLikeUserCancel = [
      "abgebrochen",
      "aborted",
      "cancelled",
      "canceled",
      "cancel",
    ].some((keyword) => errorText.includes(keyword));

    if (["approved", "declined", "aborted"].includes(errorDecision)) {
      return {
        config,
        response: errorPayload,
        decision: errorDecision,
      };
    }

    if (!hasStructuredTerminalPayload) {
      if (looksLikeUserCancel) {
        const cancelledPayload = {
          ok: false,
          outcome: "aborted",
          confirmed: false,
          status: "AUTHORIZE_CANCELLED_NO_PAYLOAD",
          userMessage: "Payment cancelled",
        };
        return {
          config,
          response: cancelledPayload,
          decision: "aborted",
        };
      }

      const errorMessage =
        errorPayload?.message ||
        (error instanceof Error ? error.message : "") ||
        "Terminal payment failed";
      throw new Error(String(errorMessage));
    }

    try {
      const reconciledResponse: any = await client.reconcileLast({
        attempts: 4,
        intervalMs: 1000,
        statusTimeoutMs: 7000,
        skipCooldown: true,
        registerBeforeStatus: true,
        useDualStatusProbe: true,
      });
      const reconciledDecision = getPaymentTerminalDecision(reconciledResponse);
      if (["approved", "declined", "aborted"].includes(reconciledDecision)) {
        return {
          config,
          response: reconciledResponse,
          decision: reconciledDecision,
        };
      }
    } catch (_reconcileError) {
      // Preserve the original error below when follow-up reconciliation
      // does not produce a definitive terminal outcome.
    }

    const errorMessage =
      errorPayload?.message ||
      (error instanceof Error ? error.message : "") ||
      "Terminal payment failed";
    throw new Error(String(errorMessage));
  }
};
