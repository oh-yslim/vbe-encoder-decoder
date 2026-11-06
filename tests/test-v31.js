
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const codec = require('../codec.js');

const unicode = 'Option Explicit\r\nWScript.Echo "Hello, 한글 日本語 中文 Café 😀 🚀 ∑ ∞"\r\n';

test('Unicode literal conversion creates ASCII-only runnable-form source', () => {
  const result = codec.unicodeLiteralsToAsciiSource(unicode);
  assert.match(result, /ChrW\(&HD83D\) & ChrW\(&HDE00\)/);
  assert.match(result, /ChrW\(&HD55C\)/);
  assert.ok([...result].every(c => c.charCodeAt(0) < 128));
  const encoded = codec.encodeText(result, 'utf-8');
  assert.equal(codec.decodeTextCompatible(encoded.text, 'utf-8').text, result);
});

test('Unicode outside quoted strings is rejected rather than modified', () => {
  assert.throws(() => codec.unicodeLiteralsToAsciiSource("' 한글 comment\r\nMsgBox \"OK\""), /outside a quoted string/);
  assert.throws(() => codec.unicodeLiteralsToAsciiSource('한글변수 = "OK"'), /outside a quoted string/);
});

test('Quoted strings with doubled quotes keep their semantics', () => {
  assert.equal(codec.unicodeLiteralsToAsciiSource('MsgBox "a""b 한글"'),
    'MsgBox ("a""b " & ChrW(&HD55C) & ChrW(&HAE00))');
});

test('ASCII source is unchanged', () => {
  const source = 'Option Explicit\r\nMsgBox "Hello"\r\n';
  assert.equal(codec.unicodeLiteralsToAsciiSource(source), source);
});

test('Compatibility decode recovers an independent public reference VBE block', () => {
  const sample = '#@~^DgAAAA==\\ko$K6,JC\x7fV^GJqAQAAA==^#~@';
  assert.equal(codec.decodeTextCompatible(sample).text, 'MsgBox "Hello"');
});

test('Compatibility decode tolerates metadata and unexpected escape errors', () => {
  const source = 'MsgBox "Hello"';
  const encoded = codec.encodeText(source).text.replace('DgAAAA==', 'AAAAAA==');
  const recovered = codec.decodeTextCompatible(encoded);
  assert.equal(recovered.text, source);
  assert.ok(recovered.warnings.length > 0);
});

test('Compatibility decoder processes Unicode and newline escape blocks', () => {
  const encoded = codec.encodeText(unicode, 'utf-8');
  assert.equal(codec.decodeTextCompatible(encoded.text).text, unicode);
  const fileResult = codec.decodeBytesCompatible(encoded.bytes, 'utf-8');
  assert.equal(fileResult.text, unicode);
});

test('Compatible decoder accepts noncanonical metadata that strict decoding rejects', () => {
  const sample = '#@~^DgAAAA==\\ko$K6,JC\x7fV^GJqAQAAA==^#~@';
  const noncanonical = sample.replace('DgAAAA==', '!!!!!!==');
  assert.equal(codec.decodeTextCompatible(noncanonical).text, 'MsgBox "Hello"');
  assert.ok(codec.decodeTextCompatible(noncanonical).warnings.length > 0);
});
