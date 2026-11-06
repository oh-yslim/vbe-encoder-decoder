'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const codec = require('../codec.js');

const sample = '#@~^DgAAAA==\\ko$K6,JC\x7fV^GJqAQAAA==^#~@';
const plain = 'MsgBox "Hello"';
const fixture = path.join(__dirname, '..', 'test-samples');
const unicode = fs.readFileSync(path.join(fixture, 'Unicode_Stress_Test_UTF8.vbs'), 'utf8').replace(/^\uFEFF/, '');

function metadata(encoded) {
  const match = /^#@~\^(.{8})([\s\S]*)(.{8})\^#~@$/.exec(encoded);
  assert.ok(match);
  return {
    length: Buffer.from(match[1], 'base64').readUInt32LE(0),
    sum: Buffer.from(match[3], 'base64').readUInt32LE(0),
    payload: match[2]
  };
}

function checksum(source) {
  let sum = 0;
  for (let i = 0; i < source.length; i++) sum = (sum + source.charCodeAt(i)) >>> 0;
  return sum;
}

test('published independent ASCII VBE vector is decoded exactly', () => {
  assert.equal(codec.decodeText(sample).text, plain);
  assert.equal(codec.encodeText(plain).text, sample);
});

test('escape sequences count as one unescaped character in metadata', () => {
  const source = 'A\r\nB <@> C\nZ';
  const encoded = codec.encodeText(source);
  const data = metadata(encoded.text);
  assert.ok(data.payload.includes('@#@&'));
  assert.ok(data.payload.includes('@!'));
  assert.ok(data.payload.includes('@$'));
  assert.ok(data.payload.includes('@*'));
  assert.equal(data.length, source.length);
  assert.ok(data.payload.length > source.length);
  assert.equal(data.sum, checksum(source));
  assert.equal(codec.decodeText(encoded.text).text, source);
  assert.deepEqual(codec.decodeText(encoded.text).warnings, []);
});

test('non-ASCII BMP characters contribute to the checksum', () => {
  const source = 'MsgBox "한글 日本語 简体中文 繁體中文 Café Ω Русский"\r\nWScript.Echo "OK"';
  const encoded = codec.encodeText(source);
  assert.equal(metadata(encoded.text).sum, checksum(source));
  assert.equal(metadata(encoded.text).length, source.length);
  assert.equal(codec.decodeText(encoded.text).text, source);
  assert.deepEqual(codec.decodeText(encoded.text).warnings, []);
});

test('non-BMP emoji count as UTF-16 surrogate pairs in metadata', () => {
  const source = 'WScript.Echo "😀 🚀 🧑‍💻 🇯🇵"\r\nMsgBox "ASCII after emoji"';
  const encoded = codec.encodeText(source, 'utf-16le');
  assert.equal(metadata(encoded.text).length, source.length);
  assert.equal(metadata(encoded.text).sum, checksum(source));
  assert.equal(codec.decodeBytes(encoded.bytes).text, source);
  assert.deepEqual(codec.decodeBytes(encoded.bytes).warnings, []);
});

test('long mixed Unicode and ASCII fixture, UTF-8 pasted and file roundtrips', () => {
  for (const input of [unicode, 'MsgBox "a 안 b 中 c 😀 d"\r\n'.repeat(250)]) {
    const encoded = codec.encodeText(input, 'utf-8');
    const decoded = codec.decodeText(encoded.text, 'utf-8');
    assert.equal(decoded.text, input);
    assert.deepEqual(decoded.warnings, []);
    const byteEncoded = codec.encodeBytes(new TextEncoder().encode(input), 'utf-8');
    assert.equal(byteEncoded.text, encoded.text);
    assert.equal(codec.decodeBytes(byteEncoded.bytes, 'utf-8').text, input);
  }
});

