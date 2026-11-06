'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const codec = require('../codec.js');

const sample = '#@~^DgAAAA==\\ko$K6,JC\x7fV^GJqAQAAA==^#~@';
const greeting = 'MsgBox "Hello"';

test('independent public-domain VBE reference vector decodes exactly', () => {
  const result = codec.decodeText(sample);
  assert.equal(result.text, greeting);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.blockCount, 1);
});

test('encoder produces reference VBE output byte for byte', () => {
  assert.equal(codec.encodeText(greeting).text, sample);
});

test('full ASCII byte-range roundtrip', () => {
  const bytes = Uint8Array.from({length: 128}, (_, i) => i);
  const encoded = codec.encodeBytes(bytes, 'utf-8');
  const decoded = codec.decodeBytes(encoded.bytes, 'utf-8');
  assert.deepEqual(decoded.bytes, bytes);
  assert.deepEqual(decoded.warnings, []);
});

test('all ASCII with long selector wrapping and marker characters', () => {
  const source = `WScript.Echo "Hello" & vbCrLf\r\n'!"#$%&'()*+,-./;<=>?@[\\]^_\`{|}~\r\n`.repeat(100);
  const encoded = codec.encodeText(source);
  const decoded = codec.decodeText(encoded.text);
  assert.equal(decoded.text, source);
  assert.deepEqual(decoded.warnings, []);
  assert.equal(Buffer.from(decoded.bytes).toString(), source);
});

test('empty data is representable as an encoded block', () => {
  const encoded = codec.encodeText('');
  assert.equal(codec.decodeText(encoded.text).text, '');
  assert.deepEqual(codec.decodeText(encoded.text).warnings, []);
});

test('UTF-8 multilingual roundtrip', () => {
  const text = 'MsgBox "안녕하세요 日本語 中文 😀"\n';
  const encoded = codec.encodeText(text, 'utf-8');
  const decoded = codec.decodeText(encoded.text, 'utf-8');
  assert.equal(decoded.text, text);
  assert.deepEqual(decoded.warnings, []);
});

test('CP949 Hangul in text and file bytes roundtrip', () => {
  const original = 'MsgBox "안녕하세요"\r\nMsgBox "한글"\r\n';
  const encoded = codec.encodeText(original, 'euc-kr');
  const decoded = codec.decodeBytes(encoded.bytes, 'euc-kr');
  assert.equal(decoded.text, original);
  assert.deepEqual(decoded.warnings, []);
  const encodedDirect = codec.encodeBytes(codec.encodeCharacters(original, 'euc-kr'), 'euc-kr');
  assert.deepEqual(encodedDirect.bytes, encoded.bytes);
});

test('unsupported characters in CP949 are rejected rather than corrupted', () => {
  assert.throws(() => codec.encodeText('😀', 'euc-kr'), /CP949/);
});

test('multiple encoded blocks and surrounding text', () => {
  const combined = `Preamble\r\n${sample}\r\nSeparator\r\n${codec.encodeText('WScript.Quit').text}\r\n`;
  const result = codec.decodeText(combined);
  assert.equal(result.text, 'Preamble\r\nMsgBox "Hello"\r\nSeparator\r\nWScript.Quit\r\n');
  assert.equal(result.blockCount, 2);
  assert.deepEqual(result.warnings, []);
});

test('header checksum tampering is shown as a warning', () => {
  const tampered = sample.replace('qAQAAA==', 'AAAAAA==');
  const result = codec.decodeText(tampered);
  assert.equal(result.text, greeting);
  assert.ok(result.warnings.some(x => x.includes('체크섬')));
});

test('invalid VBE marker and escape are rejected', () => {
  assert.throws(() => codec.decodeText('not a vbe block'), /VBE 블록/);
  const bad = sample.replace('\\ko$', '@?o$');
  assert.throws(() => codec.decodeText(bad), /이스케이프/);
});

test('UTF-8 BOM on input files is removed while encoding', () => {
  const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, ...Buffer.from(greeting, 'utf-8')]);
  assert.equal(codec.decodeBytes(codec.encodeBytes(bytes).bytes).text, greeting);
});

test('mismatched declared length is detected', () => {
  const corrupted = sample.replace('DgAAAA==', 'DQAAAA==');
  const result = codec.decodeText(corrupted);
  assert.equal(result.text, greeting);
  assert.ok(result.warnings.some(x => x.includes('길이')));
});
