import { Buffer } from 'buffer';

const runtime = globalThis as any;

if (!runtime.Buffer) {
  runtime.Buffer = Buffer;
}
