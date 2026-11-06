'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const codec = require('../codec.js');

const fixture = path.resolve(__dirname, '../test-samples');

test('WSH-safe international VBScript fixture is pure ASCII and decodes exactly', () => {
  const source = fs.readFileSync(path.join(fixture, 'Unicode_Stress_Test_WSH_Ascii.vbs'));
  const encoded = new Uint8Array(fs.readFileSync(path.join(fixture, 'Unicode_Stress_Test_WSH_Ascii.vbe')));
  assert.ok([...source].every(byte => byte < 128));
  const recovered = codec.decodeBytesCompatible(encoded, 'utf-8');
  assert.equal(recovered.text, source.toString('ascii'));
  assert.deepEqual(recovered.warnings, []);
  assert.ok(recovered.text.includes('ChrW(&HD83D)'));
});
