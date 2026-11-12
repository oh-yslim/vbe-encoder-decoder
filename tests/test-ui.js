'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const VbeCodec = require('../codec.js');

function makeUi() {
  const elements = Object.create(null);
  let latestDownload = null;
  const document = {
    getElementById(id) {
      if (!elements[id]) {
        const listeners = Object.create(null);
        elements[id] = {
          id, value: '', textContent: '', files: [], disabled: false,
          classList: { toggle() {} },
          addEventListener(name, callback) { listeners[name] = callback; },
          async emit(name) { assert.ok(listeners[name], `${id} has ${name}`); return await listeners[name](); },
          focus() {}, select() {},
        };
      }
      return elements[id];
    },
    createElement() {
      return {
        href: '', download: '',
        click() { latestDownload = { filename: this.download, url: this.href }; },
        remove() {},
      };
    },
    body: { appendChild() {} },
  };
  let nextUrl = 0;
  const blobs = new Map();
  const context = vm.createContext({
    document, VbeCodec, Blob, console, Uint8Array, TextEncoder, TextDecoder,
    URL: {
      createObjectURL(blob) { const uri = 'blob:test-' + (++nextUrl); blobs.set(uri, blob); return uri; },
      revokeObjectURL() {},
    },
    window: { setTimeout() {} },
    navigator: { clipboard: { async writeText() {} } },
  });
  vm.runInContext(readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), context);
  return { get: (id) => document.getElementById(id), blobs,
    download: () => latestDownload };
}

test('UI ASCII sample encodes and downloads without a BOM', async () => {
  const ui = makeUi();
  await ui.get('samplePlain').emit('click');
  assert.match(ui.get('inputMeta').textContent, /Input download encoding: ASCII/);
  await ui.get('encode').emit('click');
  assert.ok(ui.get('output').value.startsWith('#@~^'));
  assert.match(ui.get('resultMeta').textContent, /ASCII/);
  await ui.get('download').emit('click');
  const saved = ui.download();
  assert.equal(saved.filename, 'ascii-test.vbe');
  const bytes = Buffer.from(await ui.blobs.get(saved.url).arrayBuffer());
  assert.notDeepEqual([...bytes.subarray(0, 2)], [255, 254]);
});

test('UI Unicode in comments triggers UTF-16LE for Input and Result', async () => {
  const ui = makeUi();
  await ui.get('sampleUnicode').emit('click');
  assert.match(ui.get('inputMeta').textContent, /Input download encoding: UTF-16 LE with BOM/);
  await ui.get('downloadInput').emit('click');
  const original = ui.download();
  assert.equal(original.filename, 'unicode-comment-test.vbs');
  let bytes = Buffer.from(await ui.blobs.get(original.url).arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 2)], [255, 254]);
  assert.match(bytes.toString('utf16le'), /한글/);
  await ui.get('encode').emit('click');
  assert.match(ui.get('resultMeta').textContent, /UTF-16 LE with BOM/);
  const vbe = ui.get('output').value;
  ui.get('input').value = vbe;
  await ui.get('input').emit('input');
  await ui.get('decode').emit('click');
  assert.match(ui.get('output').value, /한글/);
  await ui.get('download').emit('click');
  bytes = Buffer.from(await ui.blobs.get(ui.download().url).arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 2)], [255, 254]);
});

test('UI Validate VBE reports format validation without claiming execution', async () => {
  const ui = makeUi();
  await ui.get('sampleEncoded').emit('click');
  await ui.get('validate').emit('click');
  assert.match(ui.get('message').textContent, /format checks passed/i);
  assert.match(ui.get('details').textContent, /execution: NOT TESTED/i);
});

