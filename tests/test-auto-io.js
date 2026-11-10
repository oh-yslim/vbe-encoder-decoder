'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const codec = require('../codec.js');
const fixture = path.join(__dirname, '..', 'test-samples');

function bommedUtf32(text, little = true) {
  const bytes = little ? [255, 254, 0, 0] : [0, 0, 254, 255];
  for (const symbol of text) {
    const cp = symbol.codePointAt(0);
    if (little) bytes.push(cp & 255, (cp >>> 8) & 255, (cp >>> 16) & 255, (cp >>> 24) & 255);
    else bytes.push((cp >>> 24) & 255, (cp >>> 16) & 255, (cp >>> 8) & 255, cp & 255);
  }
  return Uint8Array.from(bytes);
}

const cases = [
  ['ASCII only', 'Option Explicit\r\nWScript.Echo "Hi123"\r\n', 'ascii'],
  ['Unicode in comment only', 'Option Explicit\r\n\' 한글 日本語 中文 😀 Café\r\nWScript.Echo "Hello"\r\n', 'utf-16le'],
  ['Unicode in string', 'MsgBox "안녕하세요 中文 😀 Ω"\r\n', 'utf-16le'],
  ['emoji only', '😀', 'utf-16le'],
  ['ASCII control newline and tab', '\tA\r\nB\n', 'ascii'],
  ['Unicode beyond BMP in comments', "' 🧑‍💻 𝄞 🇯🇵\r\nWScript.Echo 123\r\n", 'utf-16le'],
];
for (const [title, source, expected] of cases) {
  test(`Auto saving: ${title}`, () => {
    const saved = codec.saveTextAuto(source);
    assert.equal(saved.encoding, expected);
    if (expected === 'ascii') {
      assert.deepEqual(Buffer.from(saved.bytes), Buffer.from(source, 'ascii'));
      assert.notDeepEqual(Array.from(saved.bytes.slice(0, 2)), [255, 254]);
    } else {
      assert.deepEqual(Array.from(saved.bytes.slice(0, 2)), [255, 254]);
      assert.equal(codec.decodeCharacters(saved.bytes, 'utf-16le'), source);
    }
    if (source.startsWith('Option') || source.startsWith('\t')) {
      const vbe = codec.encodeText(source, expected === 'ascii' ? 'utf-8' : 'utf-16le');
      assert.deepEqual(codec.saveTextAuto(vbe.text).encoding, expected);
      assert.equal(codec.decodeText(vbe.text, 'utf-16le').text, source);
    }
  });
}

test('UTF-32 LE/BE BOM are imported, but ASCII text is downloaded as ASCII', () => {
  for (const little of [true, false]) {
    const bytes = bommedUtf32('WScript.Echo "ASCII"\r\n', little);
    const read = codec.readFileAuto(bytes);
    assert.equal(read.encoding, little ? 'utf-32le' : 'utf-32be');
    assert.equal(read.outputEncoding, 'ascii');
    assert.deepEqual(Buffer.from(codec.saveTextAuto(read.text).bytes), Buffer.from('WScript.Echo "ASCII"\r\n', 'ascii'));
  }
});

test('UTF-32 BOM Unicode with emoji is imported then exported as UTF-16LE BOM', () => {
  const source = "' 😀 한글 中文 日本語\r\nWScript.Echo 1\r\n";
  const read = codec.readFileAuto(bommedUtf32(source));
  assert.equal(read.text, source);
  assert.equal(read.outputEncoding, 'utf-16le');
  assert.equal(codec.decodeCharacters(codec.saveTextAuto(read.text).bytes, 'utf-16le'), source);
});

test('UTF-8 and UTF-16LE imported samples use text-driven download encoding', () => {
  for (const name of ['Unicode_Stress_Test_UTF8.vbs', 'Unicode_Stress_Test_UTF16LE.vbs']) {
    const data = new Uint8Array(fs.readFileSync(path.join(fixture, name)));
    const loaded = codec.readFileAuto(data);
    assert.equal(loaded.outputEncoding, 'utf-16le');
    assert.ok(loaded.text.includes('😀'));
  }
  const ascii = codec.readFileAuto(new TextEncoder().encode('WScript.Echo "123"'));
  assert.equal(ascii.outputEncoding, 'ascii');
});

test('Known ASCII VBE and UTF-16LE Unicode VBE fixtures imported without losing controls', () => {
  for (const name of ['WSH_Probe_ASCII.vbe', 'WSH_Probe_Unicode_UTF16LE.vbe']) {
    const loaded = codec.readFileAuto(new Uint8Array(fs.readFileSync(path.join(fixture, name))));
    const validation = codec.validateVbe(loaded.text);
    assert.equal(validation.valid, true);
    assert.equal(validation.blocks, 1);
  }
});

test('Korean CP949 legacy source can be recognized conservatively and saved as UTF-16LE', () => {
  const bytes = new Uint8Array(fs.readFileSync(path.join(fixture, 'Korean_CP949_Test.vbs')));
  const read = codec.readFileAuto(bytes);
  assert.equal(read.encoding, 'euc-kr');
  assert.equal(read.outputEncoding, 'utf-16le');
  assert.ok(read.text.includes('한글') || read.text.includes('한국'));
});

test('Reject invalid input controls and unpaired surrogate', () => {
  for (const bad of ['Option Explicit\0\r\n', 'Hello\x01', 'Hello\x7f', 'Hello\ud800']) {
    assert.throws(() => codec.validateSourceControls(bad));
  }
});

test('VBE validation flags corrupted length/checksum rather than declaring it valid', () => {
  const clean = codec.encodeText("WScript.Echo \"123\"\r\n").text;
  assert.equal(codec.validateVbe(clean).valid, true);
  const damaged = clean.replace('^#~@', '^#~@');
  const m = /^#@~\^(.{8})([\s\S]*)(.{8})\^#~@$/.exec(damaged);
  const bad = '#@~^' + 'AAAAAA==' + m[2] + m[3] + '^#~@';
  const report = codec.validateVbe(bad);
  assert.equal(report.valid, false);
  assert.ok(report.warnings.some(w => /length/i.test(w)));
});

test('Long ASCII file does not exceed function argument count', () => {
  const source = 'A'.repeat(150000) + '\n';
  assert.equal(codec.readFileAuto(new Uint8Array(Buffer.from(source))).text, source);
});
