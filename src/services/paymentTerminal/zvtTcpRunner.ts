import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';
import type {
  PaymentTerminalForward,
  PaymentTerminalIpConfig,
  ZvtRunResult,
} from './types';
import {
  ACK,
  AUTH_ACCEPTED_MARKER,
  hasAuthAccepted,
  hasFinalMarker,
  isPureAckHex,
  nowIso,
  toHex,
} from './zvtUtils';

type RunZvtParams = {
  ip: PaymentTerminalIpConfig;
  payload: Buffer;
  name: string;
  timeoutMs?: number;
  forward?: PaymentTerminalForward;
  expectFinal?: boolean;
  allowAckOnly?: boolean;
  treatAuthAcceptedAsIntermediate?: boolean;
  allowCloseAfterAuthAccepted?: boolean;
};

const log = (
  forward: PaymentTerminalForward | undefined,
  kind: string,
  name: string,
  fields: Record<string, any> = {},
) => {
  forward?.({ kind, name, atIso: nowIso(), ...fields });
};

const createSocketError = (message: string, code: string, details?: Record<string, any>) => {
  const error: any = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
};

export const runZvt = async ({
  ip,
  payload,
  name,
  timeoutMs = 45000,
  forward,
  expectFinal = true,
  allowAckOnly = false,
  treatAuthAcceptedAsIntermediate = false,
  allowCloseAfterAuthAccepted = false,
}: RunZvtParams): Promise<ZvtRunResult> =>
  new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let aggregate = Buffer.alloc(0);
    let aggregateHex = '';
    let resolved = false;
    let sawAnyData = false;
    let sawNonAck = false;
    let sawAuthAccepted = false;
    let lastDataHex = '';

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      try {
        socket.removeAllListeners();
      } catch {}
      try {
        socket.destroy();
      } catch {}
    };

    const finishOk = (note: string) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve({
        ok: true,
        name,
        receivedAt: nowIso(),
        hex: aggregateHex,
        bytes: aggregate.length,
        note,
        sawAnyData,
        sawNonAck,
        sawAuthAccepted,
      });
    };

    const finishErr = (error: any) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(error);
    };

    const canTreatEarlyCloseAsPending = () =>
      expectFinal &&
      allowCloseAfterAuthAccepted &&
      (sawAuthAccepted || hasAuthAccepted(aggregateHex));

    const finishClosedEarly = (eventName: string) => {
      if (hasFinalMarker(aggregateHex)) {
        finishOk(`final-marker-before-${eventName}`);
        return;
      }
      if (canTreatEarlyCloseAsPending()) {
        finishOk(`socket-${eventName}-after-auth-accepted-no-final`);
        return;
      }
      finishErr(
        createSocketError(`Socket ${eventName} before final 060F/040F`, 'TERMINAL_ABORT', {
          sawAuthAccepted,
          lastDataHex,
        }),
      );
    };

    const handleConnect = () => {
      log(forward, 'REQ', name, {
        host: ip.host,
        port: ip.port,
        hex: toHex(payload),
      });
      try {
        socket.write(payload);
      } catch (error: any) {
        finishErr(createSocketError(`write failed: ${error?.message || error}`, 'WRITE_FAIL'));
      }
    };

    const socket = TcpSocket.createConnection(
      {
        host: ip.host,
        port: Number(ip.port),
        connectTimeout: timeoutMs,
        interface: 'wifi',
      },
      handleConnect,
    );

    timer = setTimeout(() => {
      finishErr(createSocketError(`ZVT timeout (${timeoutMs}ms)`, 'ZVT_TIMEOUT'));
    }, timeoutMs);

    socket.setNoDelay(true);

    socket.on('data', (data: Buffer | string) => {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'binary');
      const hex = toHex(buffer);
      const isAck = isPureAckHex(hex);

      sawAnyData = true;
      lastDataHex = hex;
      aggregate = Buffer.concat([aggregate, buffer]);
      aggregateHex += hex;

      log(forward, 'RES', name, { hex, isAck });

      if (!isAck) {
        sawNonAck = true;
        try {
          socket.write(ACK);
        } catch {}
      }

      if (treatAuthAcceptedAsIntermediate && hex.includes(AUTH_ACCEPTED_MARKER)) {
        sawAuthAccepted = true;
      }

      if (!expectFinal && (sawNonAck || (allowAckOnly && sawAnyData))) {
        finishOk(sawNonAck ? 'non-ack-response' : 'ack-only-response');
        return;
      }

      if (expectFinal && hasFinalMarker(aggregateHex)) {
        finishOk('final-marker');
      }
    });

    socket.on('error', (error: any) => {
      const code = String(error?.code || '').toUpperCase();
      if (code === 'ECONNRESET' && canTreatEarlyCloseAsPending()) {
        finishOk('socket-reset-after-auth-accepted-no-final');
        return;
      }
      error.code = error.code || 'SOCKET_ERROR';
      finishErr(error);
    });

    socket.on('timeout', () => {
      finishErr(createSocketError(`ZVT timeout (${timeoutMs}ms)`, 'ZVT_TIMEOUT'));
    });

    socket.on('end', () => {
      if (resolved) return;
      if (expectFinal) {
        finishClosedEarly('ended');
        return;
      }
      if (sawNonAck || (allowAckOnly && sawAnyData)) {
        finishOk(sawNonAck ? 'socket-ended-with-non-ack' : 'ack-only-response');
        return;
      }
      finishErr(createSocketError('Socket ended without terminal response', 'NO_RESPONSE'));
    });

    socket.on('close', () => {
      if (resolved) return;
      if (expectFinal) {
        finishClosedEarly('closed');
        return;
      }
      if (sawNonAck || (allowAckOnly && sawAnyData)) {
        finishOk(sawNonAck ? 'socket-closed' : 'ack-only-response');
        return;
      }
      finishErr(createSocketError('Socket closed without terminal response', 'NO_RESPONSE'));
    });
  });
