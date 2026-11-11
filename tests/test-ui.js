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
    document, VbeCodec, Blob, console,
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
