'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const Codec = require('../codec.js');
const CP949 = require('../cp949-map.js');

// Independent screnc.exe byte fingerprints from previously observed, benign
// T4 input/output fixtures. No private VBE scripts or credentials are shipped.
const source = [
  "'" + '뭵'.repeat(22),
  "'뭵",
  "'黔ㆃ§eªN°Λ ?Ζ?Ξ?Μ³λ ?π??筍菽???",
  'Option Explicit',
  "' 한글 / 日本語 / 中文 / Café / Emoji 😀 🚀",
  'WScript.Echo "Hello 한글 / 日本語 / 中文 / Café / Emoji 😀 🚀"',
  ''
].join('\n');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = {
  utf8Input: '92a218a0fb3fc26ac434430d91ba0d6c2e39b1e99767fb83ead71e03d0786fcc',
  utf8Native: '7998367c6d099bbe0e2bed38e672d33d31490a4427914a305c915b7c9d94e35c',
  utf16Input: '066bb3dfc0b2017be7984d28cf45e09b319fe4d9d51ba5d98eb87e8ed7eb7274',
  utf16Native: '02548c100a21f137fb266f394178a57ea7a1407df0d18070e4f1653de570c834'
};

test('Reference inputs are exactly the independently observed T4 Unicode sources', () => {
  assert.equal(sha256(new TextEncoder().encode(source)), expected.utf8Input);
  assert.equal(sha256(Codec.encodeCharacters(source, 'utf-16le', true)), expected.utf16Input);
});

test('Exact screnc.exe T4-1 parity: BOM-free UTF-8 input produces 262-byte native VBE', () => {
  const input = new TextEncoder().encode(source);
  const report = Codec.encodeNativeFile(input, { encoding: 'utf-8', text: source });
  assert.equal(report.bytes.length, 262);
  assert.equal(report.encodedUnits, 189);
  assert.equal(report.checksum, 9013);
  assert.equal(report.bytes.at(-1), 0);
  assert.equal(sha256(report.bytes), expected.utf8Native);
  assert.equal(report.previewEscaped, true);
});

test('Exact screnc.exe T4-2 parity: UTF-16 LE BOM input produces 394-byte native VBE', () => {
  const input = Codec.encodeCharacters(source, 'utf-16le', true);
  const report = Codec.encodeNativeFile(input, Codec.readFileAuto(input));
  assert.equal(report.bytes.length, 394);
  assert.deepEqual(Array.from(report.bytes.subarray(0, 2)), [0xff, 0xfe]);
  assert.deepEqual(Array.from(report.bytes.subarray(-2)), [0, 0]);
  assert.equal(sha256(report.bytes), expected.utf16Native);
});

test('CP949 byte-pair table recognizes valid Windows pairs rejected by generic EUC-KR decoding', () => {
  assert.equal(CP949.lookup(0x94, 0xe3), '붵'.charCodeAt(0));
  assert.equal(CP949.lookup(0x86, 0x83), '냳'.charCodeAt(0));
  assert.equal(CP949.lookup(0xad, 0xb5), 0);
  const bytes = Uint8Array.of(0x94, 0xe3, 0x86, 0x83);
  assert.equal(Codec.decodeCharacters(bytes, 'euc-kr'), '붵냳');
  assert.deepEqual(Array.from(Codec.encodeCharacters('붵냳', 'euc-kr')), Array.from(bytes));
});

test('Native 8-bit VBE byte output can be re-imported without lossy UTF-8 decoding', () => {
  const input = new TextEncoder().encode(source);
  const native = Codec.encodeNativeFile(input, { encoding: 'utf-8', text: source });
  const info = Codec.readFileAuto(native.bytes);
  assert.equal(info.rawByteView, true);
  assert.equal(info.encoding, 'raw-8bit');
  const recovered = Codec.decodeStorageBytes(native.bytes, info.encoding);
  assert.ok(recovered);
  assert.equal(recovered.diagnostics[0].lengthMatch, true);
  assert.equal(recovered.diagnostics[0].checksumMatch, true);
  assert.match(recovered.text, /Option Explicit/);
});
