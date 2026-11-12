'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const codec = require('../codec.js');

// This fixture contains harmless text only. Private user files are not embedded.
// The UTF-8 bytes of the displayed characters can also be read as GBK bytes.
function buildLegacyInterpretationFixture(characters) {
  const encodedBytes = new TextEncoder().encode(characters);
  const interpreted = new TextDecoder('gbk', { fatal: true }).decode(encodedBytes);
  const expectedSource = `Option Explicit\r\n' ${interpreted}\r\nWScript.Echo "OK"\r\n`;
  const canonicalVbe = codec.encodeText(expectedSource, 'gbk').text;
  const legacyBytes = codec.encodeCharacters(canonicalVbe, 'gbk');
  const displayedVbe = new TextDecoder('utf-8', { fatal: true }).decode(legacyBytes);
  return { expectedSource, displayedVbe };
}

test('valid ASCII VBE still uses the direct decoder', () => {
  const encoded = '#@~^DgAAAA==\\ko$K6,JC\x7fV^GJqAQAAA==^#~@';
  const result = codec.decodeTextAuto(encoded);
  assert.equal(result.verified, true);
  assert.equal(result.text, 'MsgBox "Hello"');
  assert.equal(result.interpretation.method, 'direct');
});

test('UTF-8 displayed VBE can be restored by strictly validated GBK reinterpretation', () => {
  const fixture = buildLegacyInterpretationFixture('黔ㆃ§');
  const before = codec.decodeText(fixture.displayedVbe);
  assert.equal(before.verified, false);
  const result = codec.decodeTextAuto(fixture.displayedVbe);
  assert.equal(result.verified, true);
  assert.equal(result.interpretation.method, 'legacy-byte-reinterpretation');
  assert.equal(result.text, fixture.expectedSource);
  assert.ok(result.diagnostics.every(block => block.lengthMatch && block.checksumMatch));
  assert.equal(result.controls.count, 0);
});

test('UTF-16 LE BOM upload and UTF-8 upload reach same recovery', () => {
  const fixture = buildLegacyInterpretationFixture('黔ㆃ§');
  const variants = [
    new TextEncoder().encode(fixture.displayedVbe),
    codec.encodeCharacters(fixture.displayedVbe, 'utf-16le', true)
  ];
  for (const bytes of variants) {
    const imported = codec.readFileAuto(bytes);
    const report = codec.decodeTextAuto(imported.text);
    assert.equal(report.verified, true);
    assert.equal(report.text, fixture.expectedSource);
  }
});

test('a Unicode VBE with correct metadata is not reinterpreted', () => {
  const source = 'Option Explicit\r\n\' 한글, 日本語, 中文, 😀\r\nWScript.Echo "OK"\r\n';
  const encoded = codec.encodeText(source, 'utf-16le').text;
  const decoded = codec.decodeTextAuto(encoded);
  assert.equal(decoded.interpretation.method, 'direct');
  assert.equal(decoded.text, source);
  assert.equal(decoded.verified, true);
});

test('ASCII-only malformed metadata does not trigger legacy interpretation', () => {
  const encoded = codec.encodeText('MsgBox "Hello"').text.replace('DgAAAA==', 'AAAAAA==');
  const decoded = codec.decodeTextAuto(encoded);
  assert.equal(decoded.verified, false);
  assert.equal(decoded.interpretation.method, 'direct');
});

test('Invalid UTF-8-to-legacy candidate must not be accepted with replacement characters', () => {
  const encoded = codec.encodeText('WScript.Echo "é"').text.replace('AA==', 'AQ==');
  const decoded = codec.decodeTextAuto(encoded);
  assert.equal(decoded.verified, false);
});
