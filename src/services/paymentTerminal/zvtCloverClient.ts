import { Buffer } from 'buffer';
import type {
  PaymentTerminalAuthorizeOptions,
  PaymentTerminalForward,
  PaymentTerminalIpConfig,
  PaymentTerminalResponse,
} from './types';
import { runZvt } from './zvtTcpRunner';
import {
  CLOVER_BUSY_HEX,
  encodeAmount6Bcd,
  encodePasswordBcd3,
  hasFinalMarker,
  isIntermediate061e,
  looksBusy,
  parseTerminalUi,
  sleep,
  terminalMessage,
} from './zvtUtils';

const POST_TX_COOLDOWN_MS = 5000;
const POST_ABORT_RETRY_DELAY_MS = 5000;
const DEFAULT_READY_MAX_WAIT_MS = 20000;
let nextAllowedAt = 0;

const ensureCooldown = () => {
  const remainingMs = nextAllowedAt - Date.now();
  if (remainingMs > 0) {
    const error: any = new Error(`Terminal cooldown active (${remainingMs}ms remaining)`);
    error.code = 'COOLDOWN';
    throw error;
  }
};

const setCooldown = (ms = POST_TX_COOLDOWN_MS) => {
  nextAllowedAt = Date.now() + Math.max(0, ms);
};

const clearCooldown = () => {
  nextAllowedAt = 0;
};

const buildRegisterPayload = (password?: string) =>
  Buffer.concat([
    Buffer.from([0x06, 0x00, 0x08]),
    encodePasswordBcd3(password),
    Buffer.from([0x48, 0x09, 0x78, 0x03, 0x01]),
  ]);

const buildAuthorizePayload = (amountCents: number) =>
  Buffer.concat([Buffer.from([0x06, 0x01, 0x07, 0x04]), encodeAmount6Bcd(amountCents)]);

const buildStatusPayload = () => Buffer.from([0x05, 0x01]);
const buildStatusPayloadAlt = () => Buffer.from([0x06, 0xd1]);
const buildAbortPayload = () => Buffer.from([0x06, 0xb0, 0x00]);
const buildCancelPayload = () => Buffer.from([0x06, 0x01, 0x01, 0x0b]);

const mapStatusProbe = (result: any) => {
  const ui = parseTerminalUi(result?.hex || '');
  return {
    ok: true,
    ...result,
    finalMarker: hasFinalMarker(result?.hex || ''),
    busy: looksBusy(result?.hex || '') || String(result?.hex || '').includes(CLOVER_BUSY_HEX),
    inProgress: ui.inProgress,
    declined: ui.declined || isIntermediate061e(result?.hex || ''),
    aborted: ui.aborted,
    approved: ui.approved,
    terminalMessage: terminalMessage(ui),
  };
};

const probeOnce = async (
  ip: PaymentTerminalIpConfig,
  forward?: PaymentTerminalForward,
  opts: PaymentTerminalAuthorizeOptions = {},
) => {
  const payloads =
    opts.useDualStatusProbe === false
      ? [buildStatusPayload()]
      : [buildStatusPayload(), buildStatusPayloadAlt()];
  let lastError: any = null;

  for (const payload of payloads) {
    try {
      const result = await runZvt({
        ip,
        payload,
        name: 'CLOVER_STATUS',
        timeoutMs: Number(opts.statusTimeoutMs ?? 7000),
        forward,
        expectFinal: false,
      });
      return mapStatusProbe(result);
    } catch (error: any) {
      lastError = error;
      const code = String(error?.code || '').toUpperCase();
      if (code !== 'NO_RESPONSE' && code !== 'ZVT_TIMEOUT') {
        throw error;
      }
    }
  }

  throw lastError || new Error('Clover status probe failed');
};

const waitUntilReady = async (
  ip: PaymentTerminalIpConfig,
  forward?: PaymentTerminalForward,
  opts: PaymentTerminalAuthorizeOptions = {},
) => {
  const maxWaitMs = Number((opts as any).readyMaxWaitMs ?? DEFAULT_READY_MAX_WAIT_MS);
  const intervalMs = Number((opts as any).readyIntervalMs ?? 1000);
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    try {
      const status = await probeOnce(ip, forward, {
        ...opts,
        statusTimeoutMs: Number((opts as any).readyStatusTimeoutMs ?? 1500),
      });
      if (!status.busy && !status.inProgress) return;
    } catch {}
    await sleep(intervalMs);
  }

  const error: any = new Error(`Clover terminal not ready within ${maxWaitMs}ms`);
  error.code = 'TERMINAL_NOT_READY';
  throw error;
};

export const zvtCloverRegister = (
  ip: PaymentTerminalIpConfig,
  forward?: PaymentTerminalForward,
  opts: PaymentTerminalAuthorizeOptions = {},
) =>
  runZvt({
    ip,
    payload: buildRegisterPayload(String(opts?.['password' as keyof typeof opts] ?? ip.password ?? '000000')),
    name: 'CLOVER_REGISTER',
    timeoutMs: Number(opts.timeoutMs ?? 15000),
    forward,
    expectFinal: false,
  });

