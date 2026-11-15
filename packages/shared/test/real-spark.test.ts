import { expect, it } from 'vitest';
import { normalizeBtcRequest, parseTapPayload } from '../src/index.js';

it('accepts a real regtest Spark address (captured from the app on an emulator)', () => {
  const a = 'sparkrt1pgssyay50cl3zvdyzfadv48jgfm35ms4v5vwr69ud6ltn20v54czpk3gufc7ct';
  expect(normalizeBtcRequest(a)).toBe(a);
  expect(parseTapPayload(a)).toMatchObject({ ok: true, rail: 'bitcoin' });
});
