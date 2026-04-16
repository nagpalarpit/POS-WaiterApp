import { Buffer } from 'buffer';
import type {
  PaymentTerminalAuthorizeOptions,
  PaymentTerminalForward,
  PaymentTerminalIpConfig,
  PaymentTerminalResponse,
} from './types';
import { runZvt } from './zvtTcpRunner';
import {
  encodeAmount6Bcd,
  encodePasswordBcd3,
  hasFinalMarker,
  isIntermediate061e,
  looksBusy,
  normalizeReference,
  parseTerminalUi,
  sleep,
  terminalMessage,
} from './zvtUtils';

const POST_TX_COOLDOWN_MS = 7000;
let nextAllowedAt = 0;

const ensureCooldown = () => {
  const remainingMs = nextAllowedAt - Date.now();
  if (remainingMs > 0) {
    const error: any = new Error(`Terminal cooldown active (${remainingMs}ms remaining)`);
    error.code = 'COOLDOWN';
    throw error;
  }
};

const setCooldown = () => {
  nextAllowedAt = Date.now() + POST_TX_COOLDOWN_MS;
};

const buildRegisterPayload = (password?: string) =>
  Buffer.concat([
    Buffer.from([0x06, 0x00, 0x08]),
    encodePasswordBcd3(password),
    Buffer.from([0x48, 0x09, 0x78, 0x03, 0x01]),
  ]);

const buildStatusPayloads = (useDualStatusProbe?: boolean) => {
  const payloads = [Buffer.from([0x05, 0x01]), Buffer.from([0x06, 0x01, 0x05, 0x01])];
  return useDualStatusProbe === false ? payloads : [...payloads, Buffer.from([0x06, 0xd1])];
};

const buildAuthorizePayload = (
  amountCents: number,
  reference?: string | number,
  opts: PaymentTerminalAuthorizeOptions = {},
) => {
  const amount = encodeAmount6Bcd(amountCents);
  if (opts.useStandardAuthorizePayload === true) {
    return Buffer.concat([Buffer.from([0x06, 0x01, 0x04]), amount]);
  }

  const currencyField = Buffer.from([0x49, 0x02, 0x09, 0x78]);
  const ref = Buffer.from(normalizeReference(reference), 'ascii');
  const refField = Buffer.concat([Buffer.from([0x0b, ref.length]), ref]);
  return Buffer.concat([Buffer.from([0x06, 0x01, 0x07, 0x04]), amount, currencyField, refField]);
};

const buildCancelPayload = () => Buffer.from([0x06, 0x01, 0x06, 0x0b]);

export const zvtVerifoneRegister = (
  ip: PaymentTerminalIpConfig,
  forward?: PaymentTerminalForward,
  opts: PaymentTerminalAuthorizeOptions = {},
) =>
  runZvt({
    ip,
    payload: buildRegisterPayload(ip.password || '000000'),
    name: 'VERIFONE_REGISTER',
    timeoutMs: Number(opts.timeoutMs ?? 15000),
    forward,
    expectFinal: false,
    allowAckOnly: true,
  });

const probeStatus = async (
  ip: PaymentTerminalIpConfig,
  forward?: PaymentTerminalForward,
  opts: PaymentTerminalAuthorizeOptions = {},
) => {
  const payloads = buildStatusPayloads(opts.useDualStatusProbe);
  let lastError: any = null;

  for (const payload of payloads) {
    try {
      const status = await runZvt({
        ip,
        payload,
        name: 'VERIFONE_STATUS',
        timeoutMs: Number(opts.statusTimeoutMs ?? 7000),
        forward,
        expectFinal: false,
        allowAckOnly: true,
      });
      const ui = parseTerminalUi(status.hex);
      return {
        ...status,
        busy: looksBusy(status.hex),
        finalMarker: hasFinalMarker(status.hex),
        intermediate061e: isIntermediate061e(status.hex),
        inProgress: ui.inProgress,
        declined: ui.declined || isIntermediate061e(status.hex),
        aborted: ui.aborted,
        approved: ui.approved,
        terminalMessage: terminalMessage(ui),
      };
    } catch (error: any) {
      lastError = error;
      const code = String(error?.code || '').toUpperCase();
      if (code !== 'NO_RESPONSE' && code !== 'ZVT_TIMEOUT') {
        throw error;
      }
    }
  }

  throw lastError || new Error('Verifone status probe failed');
};