test('UI exposes unverified diagnostic output but gates the download', async () => {
  const ui = makeUi();
  await ui.get('sampleEncoded').emit('click');
  const original = ui.get('input').value;
  ui.get('input').value = original.replace('DgAAAA==', 'AAAAAA==');
  await ui.get('input').emit('input');
  await ui.get('decode').emit('click');
  assert.equal(ui.get('output').value, 'MsgBox "Hello"');
  assert.match(ui.get('message').textContent, /unverified recovery/i);
  assert.match(ui.get('details').textContent, /length.*MISMATCH/);
  assert.equal(ui.get('unverifiedRow').hidden, false);
  assert.equal(ui.get('download').disabled, true);
  ui.get('allowUnverified').checked = true;
  await ui.get('allowUnverified').emit('change');
  assert.equal(ui.get('download').disabled, false);
  await ui.get('download').emit('click');
  assert.match(ui.download().filename, /\.vbs$/);
});

test('UI can decode a valid legacy-byte interpretation without modifying the pasted input', async () => {
  const ui = makeUi();
  const charBytes = new TextEncoder().encode('黔ㆃ§');
  const decodedAsGbk = new TextDecoder('gbk', { fatal: true }).decode(charBytes);
  const source = `Option Explicit\r\n' ${decodedAsGbk}\r\nWScript.Echo "OK"\r\n`;
  const encoded = VbeCodec.encodeText(source, 'gbk').text;
  const legacyBytes = VbeCodec.encodeCharacters(encoded, 'gbk');
  const displayed = new TextDecoder('utf-8', { fatal: true }).decode(legacyBytes);
  ui.get('input').value = displayed;
  await ui.get('input').emit('input');
  await ui.get('decode').emit('click');
  assert.equal(ui.get('output').value, `Option Explicit\r\n' 黔ㆃ§\r\nWScript.Echo "OK"\r\n`);
  assert.equal(ui.get('input').value, displayed);
  assert.match(ui.get('details').textContent, /STORAGE BYTE RECOVERY/i);
});

test('UI Download Input preserves unchanged uploaded bytes exactly', async () => {
  const ui = makeUi();
  const source = 'Option Explicit\r\n\' 한글\r\n';
  const rawBytes = VbeCodec.encodeCharacters(source, 'utf-16le', true);
  const rawBuffer = rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength);
  ui.get('upload').files = [{ name: 'byte-exact.vbs', size: rawBytes.length, async arrayBuffer() { return rawBuffer; } }];
  await ui.get('upload').emit('change');
  assert.match(ui.get('message').textContent, /File loaded/);
  await ui.get('downloadInput').emit('click');
  const blob = ui.blobs.get(ui.download().url);
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()), Buffer.from(rawBytes));
});

// Uploaded file storage is preserved on Result export until Input is edited.
test('Unedited UTF-8 BOM upload retains UTF-8 BOM for encoded output', async () => {
  const ui = makeUi();
  const plain = 'Option Explicit\r\n\' 한글 日本語 中文 😀\r\nWScript.Echo "OK"\r\n';
  const bytes = VbeCodec.encodeCharacters(plain, 'utf-8', true);
  ui.get('upload').files = [{ name: 'utf8-bom.vbs', size: bytes.length,
    async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } }];
  await ui.get('upload').emit('change');
  assert.match(ui.get('message').textContent, /File loaded/);
  assert.match(ui.get('inputMeta').textContent, /result preserves UTF-8/);
  await ui.get('encode').emit('click');
  await ui.get('download').emit('click');
  let stored = Buffer.from(await ui.blobs.get(ui.download().url).arrayBuffer());
  assert.deepEqual([...stored.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(new TextDecoder('utf-8', { fatal: true }).decode(stored).slice(0, 4), '#@~^');
  ui.get('input').value = plain + "' Edited\r\n";
  await ui.get('input').emit('input');
  await ui.get('encode').emit('click');
  await ui.get('download').emit('click');
  stored = Buffer.from(await ui.blobs.get(ui.download().url).arrayBuffer());
  assert.deepEqual([...stored.subarray(0, 2)], [0xff, 0xfe]);
});

test('Unedited UTF-32BE input retains UTF-32BE on Result export', async () => {
  const ui = makeUi();
  const plain = 'Option Explicit\r\n\' 한글 中文\r\nWScript.Echo "OK"\r\n';
  const bytes = VbeCodec.encodeCharacters(plain, 'utf-32be', true);
  ui.get('upload').files = [{ name: 'unicode-32.vbs', size: bytes.length,
    async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } }];
  await ui.get('upload').emit('change');
  assert.match(ui.get('message').textContent, /File loaded/);
  await ui.get('encode').emit('click');
  await ui.get('download').emit('click');
  const stored = Buffer.from(await ui.blobs.get(ui.download().url).arrayBuffer());
  assert.deepEqual([...stored.subarray(0, 4)], [0x00, 0x00, 0xfe, 0xff]);
});