test('UTF-16LE/BE with BOM preserve all ASCII, Unicode, and escaped CRLF', () => {
  for (const encoding of ['utf-16le', 'utf-16be']) {
    const output = codec.encodeText(unicode, encoding);
    assert.equal(codec.detectEncoding(output.bytes), encoding);
    const decoded = codec.decodeBytes(output.bytes, 'auto');
    assert.equal(decoded.text, unicode);
    assert.deepEqual(decoded.warnings, []);
    assert.equal(codec.detectEncoding(decoded.bytes), encoding);
  }
});

test('CP949 can represent Korean without replacement; cannot represent emoji', () => {
  const korean = 'MsgBox "안녕하세요"\r\nMsgBox "한글"\r\n';
  const encoded = codec.encodeText(korean, 'euc-kr');
  const decoded = codec.decodeBytes(encoded.bytes, 'euc-kr');
  assert.equal(decoded.text, korean);
  assert.deepEqual(decoded.warnings, []);
  assert.throws(() => codec.encodeText('MsgBox "한글 😀"', 'euc-kr'), /cannot be represented/);
  assert.throws(() => codec.decodeText(codec.encodeText('MsgBox "한글 😀"').text, 'euc-kr'), /cannot be represented/);
});

test('legacy code pages roundtrip with representable characters', () => {
  for (const [encoding, source] of [
    ['shift_jis', 'WScript.Echo "日本語 ひらがな"\r\n'],
    ['gbk', 'WScript.Echo "简体中文 你好"\r\n'],
    ['big5', 'WScript.Echo "繁體中文 你好"\r\n'],
    ['windows-1252', 'WScript.Echo "Café € naïve"\r\n'],
  ]) {
    const result = codec.encodeText(source, encoding);
    assert.equal(codec.decodeBytes(result.bytes, encoding).text, source);
    assert.deepEqual(codec.decodeBytes(result.bytes, encoding).warnings, []);
  }
});

test('full ASCII control range, with automatic UTF-16LE BOM output', () => {
  const source = Array.from({length: 128}, (_, i) => String.fromCharCode(i)).join('').repeat(10);
  const encoded = codec.encodeText(source, 'utf-16le');
  assert.equal(codec.decodeBytes(encoded.bytes).text, source);
  assert.equal(metadata(encoded.text).length, source.length);
});

test('two encoded blocks, preserve surrounding text including Unicode', () => {
  const combined = 'Prefix 한글\r\n' + codec.encodeText('MsgBox "A"').text + '\r\n' +
    codec.encodeText('WScript.Echo "B"\r\n').text + '\r\nSuffix 😀';
  const result = codec.decodeText(combined, 'utf-8');
  assert.equal(result.text, 'Prefix 한글\r\nMsgBox "A"\r\nWScript.Echo "B"\r\n\r\nSuffix 😀');
  assert.equal(result.blockCount, 2);
  assert.deepEqual(result.warnings, []);
});

test('invalid VBE escape is rejected, damaged header is warned', () => {
  assert.throws(() => codec.decodeText('#@~^DgAAAA==@?qAQAAA==^#~@'), /Invalid VBE escape/);
  const broken = sample.replace('DgAAAA==', 'AAAAAA==');
  const recovered = codec.decodeText(broken);
  assert.equal(recovered.text, plain);
  assert.ok(recovered.warnings.some(value => value.includes('length')));
});

test('the legacy v3.1 test fixtures must not be misreported as valid metadata', () => {
  const oldEncoded = fs.readFileSync(path.join(__dirname, 'fixtures', 'legacy_v31_utf8_bad_header.vbe'));
  const decoded = codec.decodeBytes(new Uint8Array(oldEncoded), 'utf-8');
  assert.equal(decoded.text, unicode);
  assert.ok(decoded.warnings.length > 0, 'Legacy fixture was expected to have incorrect metadata');
});

test('unpaired surrogate data is rejected rather than silently replaced', () => {
  assert.throws(() => codec.encodeText('A\ud800B', 'utf-8'), /surrogate/);
});