export const zvtVerifoneAuthorize = async (
  ip: PaymentTerminalIpConfig,
  amountCents: number,
  opts: PaymentTerminalAuthorizeOptions = {},
  forward?: PaymentTerminalForward,
): Promise<PaymentTerminalResponse> => {
  ensureCooldown();
  try {
    const register = await zvtVerifoneRegister(ip, forward, opts);
    await sleep(Number(opts.gapMs ?? 600));

    const auth = await runZvt({
      ip,
      payload: buildAuthorizePayload(amountCents, opts.reference ?? ip.orderNo, opts),
      name: 'VERIFONE_AUTH',
      timeoutMs: Number(opts.timeoutMs ?? 60000),
      forward,
      expectFinal: true,
      allowAckOnly: true,
      treatAuthAcceptedAsIntermediate: true,
      allowCloseAfterAuthAccepted: opts.allowCloseAfterAuthAccepted !== false,
    });

    const ui = parseTerminalUi(auth.hex);
    const message = terminalMessage(ui);
    const declined = ui.declined || isIntermediate061e(auth.hex);
    const aborted = ui.aborted;

    if (aborted || declined) {
      return {
        ok: false,
        outcome: 'failed',
        confirmed: true,
        paymentState: aborted ? 'cancelled' : 'failed',
        status: aborted
          ? 'VERIFONE_AUTH_ABORTED_TERMINAL_MESSAGE'
          : 'VERIFONE_AUTH_DECLINED_TERMINAL_MESSAGE',
        userMessage: aborted ? 'Payment cancelled' : 'Payment not possible',
        register,
        auth,
        terminalEvidence: {
          registerHex: register.hex,
          authHex: auth.hex,
          terminalMessage: message,
          sawFinalMarker: hasFinalMarker(auth.hex),
        },
      };
    }

    if (auth.note.includes('no-final')) {
      const once = opts.quickProbeAfterAuth === false ? null : await probeStatus(ip, forward, opts).catch(() => null);
      return {
        ok: false,
        outcome: once?.declined || once?.aborted ? 'failed' : 'pending',
        confirmed: false,
        paymentState: once?.declined || once?.aborted ? 'failed' : 'pending',
        status: once?.declined
          ? 'VERIFONE_AUTH_DECLINED_TERMINAL_MESSAGE'
          : once?.aborted
            ? 'VERIFONE_AUTH_ABORTED_TERMINAL_MESSAGE'
            : 'VERIFONE_AUTH_ACCEPTED_NO_FINAL',
        userMessage:
          once?.declined || once?.aborted
            ? once.terminalMessage || 'Payment not possible'
            : 'Awaiting terminal completion',
        register,
        auth,
        completion: once ? { ok: false, settled: false, quickProbe: true, polls: [once] } : null,
        terminalEvidence: {
          registerHex: register.hex,
          authHex: auth.hex,
          statusPolls: once ? [once] : [],
        },
      };
    }

    return {
      ok: true,
      outcome: 'success',
      confirmed: true,
      paymentState: 'accepted',
      status: 'VERIFONE_FINAL_RECEIVED',
      userMessage: 'Payment approved',
      register,
      auth,
      terminalEvidence: {
        registerHex: register.hex,
        authHex: auth.hex,
        terminalMessage: message || 'payment approved',
        sawFinalMarker: hasFinalMarker(auth.hex),
      },
    };
  } finally {
    setCooldown();
  }
};

export const zvtVerifoneReconcileLast = async (
  ip: PaymentTerminalIpConfig,
  opts: PaymentTerminalAuthorizeOptions = {},
  forward?: PaymentTerminalForward,
): Promise<PaymentTerminalResponse> => {
  if (!opts.skipCooldown) ensureCooldown();
  try {
    const attempts = Number(opts.attempts ?? 4);
    const intervalMs = Number(opts.intervalMs ?? 1000);
    const polls: any[] = [];
    let sawInProgress = false;

    for (let index = 0; index < attempts; index += 1) {
      if (index > 0) await sleep(intervalMs);
      try {
        if (opts.registerBeforeStatus !== false) {
          await zvtVerifoneRegister(ip, forward, opts);
        }
        const status = await probeStatus(ip, forward, opts);
        polls.push({ attempt: index + 1, ...status });

        if (status.finalMarker || status.approved) {
          return {
            ok: true,
            outcome: 'success',
            confirmed: true,
            definitive: true,
            status: 'VERIFONE_RECON_APPROVED',
            terminalEvidence: { statusPolls: polls },
          };
        }
        if (status.declined || status.aborted) {
          return {
            ok: false,
            outcome: 'failed',
            confirmed: true,
            definitive: true,
            status: status.aborted ? 'VERIFONE_RECON_ABORTED' : 'VERIFONE_RECON_DECLINED',
            terminalEvidence: {
              terminalMessage: status.terminalMessage || 'payment not possible',
              statusPolls: polls,
            },
          };
        }
        if (status.inProgress || status.busy) sawInProgress = true;
      } catch (error: any) {
        polls.push({
          attempt: index + 1,
          ok: false,
          code: error?.code || '',
          message: error?.message || String(error),
        });
      }
    }

    return {
      ok: false,
      outcome: sawInProgress ? 'pending' : 'unknown',
      confirmed: false,
      definitive: false,
      status: sawInProgress ? 'VERIFONE_RECON_BUSY_OR_PROCESSING' : 'VERIFONE_RECON_NO_FINAL',
      terminalEvidence: { statusPolls: polls },
    };
  } finally {
    if (!opts.skipCooldown) setCooldown();
  }
};

export const zvtVerifoneCancel = (
  ip: PaymentTerminalIpConfig,
  forward?: PaymentTerminalForward,
  opts: PaymentTerminalAuthorizeOptions = {},
) =>
  runZvt({
    ip,
    payload: buildCancelPayload(),
    name: 'VERIFONE_CANCEL',
    timeoutMs: Number(opts.timeoutMs ?? 8000),
    forward,
    expectFinal: false,
    allowAckOnly: true,
  });
