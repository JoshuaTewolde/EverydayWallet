import { describe, expect, it } from 'vitest';
import {
  buildTransferUrl,
  encodeTapPayload,
  formatSol,
  isPublicKey,
  parseSol,
  parseTapPayload,
  parseTransferUrl,
  usdToLamports,
} from '../src/index.js';

const A = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const REF = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

describe('amounts', () => {
  it('parses SOL exactly', () => {
    expect(parseSol('1')).toBe(1_000_000_000n);
    expect(parseSol('0.5')).toBe(500_000_000n);
    expect(parseSol('0.000000001')).toBe(1n);
    expect(parseSol(' 2.25 ')).toBe(2_250_000_000n);
  });
  it('rejects bad amounts', () => {
    for (const s of ['', '-1', '1e3', '0x10', '1.', '.5', '1.0000000001', 'NaN', '1,5', '9999999'])
      expect(parseSol(s)).toBeNull();
  });
  it('formats lamports', () => {
    expect(formatSol(1_500_000_000n)).toBe('1.5');
    expect(formatSol(1n)).toBe('0.000000001');
    expect(formatSol(0n)).toBe('0');
    expect(parseSol(formatSol(123_456_789_012n))).toBe(123_456_789_012n);
  });
  it('converts usd to lamports', () => {
    expect(usdToLamports(10, 200)).toBe(50_000_000n);
    expect(usdToLamports(0, 200)).toBeNull();
    expect(usdToLamports(10, 0)).toBeNull();
    expect(usdToLamports(Number.NaN, 200)).toBeNull();
  });
});

describe('solana pay urls', () => {
  it('validates public keys', () => {
    expect(isPublicKey(A)).toBe(true);
    expect(isPublicKey('0OIl' + A.slice(4))).toBe(false);
    expect(isPublicKey('abc')).toBe(false);
    expect(isPublicKey(123)).toBe(false);
  });
  it('round-trips', () => {
    const url = buildTransferUrl({
      recipient: A,
      amount: 250_000_000n,
      reference: [REF],
      label: 'Sam & Co',
      message: 'Pizza night',
    });
    expect(url).toBe(
      `solana:${A}?amount=0.25&reference=${REF}&label=Sam%20%26%20Co&message=Pizza%20night`,
    );
    expect(parseTransferUrl(url)).toEqual({
      recipient: A,
      amount: 250_000_000n,
      reference: [REF],
      label: 'Sam & Co',
      message: 'Pizza night',
    });
  });
  it('allows no amount', () => {
    expect(parseTransferUrl(`solana:${A}`)).toEqual({ recipient: A });
  });
  it('rejects malicious input', () => {
    const bad = [
      `bitcoin:${A}`,
      `solana:https://evil.example/tx`,
      `solana:${A}x`,
      `solana:${A}?amount=-1`,
      `solana:${A}?amount=1e9`,
      `solana:${A}?amount=1&amount=2`,
      `solana:${A}?amount=0`,
      `solana:${A}?reference=notakey`,
      `solana:${A}?spl-token=${REF}`,
      `solana:${A}?label=${'x'.repeat(500)}`,
      `solana:%E0%A4%A`,
      'solana:' + 'A'.repeat(2000),
    ];
    for (const u of bad) expect(() => parseTransferUrl(u), u).toThrow();
  });
  it('strips control and bidi characters from text', () => {
    const r = parseTransferUrl(`solana:${A}?label=Al%0Aice%E2%80%AE`);
    expect(r.label).toBe('Alice');
  });
});

describe('tap payload', () => {
  const url = buildTransferUrl({ recipient: A, amount: 1n, reference: [REF], label: 'Al' });
  it('round-trips', () => {
    const raw = encodeTapPayload({ v: 1, rail: 'solana', label: 'Al', url });
    const p = parseTapPayload(raw);
    expect(p.ok && p.request.recipient).toBe(A);
    expect(p.ok && p.request.amount).toBe(1n);
  });
  it('accepts a bare solana url (QR from other wallets)', () => {
    expect(parseTapPayload(url).ok).toBe(true);
  });
  it('reports unknown rails as unsupported', () => {
    const p = parseTapPayload(JSON.stringify({ v: 1, rail: 'bitcoin', label: 'x', url: 'lnbc1' }));
    expect(p).toEqual({ ok: false, error: expect.stringContaining('bitcoin') });
  });
  it('rejects junk', () => {
    for (const raw of [
      '',
      'hello',
      '{}',
      JSON.stringify({ v: 2, rail: 'solana', label: '', url }),
      JSON.stringify({ v: 1, rail: 'solana', label: '', url, extra: 1 }),
      JSON.stringify({ v: 1, rail: 'solana', label: '', url: 'solana:bad' }),
      'x'.repeat(5000),
      null,
    ])
      expect(parseTapPayload(raw).ok).toBe(false);
  });
});