test('Byte-oriented recovery does not reinterpret recovered Unicode as CP949 characters', () => {
  const source = "Option Explicit\r\n' 黔ㆃ§\r\nWScript.Echo \"OK\"\r\n";
  const utf8 = new TextEncoder().encode('黔ㆃ§');
  const gbkText = new TextDecoder('gbk', { fatal: true }).decode(utf8);
  const legacySource = source.replace('黔ㆃ§', gbkText);
  const encoded = VbeCodec.encodeText(legacySource, 'gbk').text;
  const stored = VbeCodec.encodeCharacters(encoded, 'gbk');
  const recovered = VbeCodec.decodeStorageBytes(stored, 'utf-8');
  assert.equal(recovered.text, source);
  assert.deepEqual(recovered.warnings, []);
  assert.ok(recovered.diagnostics.every(x => x.lengthMatch && x.checksumMatch));
});

test('UI unedited UTF-8 VBS upload downloads the exact native-compatible 8-bit VBE bytes', async () => {
  const crypto = require('node:crypto');
  const ui = makeUi();
  const source = [
    "'" + '뭵'.repeat(22), "'뭵", "'黔ㆃ§eªN°Λ ?Ζ?Ξ?Μ³λ ?π??筍菽???",
    'Option Explicit', "' 한글 / 日本語 / 中文 / Café / Emoji 😀 🚀",
    'WScript.Echo "Hello 한글 / 日本語 / 中文 / Café / Emoji 😀 🚀"', ''
  ].join('\n');
  const bytes = new TextEncoder().encode(source);
  ui.get('upload').files = [{ name: 'T4-1.vbs', size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }];
  await ui.get('upload').emit('change');
  assert.match(ui.get('message').textContent, /File loaded/);
  await ui.get('encode').emit('click');
  assert.match(ui.get('message').textContent, /Native-style 8-bit VBE generated/);
  assert.equal(ui.get('copy').disabled, true);
  assert.match(ui.get('output').value, /\\xEB/);
  await ui.get('download').emit('click');
  const saved = Buffer.from(await ui.blobs.get(ui.download().url).arrayBuffer());
  assert.equal(saved.length, 262);
  assert.equal(crypto.createHash('sha256').update(saved).digest('hex'),
    '7998367c6d099bbe0e2bed38e672d33d31490a4427914a305c915b7c9d94e35c');
});

test('UI can re-import native 8-bit VBE and show a cautious decoded preview', async () => {
  const ui = makeUi();
  const source = [
    "'" + '뭵'.repeat(22), "'뭵", "'黔ㆃ§eªN°Λ ?Ζ?Ξ?Μ³λ ?π??筍菽???",
    'Option Explicit', "' 한글 / 日本語 / 中文 / Café / Emoji 😀 🚀",
    'WScript.Echo "Hello 한글 / 日本語 / 中文 / Café / Emoji 😀 🚀"', ''
  ].join('\n');
  const bytes = VbeCodec.encodeNativeFile(new TextEncoder().encode(source),
    { encoding: 'utf-8', text: source }).bytes;
  ui.get('upload').files = [{ name: 'T4-1.vbe', size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }];
  await ui.get('upload').emit('change');
  assert.match(ui.get('message').textContent, /Native 8-bit VBE loaded/);
  await ui.get('decode').emit('click');
  assert.match(ui.get('output').value, /Option Explicit/);
  assert.match(ui.get('details').textContent, /189 \/ observed 189 \(MATCH\)/);
  assert.match(ui.get('details').textContent, /9013 \/ calculated 9013 \(MATCH\)/);
  assert.match(ui.get('details').textContent, /UNVERIFIED|unverified/i);
});
