// The reference alphabet is transcribed as data from scrdec v1.8 by MrBrownstone.
// It is independently organized by plaintext code point, unlike codec.js's decode table.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const codec = require('../codec.js');

const alphabet = `
64 37 69 50 7E 2C 22 5A 65 4A 45 72 61 3A 5B 5E 79 66 5D 59 75 5B 27 4C
42 76 45 60 63 76 23 62 2A 65 4D 43 5F 51 33 7E 53 42 4F 52 20 52 20 63
7A 26 4A 21 54 5A 46 71 38 20 2B 79 26 66 32 63 2A 57 2A 58 6C 76 7F 2B
47 7B 46 25 30 52 2C 31 4F 29 6C 3D 69 49 70 3F 3F 3F 27 78 7B 3F 3F 3F
67 5F 51 3F 3F 3F 62 29 7A 41 24 7E 5A 2F 3B 66 39 47 32 33 41 73 6F 77
4D 21 56 43 75 5F 71 28 26 39 42 78 7C 46 6E 53 4A 64 48 5C 74 31 48 67
72 36 7D 6E 4B 68 70 7D 35 49 5D 22 3F 6A 55 4B 50 3A 6A 69 60 2E 23 6A
7F 09 71 28 70 6F 35 65 49 7D 74 5C 24 2C 5D 2D 77 27 54 44 59 37 3F 25
7B 6D 7C 3D 7C 23 6C 43 6D 34 38 28 6D 5E 31 4E 5B 39 2B 6E 7F 30 57 36
6F 4C 54 74 34 34 6B 72 62 4C 25 4E 33 56 30 56 73 5E 3A 68 73 78 55 09
57 47 4B 77 32 61 3B 35 24 44 2E 4D 2F 64 6B 59 4F 44 45 3B 21 5C 2D 37
68 41 53 36 61 58 58 7A 48 79 22 2E 09 60 50 75 6B 2D 38 4E 29 55 3D 3F
51 67 2F
`.trim().split(/\s+/).map(value => Number.parseInt(value, 16));
const pick = [
  1,2,0,1,2,0,2,0,0,2,0,2,1,0,2,0,
  1,0,2,0,1,1,2,0,0,2,1,0,2,0,0,2,
  1,1,0,2,0,2,0,1,0,1,1,2,0,1,0,2,
  1,0,2,0,1,1,2,0,0,1,1,2,0,1,0,2
];
const escaped = { '\r': '@#', '\n': '@&', '<': '@!', '>': '@*', '@': '@$' };
function metadata(text) {
  const m = /^#@~\^(.{8})([\s\S]*)(.{8})\^#~@$/.exec(text);
  assert.ok(m, 'complete VBE block');
  return {
    units: Buffer.from(m[1], 'base64').readUInt32LE(0),
    checksum: Buffer.from(m[3], 'base64').readUInt32LE(0),
    payload: m[2]
  };
}

test('entire ASCII inverse substitution table matches independent scrdec alphabet', () => {
  assert.equal(alphabet.length, 291);
  for (let position = 0; position < 3; position++) {
    for (const codePoint of [9, ...Array.from({ length: 96 }, (_, i) => i + 32)]) {
      const ch = String.fromCharCode(codePoint);
      const text = 'A'.repeat(position) + ch;
      const { payload } = metadata(codec.encodeText(text).text);
      const suffix = Object.prototype.hasOwnProperty.call(escaped, ch) ? escaped[ch] : null;
      if (suffix) {
        assert.ok(payload.endsWith(suffix), `${codePoint.toString(16)} escaped`);
        continue;
      }
      const refIndex = codePoint === 9 ? 0 : codePoint - 31;
      const expected = String.fromCharCode(alphabet[refIndex * 3 + pick[position]]);
      assert.equal(payload.at(-1), expected, `position=${position}, ASCII=0x${codePoint.toString(16)}`);
      assert.ok(payload.charCodeAt(payload.length - 1) < 128, 'ASCII remains ASCII');
    }
  }
});

test('published SANS 2016 Microsoft-generated script vector: bytes, length, checksum', () => {
  const fixtureDir = path.join(__dirname, 'fixtures');
  const official = fs.readFileSync(path.join(fixtureDir, 'sans_2016_known.vbe'), 'latin1');
  const source = fs.readFileSync(path.join(fixtureDir, 'sans_2016_known.vbs'), 'latin1');
  assert.equal(source.length, 40);
  assert.equal(metadata(official).units, 42);
  assert.equal(metadata(official).payload.length, 42);
  assert.equal(codec.decodeText(official).text, source);
  assert.deepEqual(codec.decodeText(official).warnings, []);
  assert.equal(codec.encodeText(source).text, official);
});

test('published Virus Bulletin partial-block script vectors', () => {
  const example = 'oh_th#@~^AQAAAA==raQAAAA==^#~@s="b#@~^AQAAAA==CYQAAAA==^#~@d"';
  assert.equal(codec.decodeText(example).text, 'oh_this="bad"');
  assert.deepEqual(codec.decodeText(example).warnings, []);
});

test('ASCII-only, Unicode-only, mixed and escaped strings are distinct categories', () => {
  const cases = {
    ascii: 'Option Explicit\r\nWScript.Echo "Simple ASCII 123 + -"\r\n',
    unicode: '한글 日本語 简体中文 繁體中文 Ελληνικά 😀 🇰🇷',
    mixed: 'WScript.Echo "한글 A 中文 B 😀 C"\r\nWScript.Echo "end"',
    escaped: 'A\r\nB<@>C\nD',
  };
  for (const [name, source] of Object.entries(cases)) {
    const encoded = codec.encodeText(source, 'utf-16le');
    const body = metadata(encoded.text);
    assert.equal(body.units, body.payload.length, `${name} length`);
    assert.equal(codec.decodeText(encoded.text, 'utf-16le').text, source, `${name} roundtrip`);
  }
});

test('invalid old v3.2 escaped-length headers are detected', () => {
  const fixtureDir = path.join(__dirname, 'fixtures');
  const official = fs.readFileSync(path.join(fixtureDir, 'sans_2016_known.vbe'), 'latin1');
  const damaged = official.replace('KgAAAA==', 'KAAAAA==');
  const result = codec.decodeText(damaged);
  assert.equal(result.text, fs.readFileSync(path.join(fixtureDir, 'sans_2016_known.vbs'), 'latin1'));
  assert.ok(result.warnings.some(message => message.includes('encoded-body length mismatch')));
});