export const zvtCloverAuthorize = async (
  ip: PaymentTerminalIpConfig,
  amountCents: number,
  opts: PaymentTerminalAuthorizeOptions = {},
  forward?: PaymentTerminalForward,
): Promise<PaymentTerminalResponse> => {
  ensureCooldown();
  let nextCooldownMs = POST_TX_COOLDOWN_MS;

  try {
    await waitUntilReady(ip, forward, opts);
    const register = await zvtCloverRegister(ip, forward, opts);
    await sleep(Number(opts.gapMs ?? 600));
    const auth = await runZvt({
      ip,
      payload: buildAuthorizePayload(amountCents),
      name: 'CLOVER_AUTH',
      timeoutMs: Number(opts.timeoutMs ?? 60000),
      forward,
      expectFinal: true,
      allowCloseAfterAuthAccepted: opts.allowCloseAfterAuthAccepted !== false,
    });

    const ui = parseTerminalUi(auth.hex);
    const authMessage = terminalMessage(ui);
    const declined = ui.declined || isIntermediate061e(auth.hex);
    const aborted = ui.aborted;

    if (aborted) {
      nextCooldownMs = POST_ABORT_RETRY_DELAY_MS;
      return {
        ok: false,
        outcome: 'failed',
        confirmed: true,
        paymentState: 'cancelled',
        status: 'CLOVER_AUTH_ABORTED_TERMINAL_MESSAGE',
        userMessage: 'Payment cancelled',
        register,
        auth,
        terminalEvidence: {
          registerHex: register.hex,
          authHex: auth.hex,
          terminalMessage: authMessage,
          sawFinalMarker: hasFinalMarker(auth.hex),
        },
      };
    }

    if (declined) {
      clearCooldown();
      return {
        ok: false,
        outcome: 'failed',
        confirmed: true,
        paymentState: 'failed',
        status: 'CLOVER_AUTH_DECLINED_TERMINAL_MESSAGE',
        userMessage: 'Payment not possible',
        register,
        auth,
        terminalEvidence: {
          registerHex: register.hex,
          authHex: auth.hex,
          terminalMessage: authMessage,
          sawFinalMarker: hasFinalMarker(auth.hex),
        },
      };
    }

    if (auth.note.includes('no-final')) {
      const once = await probeOnce(ip, forward, opts).catch(() => null);
      return {
        ok: false,
        outcome: once?.declined || once?.aborted ? 'failed' : 'pending',
        confirmed: false,
        paymentState: once?.declined || once?.aborted ? 'failed' : 'pending',
        status: once?.declined
          ? 'CLOVER_AUTH_DECLINED_TERMINAL_MESSAGE'
          : once?.aborted
            ? 'CLOVER_AUTH_ABORTED_TERMINAL_MESSAGE'
            : 'CLOVER_AUTH_ACCEPTED_NO_FINAL',
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
      status: 'CLOVER_FINAL_RECEIVED',
      userMessage: 'Payment approved',
      register,
      auth,
      terminalEvidence: {
        registerHex: register.hex,
        authHex: auth.hex,
        terminalMessage: authMessage || 'payment approved',
        sawFinalMarker: hasFinalMarker(auth.hex),
      },
    };
  } finally {
    setCooldown(nextCooldownMs);
  }
};

export const zvtCloverReconcileLast = async (
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
          await zvtCloverRegister(ip, forward, opts);
        }
        const status = await probeOnce(ip, forward, opts);
        polls.push({ attempt: index + 1, ...status });
        if (status.finalMarker || status.approved) {
          return {
            ok: true,
            outcome: 'success',
            confirmed: true,
            definitive: true,
            status: 'CLOVER_RECON_APPROVED',
            terminalEvidence: { statusPolls: polls },
          };
        }
        if (status.declined || status.aborted) {
          return {
            ok: false,
            outcome: 'failed',
            confirmed: true,
            definitive: true,
            status: status.aborted ? 'CLOVER_RECON_ABORTED' : 'CLOVER_RECON_DECLINED',
            terminalEvidence: {
              terminalMessage: status.terminalMessage || 'payment not possible',
              statusPolls: polls,
            },
          };
        }
        if (status.inProgress) sawInProgress = true;
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
      status: sawInProgress ? 'CLOVER_RECON_BUSY_OR_PROCESSING' : 'CLOVER_RECON_NO_FINAL',
      terminalEvidence: { statusPolls: polls },
    };
  } finally {
    if (!opts.skipCooldown) setCooldown();
  }
};

export const zvtCloverCancel = async (
  ip: PaymentTerminalIpConfig,
  forward?: PaymentTerminalForward,
  opts: PaymentTerminalAuthorizeOptions = {},
) => {
  const attempts = [buildAbortPayload(), buildCancelPayload()];
  let lastError: any = null;

  for (const payload of attempts) {
    try {
      return await runZvt({
        ip,
        payload,
        name: 'CLOVER_CANCEL',
        timeoutMs: Number(opts.timeoutMs ?? 8000),
        forward,
        expectFinal: false,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Clover cancel failed');
};
