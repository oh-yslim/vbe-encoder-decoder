'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const codec = require('../codec.js');

// Synthetic, harmless fixture. No user-supplied VBE data appears in tests.
function example() {
  const literal = '黔ㆃ§';
  const utf8 = new TextEncoder().encode(literal);
  const interpreted = new TextDecoder('gbk', { fatal: true }).decode(utf8);
  const source = `Option Explicit\r\n' ${interpreted}\r\nWScript.Echo "OK"\r\n`;
  const text = codec.encodeText(source, 'gbk').text;
  const byteSequence = codec.encodeCharacters(text, 'gbk');
  const utf8Displayed = new TextDecoder('utf-8', { fatal: true }).decode(byteSequence);
  const originalSource = `Option Explicit\r\n' ${literal}\r\nWScript.Echo "OK"\r\n`;
  return { source, originalSource, utf8Displayed };
}

test('UTF-8 BOM-less VBE + terminal NUL loads without binary rejection', () => {
  const fixture = example();
  const bytes = new TextEncoder().encode(fixture.utf8Displayed + '\0');
  const loaded = codec.readFileAuto(bytes);
  assert.equal(loaded.encoding, 'utf-8');
  assert.equal(loaded.terminalNul, true);
  assert.equal(loaded.text, fixture.utf8Displayed + '\0');
  const report = codec.decodeTextAuto(loaded.text);
  assert.equal(report.verified, true);
  assert.equal(report.text, fixture.originalSource);
  assert.equal(report.diagnostics[0].lengthMatch, true);
  assert.equal(report.diagnostics[0].checksumMatch, true);
  assert.match(report.notices.join(' '), /Byte-oriented VBE/);
  assert.equal(report.interpretation.method, 'storage-byte-recovery');
});

test('Windows terminal NUL does not make a clean ASCII VBE unverified', () => {
  const encoded = codec.encodeText('WScript.Echo "OK"\r\n').text + '\0';
  const loaded = codec.readFileAuto(new TextEncoder().encode(encoded));
  const report = codec.decodeTextAuto(loaded.text);
  assert.equal(report.verified, true);
  assert.equal(report.warnings.length, 0);
  assert.equal(report.terminalNulIgnored, true);
});

test('An embedded NUL is still rejected, rather than silently stripped', () => {
  const encoded = codec.encodeText('WScript.Echo "OK"').text;
  const corrupt = encoded.replace('^#~@', '\0^#~@');
  assert.throws(() => codec.readFileAuto(new TextEncoder().encode(corrupt)));
});

test('A non-VBE UTF-8 file ending with NUL is not accepted', () => {
  assert.throws(() => codec.readFileAuto(new TextEncoder().encode('WScript.Echo "OK"\0')));
});
