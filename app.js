/* Browser-only VBE encoder/decoder UI. User scripts are never executed. */
(() => {
  'use strict';

  const element = (id) => document.getElementById(id);
  const input = element('input');
  const output = element('output');
  const upload = element('upload');
  const inputEncoding = element('inputEncoding');
  const outputEncoding = element('outputEncoding');
  const message = element('message');
  const details = element('details');
  let fileBytes = null;
  let fileName = 'script';
  let result = null;
  let lastMode = 'decode';
  const charsetNames = { 'utf-8': 'UTF-8', 'euc-kr': 'CP949', 'shift_jis': 'CP932/Shift-JIS', 'gbk': 'CP936/GBK', 'big5': 'CP950/Big5', 'windows-1252': 'CP1252', 'utf-16le': 'UTF-16 LE', 'utf-16be': 'UTF-16 BE' };
  const charsetName = (value) => charsetNames[value] || value;

  function setStatus(text, error = false) {
    message.textContent = text;
    message.classList.toggle('error', error);
  }

  function resetResult() {
    result = null;
    output.value = '';
    details.textContent = '';
    element('copy').disabled = true;
    element('download').disabled = true;
  }

  function selectedInputEncoding() {
    return inputEncoding.value === 'auto'
      ? (fileBytes ? VbeCodec.detectEncoding(fileBytes) : 'utf-8')
      : inputEncoding.value;
  }

  function selectedOutputEncoding() {
    return outputEncoding.value === 'match'
      ? (fileBytes ? selectedInputEncoding() : 'utf-8')
      : outputEncoding.value;
  }

  function updateFilePreview() {
    if (!fileBytes) return;
    const charset = selectedInputEncoding();
    resetResult();
    try {
      input.value = VbeCodec.decodeCharacters(fileBytes, charset);
      setStatus(`File loaded. Text encoding: ${charsetName(charset)}. Change the selection if the preview looks incorrect.`);
    } catch (error) {
      input.value = '';
      setStatus(`Cannot display this file with the selected encoding: ${error.message}`, true);
    }
  }

  upload.addEventListener('change', async () => {
    const file = upload.files && upload.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      upload.value = '';
      setStatus('Please select a file smaller than 10 MB.', true);
      return;
    }
    try {
      fileBytes = new Uint8Array(await file.arrayBuffer());
      fileName = (file.name.replace(/\.[^.]+$/, '') || 'script').replace(/[\\/:*?"<>|]/g, '_');
      updateFilePreview();
    } catch (error) {
      setStatus(`Could not read the file: ${error.message}`, true);
    }
  });

  input.addEventListener('input', () => {
    fileBytes = null;
    upload.value = '';
    resetResult();
    setStatus('Choose Encode or Decode.');
  });
  inputEncoding.addEventListener('change', updateFilePreview);
  outputEncoding.addEventListener('change', resetResult);

  function convert(mode) {
    resetResult();
    lastMode = mode;
    try {
      if (!fileBytes && !input.value) throw new Error('Select a file or enter text.');
      const charset = selectedOutputEncoding();
      const sourceText = fileBytes
        ? VbeCodec.decodeCharacters(fileBytes, selectedInputEncoding())
        : input.value;
      result = mode === 'encode'
        ? VbeCodec.encodeText(sourceText, charset)
        : VbeCodec.decodeText(sourceText, charset);

      output.value = result.text;
      element('copy').disabled = false;
      element('download').disabled = false;
      const ext = mode === 'decode' ? '.vbs' : '.vbe';
      element('download').textContent = `Download ${ext}`;
      const charsetLabel = charsetName(result.encoding);
      setStatus(mode === 'encode'
        ? `VBE encoding completed (${charsetLabel}).`
        : `Decoded ${result.blockCount} VBE block(s) (${charsetLabel}).`);
      details.textContent = result.warnings.length
        ? `Notice: ${result.warnings.join(' / ')}`
        : mode === 'decode'
          ? 'No validation warnings. Decoding does not prove the original script is safe to execute.'
          : 'You can copy the result or save it to a file.';
    } catch (error) {
      setStatus(`Conversion failed: ${error.message}`, true);
    }
  }

  element('encode').addEventListener('click', () => convert('encode'));
  element('decode').addEventListener('click', () => convert('decode'));

  element('copy').addEventListener('click', async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setStatus('Result copied to clipboard.');
    } catch {
      output.focus();
      output.select();
      setStatus('Automatic copying was blocked. Press Ctrl+C to copy the selected result.', true);
    }
  });

  element('download').addEventListener('click', () => {
    if (!result) return;
    const ext = lastMode === 'decode' ? '.vbs' : '.vbe';
    const blob = new Blob([result.bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}${ext}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`${ext} download started. Result encoding: ${charsetName(result.encoding)}.`);
  });

  element('clear').addEventListener('click', () => {
    input.value = '';
    upload.value = '';
    fileBytes = null;
    fileName = 'script';
    resetResult();
    setStatus('Input and result cleared.');
  });

  function setSample(text, sampleName) {
    input.value = text;
    upload.value = '';
    fileBytes = null;
    fileName = sampleName;
    inputEncoding.value = 'auto';
    outputEncoding.value = 'utf-8';
    resetResult();
  }

  element('samplePlain').addEventListener('click', () => {
    setSample('MsgBox "Hello"', 'example');
    setStatus('Plain text sample loaded. Select Encode.');
  });
  element('sampleEncoded').addEventListener('click', () => {
    setSample('#@~^DgAAAA==\\ko$K6,JC\x7fV^GJqAQAAA==^#~@', 'example');
    setStatus('VBE example loaded. Select Decode.');
  });
  element('sampleUnicode').addEventListener('click', () => {
    setSample('Option Explicit\r\nWScript.Echo "한글 日本語 简体中文 繁體中文 Café Ελληνικά Русский 😀 🚀 ∑ ∞"\r\n', 'unicode-test');
    setStatus('Unicode source loaded. Use UTF-8 or UTF-16 LE; legacy encodings cannot represent all characters.');
  });
})();
