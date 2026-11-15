import { describe, expect, it } from 'vitest';
import {
  encodeTapPayload,
  normalizeBtcRequest,
  parseSats,
  parseTapPayload,
  satsToBtc,
  satsToUsd,
  usdToSats,
} from '../src/index.js';

// Shape-valid samples (bech32 charset); Breez does the real checksum/network validation.
const SPARK = 'sparkrt1pgssyuuuhnrrdjswal5c3s3rafw9w3y5dd4cjy3duxlf7hjzkp0rqx6dj6mrhu';
const BOLT11 = 'lnbcrt10u1pnxyz0pp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq';

describe('sats', () => {
  it('parses whole sats', () => {
    expect(parseSats('1500')).toBe(1500);
    expect(parseSats('1,500')).toBe(1500);
    for (const s of ['', '0', '-1', '1.5', '1e3', '99999999999', 'abc'])
      expect(parseSats(s)).toBeNull();
  });
  it('converts', () => {
    expect(satsToBtc(12_345)).toBe('0.00012345');
    expect(satsToBtc(150_000_000)).toBe('1.50000000');
    expect(satsToUsd(100_000, 100_000)).toBe(100);
    expect(usdToSats(1, 100_000)).toBe(1000);
    expect(usdToSats(0, 100_000)).toBeNull();
    expect(usdToSats(1e9, 1)).toBeNull();
  });
});

describe('bitcoin rail', () => {
  it('normalizes spark and lightning requests', () => {
    expect(normalizeBtcRequest(SPARK)).toBe(SPARK);
    expect(normalizeBtcRequest(SPARK.toUpperCase())).toBe(SPARK);
    expect(normalizeBtcRequest(`lightning:${BOLT11}`)).toBe(BOLT11);
  });
  it('rejects junk', () => {
    for (const s of [
      'bc1qxyz',
      'sparkrt1Abc',
      'spark',
      'sparkrt1bio',
      'https://evil.example',
      'sp1' + 'q'.repeat(2000),
    ])
      expect(normalizeBtcRequest(s), s).toBeNull();
  });
  it('parses bitcoin tap payloads and bare QR codes', () => {
    const raw = encodeTapPayload({ v: 1, rail: 'bitcoin', label: 'Sam', url: SPARK });
    expect(parseTapPayload(raw)).toEqual({ ok: true, rail: 'bitcoin', label: 'Sam', url: SPARK });
    expect(parseTapPayload(SPARK)).toMatchObject({ ok: true, rail: 'bitcoin' });
    expect(parseTapPayload(BOLT11)).toMatchObject({ ok: true, rail: 'bitcoin' });
  });
  it('rejects bad bitcoin payloads and unknown rails', () => {
    expect(
      parseTapPayload(JSON.stringify({ v: 1, rail: 'bitcoin', label: '', url: 'solana:x' })).ok,
    ).toBe(false);
    expect(parseTapPayload(JSON.stringify({ v: 1, rail: 'doge', label: '', url: 'x' }))).toEqual({
      ok: false,
      error: expect.stringContaining('doge'),
    });
  });
});
