/* Browser-only UI. User-supplied scripts are never executed. */
(() => {
  'use strict';

  const node = (id) => document.getElementById(id);
  const input = node('input');
  const output = node('output');
  const upload = node('upload');
  const message = node('message');
  const details = node('details');
  const inputMeta = node('inputMeta');
  const resultMeta = node('resultMeta');
  const names = { ascii: 'ASCII', 'utf-8': 'UTF-8', 'utf-16le': 'UTF-16 LE with BOM',
    'utf-16be': 'UTF-16 BE', 'utf-32le': 'UTF-32 LE', 'utf-32be': 'UTF-32 BE',
    'euc-kr': 'CP949', shift_jis: 'Shift-JIS / CP932', gbk: 'GBK / CP936',
    big5: 'Big5 / CP950', 'windows-1252': 'Windows-1252' };
  const label = (value) => names[value] || value;
  let originalText = null;
  let originalReadInfo = null;
  let fileName = 'script';
  let result = null;
  let lastMode = 'decode';

  function status(text, error = false) {
    message.textContent = text;
    message.classList.toggle('error', error);
  }

  function sourceText() {
    // A textarea normalizes CRLF to LF when exposed through .value. Keep original
    // bytes' decoded text untouched until the user edits the input.
    return originalText === null ? input.value : originalText;
  }

  function outputEncoding(text) {
    return VbeCodec.chooseDownloadEncoding(text);
  }

  function clearResult() {
    result = null;
    output.value = '';
    details.textContent = '';
    resultMeta.textContent = 'Result download encoding: —';
    node('copy').disabled = true;
    node('download').disabled = true;
  }

  function refreshInputMeta() {
    const value = sourceText();
    node('downloadInput').disabled = value.length === 0;
    try {
      const chosen = outputEncoding(value);
      const reading = originalReadInfo
        ? `File read as ${label(originalReadInfo.encoding)} (${originalReadInfo.method}). `
        : 'Text input. ';
      inputMeta.textContent = `${reading}Input download encoding: ${label(chosen)}. (All characters, including comments, are considered.)`;
    } catch (error) {
      inputMeta.textContent = `Input cannot be saved: ${error.message}`;
      node('downloadInput').disabled = true;
    }
  }

  upload.addEventListener('change', async () => {
    const file = upload.files?.[0];
    if (!file) return;
    clearResult();
    originalText = null;
    originalReadInfo = null;
    if (file.size > 10 * 1024 * 1024) {
      upload.value = '';
      status('File exceeds the 10 MB limit.', true);
      refreshInputMeta();
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const loaded = VbeCodec.readFileAuto(bytes);
      originalText = loaded.text;
      originalReadInfo = loaded;
      fileName = (file.name.replace(/\.[^.]+$/, '') || 'script').replace(/[\\/:*?"<>|]/g, '_');
      input.value = loaded.text;
      refreshInputMeta();
      status(`File loaded as ${label(loaded.encoding)}. Input is ready for conversion.`);
      if (loaded.method.startsWith('Heuristic')) {
        details.textContent = 'Warning: Legacy code-page detection is probabilistic. Review the displayed text before converting.';
      }
    } catch (error) {
      originalText = null;
      originalReadInfo = null;
      input.value = '';
      upload.value = '';
      refreshInputMeta();
      status(`Import rejected: ${error.message}`, true);
    }
  });

  input.addEventListener('input', () => {
    originalText = null;
    originalReadInfo = null;
    upload.value = '';
    clearResult();
    refreshInputMeta();
    status('Choose Encode or Decode.');
  });

  function run(mode) {
    clearResult();
    lastMode = mode;
    try {
      let text = sourceText();
      if (!text) throw new Error('Select a file or enter text.');
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      if (mode === 'encode') VbeCodec.validateSourceControls(text);
      const target = outputEncoding(text);
      const codecEncoding = target === 'ascii' ? 'utf-8' : target;
      result = mode === 'encode'
        ? VbeCodec.encodeText(text, codecEncoding)
        : VbeCodec.decodeText(text, codecEncoding);
      if (mode === 'decode') VbeCodec.validateSourceControls(result.text);
      // The decoded text may be all-ASCII even if the encoded input was Unicode,
      // or vice versa. Always select the result's encoding independently.
      const bytes = VbeCodec.saveTextAuto(result.text);
      result.bytes = bytes.bytes;
      result.encoding = bytes.encoding;
      output.value = result.text;
      const ext = mode === 'encode' ? '.vbe' : '.vbs';
      node('copy').disabled = false;
      node('download').disabled = false;
      node('download').textContent = `Download Result ${ext}`;
      resultMeta.textContent = `Result download encoding: ${label(result.encoding)}.`;
      status(mode === 'encode'
        ? `VBE created. Download format: ${label(result.encoding)}.`
        : `Decoded ${result.blockCount} VBE block(s). Download format: ${label(result.encoding)}.`);
      details.textContent = result.warnings.length
        ? `Validation warning: ${result.warnings.join(' / ')}`
        : 'No metadata warnings. Windows Script Host execution has not been tested.';
    } catch (error) {
      status(`Conversion failed: ${error.message}`, true);
    }
  }

  node('encode').addEventListener('click', () => run('encode'));
  node('decode').addEventListener('click', () => run('decode'));
  node('validate').addEventListener('click', () => {
    try {
      const validation = VbeCodec.validateVbe(sourceText());
      status(validation.valid
        ? `VBE validation passed for ${validation.blocks} block(s). This is not an execution test.`
        : `VBE validation found ${validation.warnings.length} warning(s).`, !validation.valid);
      details.textContent = validation.warnings.length
        ? validation.warnings.join(' / ')
        : `Recovered source download encoding: ${label(validation.recoveredEncoding)}. Windows execution: Not tested.`;
    } catch (error) {
      status(`VBE validation failed: ${error.message}`, true);
      details.textContent = '';
    }
  });

  node('copy').addEventListener('click', async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      status('Result copied.');
    } catch {
      output.focus();
      output.select();
      status('Clipboard access was blocked. Press Ctrl+C to copy the selected text.', true);
    }
  });

  function download(bytes, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  node('downloadInput').addEventListener('click', () => {
    try {
      const text = sourceText();
      if (!text) throw new Error('Input is empty.');
      if (!text.includes('#@~^')) VbeCodec.validateSourceControls(text);
      const stored = VbeCodec.saveTextAuto(text);
      const isVbe = text.includes('#@~^') && text.includes('^#~@');
      download(stored.bytes, `${fileName}${isVbe ? '.vbe' : '.vbs'}`);
      status(`Input saved as ${label(stored.encoding)}. This is a text-based export, not an unchanged original-byte copy.`);
    } catch (error) { status(`Download failed: ${error.message}`, true); }
  });

  node('download').addEventListener('click', () => {
    if (!result) return;
    const extension = lastMode === 'encode' ? '.vbe' : '.vbs';
    download(result.bytes, `${fileName}${extension}`);
    status(`Result saved as ${label(result.encoding)}.`);
  });

  function sample(text, name, notice) {
    originalText = text;
    originalReadInfo = null;
    input.value = text;
    upload.value = '';
    fileName = name;
    clearResult();
    refreshInputMeta();
    status(notice);
  }

  node('clear').addEventListener('click', () => {
    originalText = null;
    originalReadInfo = null;
    input.value = '';
    upload.value = '';
    fileName = 'script';
    clearResult();
    refreshInputMeta();
    status('Input and result cleared.');
  });
  node('samplePlain').addEventListener('click', () => sample(
    'Option Explicit\r\nWScript.Echo "Hello, 123"\r\n', 'ascii-test',
    'ASCII VBScript example loaded.'));
  node('sampleEncoded').addEventListener('click', () => sample(
    '#@~^DgAAAA==\\ko$K6,JC\x7fV^GJqAQAAA==^#~@', 'known-vbe',
    'Independent reference VBE sample loaded.'));
  node('sampleUnicode').addEventListener('click', () => sample(
    'Option Explicit\r\n\' 한글 / 日本語 / 中文 / Café / Emoji 😀 🚀\r\nWScript.Echo "Hello"\r\n',
    'unicode-comment-test', 'Unicode-in-comments test loaded. Download uses UTF-16 LE with BOM.'));

  refreshInputMeta();
})();
