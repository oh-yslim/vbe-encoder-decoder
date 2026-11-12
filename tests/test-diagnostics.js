'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const codec = require('../codec.js');

const valid = codec.encodeText('WScript.Echo "Safe fixture"\r\n').text;

test('diagnostics separate decoded text from mismatched metadata', () => {
  const modified = valid.replace(/^#@~\^.{8}/, '#@~^AAAAAA==');
  const result = codec.decodeText(modified);
  assert.equal(result.text, 'WScript.Echo "Safe fixture"\r\n');
  assert.equal(result.verified, false);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].lengthMatch, false);
  assert.equal(result.diagnostics[0].checksumMatch, true);
  assert.ok(result.warnings.some(message => message.includes('length mismatch')));
  assert.equal(codec.validateVbe(modified).valid, false);
});

test('diagnostics report noncanonical checksum separately from length', () => {
  const modified = valid.replace(/.{8}\^#~@$/, 'AAAAAA==^#~@');
  const result = codec.decodeText(modified);
  assert.equal(result.diagnostics[0].lengthMatch, true);
  assert.equal(result.diagnostics[0].checksumMatch, false);
  assert.ok(result.warnings.some(message => message.includes('checksum mismatch')));
});

test('DEL in encoded payload is allowed and does not trigger invalid source warning', () => {
  const reference = '#@~^DgAAAA==\\ko$K6,JC\x7fV^GJqAQAAA==^#~@';
  const result = codec.decodeText(reference);
  assert.equal(result.text, 'MsgBox "Hello"');
  assert.equal(result.verified, true);
  assert.equal(result.controls.count, 0);
  assert.ok(result.diagnostics[0].encodedDelCount > 0);
});

test('unexpected decoded controls are warnings, not blockers to diagnostic preview', () => {
  const parsed = /^#@~\^(.{8})([\s\S]*)(.{8})\^#~@$/.exec(valid);
  assert.ok(parsed);
  const invalid = '#@~^' + parsed[1] + parsed[2] + '\0' + parsed[3] + '^#~@';
  const result = codec.decodeText(invalid);
  assert.ok(result.text.includes('\0'));
  assert.equal(result.verified, false);
  assert.ok(result.controls.count > 0);
  assert.equal(codec.validateVbe(invalid).valid, false);
});

test('single terminal NUL after marker is accepted for import and diagnosed', () => {
  const raw = valid + '\0';
  const bytes = codec.saveTextAuto(raw).bytes;
  const loaded = codec.readFileAuto(bytes);
  assert.equal(loaded.terminalNul, true);
  const report = codec.decodeText(loaded.text);
  assert.equal(report.text, 'WScript.Echo "Safe fixture"\r\n');
  assert.equal(report.terminalNulIgnored, true);
  assert.equal(report.verified, true);
  assert.equal(report.controls.count, 0);
  assert.equal(report.warnings.length, 0);
  assert.ok(report.notices.some(message => message.includes('terminal NUL')));
});

test('NUL inside encoded data is not silently removed', () => {
  const parsed = /^#@~\^(.{8})([\s\S]*)(.{8})\^#~@$/.exec(valid);
  const text = '#@~^' + parsed[1] + parsed[2] + '\0' + parsed[3] + '^#~@';
  assert.throws(() => codec.readFileAuto(codec.saveTextAuto(text).bytes), /Undetermined Unicode encoding|invalid text control/);
});
