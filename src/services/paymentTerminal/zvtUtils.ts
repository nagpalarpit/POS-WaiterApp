import { Buffer } from 'buffer';

const FINAL_MARKERS = ['040f', '060f'];
const BUSY_HEX = '848300';
const AUTH_ACCEPTED_HEX = '84a000';

export const ACK = Buffer.from([0x80, 0x00, 0x00]);
export const CLOVER_BUSY_HEX = BUSY_HEX;
export const AUTH_ACCEPTED_MARKER = AUTH_ACCEPTED_HEX;

export const nowIso = () => new Date().toISOString();

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

export const toHex = (value: Buffer | Uint8Array | string | null | undefined): string => {
  if (!value) return '';
  if (typeof value === 'string') {
    return Buffer.from(value, 'binary').toString('hex').toLowerCase();
  }
  return Buffer.from(value).toString('hex').toLowerCase();
};

export const hexToLatin1 = (hex: string): string => {
  try {
    return Buffer.from(String(hex || ''), 'hex').toString('latin1');
  } catch {
    return '';
  }
};

export const hasFinalMarker = (hex: string): boolean => {
  const normalized = String(hex || '').toLowerCase();
  return FINAL_MARKERS.some((marker) => normalized.includes(marker));
};

export const looksBusy = (hex: string): boolean =>
  String(hex || '').toLowerCase().includes(BUSY_HEX);

export const isPureAckHex = (hex: string): boolean =>
  String(hex || '').toLowerCase() === '800000';

export const hasAuthAccepted = (hex: string): boolean =>
  String(hex || '').toLowerCase().includes(AUTH_ACCEPTED_HEX);

export const isIntermediate061e = (hex: string): boolean =>
  String(hex || '').toLowerCase() === '061e019b';

export const encodeAmount6Bcd = (amountCents: number): Buffer => {
  const safeAmount = Math.max(0, Math.round(Number(amountCents || 0)));
  const value = String(safeAmount).padStart(12, '0').slice(-12);
  const bytes: number[] = [];
  for (let index = 0; index < 12; index += 2) {
    const high = value.charCodeAt(index) - 48;
    const low = value.charCodeAt(index + 1) - 48;
    bytes.push((high << 4) | low);
  }
  return Buffer.from(bytes);
};

export const encodePasswordBcd3 = (password?: string | number | null): Buffer => {
  const value = String(password ?? '000000').trim() || '000000';
  if (!/^\d{6}$/.test(value)) {
    const error: any = new Error('Invalid terminal password. Expected 6 digits.');
    error.code = 'BAD_TERMINAL_PASSWORD';
    throw error;
  }
  const bytes: number[] = [];
  for (let index = 0; index < 6; index += 2) {
    const high = value.charCodeAt(index) - 48;
    const low = value.charCodeAt(index + 1) - 48;
    bytes.push((high << 4) | low);
  }
  return Buffer.from(bytes);
};

export const normalizeReference = (reference?: string | number | null): string => {
  const value = String(reference ?? Date.now()).replace(/\D/g, '');
  return (value || String(Date.now())).slice(-12).padStart(12, '0');
};

export type TerminalUiMessage = {
  raw: string;
  compact: string;
  inProgress: boolean;
  declined: boolean;
  aborted: boolean;
  approved: boolean;
};

export const parseTerminalUi = (hex: string): TerminalUiMessage => {
  const raw = hexToLatin1(hex).toLowerCase();
  const compact = raw.replace(/[^a-z0-9]+/g, ' ').trim();

  const inProgress =
    raw.includes('process in progress') ||
    raw.includes('processing') ||
    raw.includes('please wait') ||
    raw.includes('present insert or swipe card') ||
    raw.includes('insert or swipe card') ||
    raw.includes('insert card') ||
    raw.includes('swipe card') ||
    raw.includes('present card') ||
    raw.includes('in progress') ||
    (compact.includes('process') && compact.includes('progress'));

  const declined =
    raw.includes('payment not possible') ||
    raw.includes('not possible') ||
    raw.includes('declined') ||
    raw.includes('not approved') ||
    compact.includes('payment not possible');

  const aborted =
    raw.includes('aborted') ||
    raw.includes('cancelled') ||
    raw.includes('canceled') ||
    raw.includes('abgebrochen') ||
    raw.includes('storniert');

  const approved =
    raw.includes('approved') ||
    raw.includes('zahlung erfolgt') ||
    raw.includes('authorisation successful');

  return { raw, compact, inProgress, declined, aborted, approved };
};

export const terminalMessage = (ui: TerminalUiMessage): string => {
  if (ui.aborted) return 'transaction aborted';
  if (ui.declined) return 'payment not possible';
  if (ui.approved) return 'payment approved';
  if (ui.inProgress) return 'payment in progress';
  return ui.compact || '';
};
