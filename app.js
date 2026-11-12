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
  const unverifiedRow = node('unverifiedRow');
  const allowUnverified = node('allowUnverified');
  const names = { ascii: 'ASCII', 'utf-8': 'UTF-8', 'utf-16le': 'UTF-16 LE with BOM',
    'utf-16be': 'UTF-16 BE', 'utf-32le': 'UTF-32 LE', 'utf-32be': 'UTF-32 BE',
    'euc-kr': 'CP949', shift_jis: 'Shift-JIS / CP932', gbk: 'GBK / CP936',
    big5: 'Big5 / CP950', 'windows-1252': 'Windows-1252',
    'raw-8bit': 'Native-compatible 8-bit bytes' };
  const label = (value) => names[value] || value;
  let originalText = null;
  let originalBytes = null;
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

  function unchangedFileInfo() {
    return originalBytes && originalReadInfo && originalText !== null
      ? originalReadInfo : null;
  }

  function writeResultWithOriginalEncoding(text, info) {
    const raw = originalBytes;
    const bom = (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) ||
      (raw[0] === 0xff && raw[1] === 0xfe) ||
      (raw[0] === 0xfe && raw[1] === 0xff) ||
      (raw.length >= 4 && raw[0] === 0 && raw[1] === 0 && raw[2] === 0xfe && raw[3] === 0xff);
    const charset = info.encoding;
    const bytes = VbeCodec.encodeCharacters(text, charset, bom);
    return { bytes, encoding: charset, bom };
  }

  function clearResult() {
    result = null;
    output.value = '';
    details.textContent = '';
    resultMeta.textContent = 'Result download encoding: —';
    node('copy').disabled = true;
    node('download').disabled = true;
    allowUnverified.checked = false;
    unverifiedRow.hidden = true;
  }

  function refreshInputMeta() {
    const value = sourceText();
    node('downloadInput').disabled = value.length === 0;
    try {
      const chosen = originalReadInfo?.rawByteView ? 'raw-8bit' : outputEncoding(value);
      const reading = originalReadInfo
        ? `File read as ${label(originalReadInfo.encoding)} (${originalReadInfo.method}). `
        : 'Text input. ';
      inputMeta.textContent = originalBytes && originalText === value
        ? `${reading}Unedited file: result preserves ${label(originalReadInfo.encoding)}. Input download retains original bytes. If edited, exports use ${label(chosen)}.`
        : `${reading}Input download encoding: ${label(chosen)}. (All characters, including comments, are considered.)`;
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
    originalBytes = null;
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
      originalBytes = bytes;
      originalReadInfo = loaded;
      input.readOnly = Boolean(loaded.rawByteView);
      fileName = (file.name.replace(/\.[^.]+$/, '') || 'script').replace(/[\\/:*?"<>|]/g, '_');
      input.value = loaded.text;
      refreshInputMeta();
      status(loaded.rawByteView ? 'Native 8-bit VBE loaded. The escaped-byte preview is read-only; Decode uses original bytes.' :
        `File loaded as ${label(loaded.encoding)}. Input is ready for conversion.`);
      if (loaded.terminalNul) {
        details.textContent = 'A trailing NUL after the VBE closing marker was detected; only diagnostic decoding will ignore it.';
      } else if (loaded.method.startsWith('Heuristic')) {
        details.textContent = 'Warning: Legacy code-page detection is probabilistic. Review the displayed text before converting.';
      }
    } catch (error) {
      originalText = null;
      originalBytes = null;
      originalReadInfo = null;
      input.readOnly = false;
      input.value = '';
      upload.value = '';
      refreshInputMeta();
      status(`Import rejected: ${error.message}`, true);
    }
  });

  input.addEventListener('input', () => {
    originalText = null;
    originalBytes = null;
    originalReadInfo = null;
    input.readOnly = false;
    upload.value = '';
    clearResult();
    refreshInputMeta();
    status('Choose Encode or Decode.');
  });

  function diagnosticText(report) {
    const lines = [];
    if (report.interpretation?.method === 'heuristic-native-byte-recovery') {
      lines.push('VBE interpretation: CP949 byte recovery (UNVERIFIED interpretation).');
      lines.push('Several legacy code pages pass format checks. Other possible interpretations: ' + report.interpretation.candidates.join(' | '));
    } else if (report.interpretation?.method === 'storage-byte-recovery') {
      lines.push(`VBE interpretation: STORAGE BYTE RECOVERY (${report.interpretation.label}).`);
      lines.push('Length/checksum match after byte-level processing. The native encoder may already have altered Unicode; character fidelity is NOT proven.');
    } else if (report.interpretation?.method === 'legacy-byte-reinterpretation') {
      lines.push(`VBE interpretation: ${report.interpretation.label} (automatic UTF-8 byte reinterpretation).`);
      lines.push('Length and checksum match after reinterpretation. Original character meanings and Windows execution are NOT guaranteed.');
    } else if (report.interpretation?.method === 'heuristic-legacy-byte-reinterpretation') {
      lines.push(`VBE interpretation: HEURISTIC PREVIEW via ${report.interpretation.label}.`);
      lines.push('Several code pages pass the length and checksum tests. This preview was selected based on a language-script signal and is NOT independently verified.');
      lines.push(`Other matching interpretations: ${report.interpretation.candidates.join(' | ')}`);
    } else if (report.interpretation?.method === 'ambiguous') {
      lines.push('VBE interpretation: AMBIGUOUS. Multiple legacy interpretations passed integrity checks; none was selected.');
      lines.push(`Matching alternatives: ${report.interpretation.candidates.join(' | ')}`);
    } else if (report.interpretation) {
      lines.push('VBE interpretation: as displayed (no byte reinterpretation).');
    }
    for (const block of report.diagnostics || []) {
      lines.push(`Block ${block.index}: encoded length ${block.declaredLength === null ? 'invalid' : block.declaredLength} / observed ${block.actualLength} (${block.lengthMatch ? 'MATCH' : 'MISMATCH'}).`);
      lines.push(`Block ${block.index}: checksum ${block.declaredChecksum === null ? 'invalid' : block.declaredChecksum} / calculated ${block.calculatedChecksum} (${block.checksumMatch ? 'MATCH' : 'MISMATCH'}).`);
      lines.push(`Block ${block.index}: ${block.encodedDelCount} encoded DEL character(s); ${block.encodedUnicodeUnits} non-ASCII encoded character(s). Encoded DEL is permitted.`);
    }
    if (report.controls?.count) {
      lines.push(`Recovered text: ${report.controls.count} unexpected control character(s), including ${report.controls.items.map(item => `${item.unicode} at position ${item.position}`).join(', ')}.`);
    } else {
      lines.push('Recovered text: no unusual control characters detected.');
    }
    for (const notice of report.notices || []) lines.push(`INFO: ${notice}`);
    for (const warning of report.warnings || []) lines.push(`WARNING: ${warning}`);
    lines.push('Windows Script Host execution: NOT TESTED. Do not execute unverified results.');
    return lines.join('\n');
  }

  function run(mode) {
    clearResult();
    lastMode = mode;
    try {
      let text = sourceText();
      if (!text) throw new Error('Select a file or enter text.');
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      if (mode === 'encode' && !unchangedFileInfo()?.rawByteView) VbeCodec.validateSourceControls(text);
      const uploadedInfo = unchangedFileInfo();
      const target = uploadedInfo?.rawByteView ? 'raw-8bit' : outputEncoding(text);
      const codecEncoding = target === 'ascii' ? 'utf-8' : target;
      if (mode === 'encode') {
        if (uploadedInfo?.rawByteView) throw new Error('An encoded VBE cannot be used as native VBS input. Decode it first.');
        result = uploadedInfo ? VbeCodec.encodeNativeFile(originalBytes, uploadedInfo) :
          VbeCodec.encodeText(text, codecEncoding);
        if (/[\u0080-\uFFFF]/.test(text)) {
          result.warnings.push('Non-ASCII VBE output has not been proven byte-identical to native screnc.exe. Windows execution must be checked separately.');
        }
      } else {
        const byteCompatible = uploadedInfo &&
          !['utf-16le', 'utf-16be', 'utf-32le', 'utf-32be'].includes(uploadedInfo.encoding);
        const byteResult = byteCompatible
          ? VbeCodec.decodeStorageBytes(originalBytes, uploadedInfo.encoding)
          : null;
        result = byteResult && !byteResult.ambiguous
          ? byteResult : VbeCodec.decodeTextAuto(text);
      }
      const stored = (result.storageMode || (uploadedInfo?.rawByteView && mode === 'decode'))
        ? { bytes: result.bytes, encoding: result.encoding, bom: result.storageMode === 'unicode-file' && originalBytes[0] === 0xff }
        : uploadedInfo ? writeResultWithOriginalEncoding(result.text, uploadedInfo)
          : VbeCodec.saveTextAuto(result.text);
      result.bytes = stored.bytes;
      result.encoding = stored.encoding;
      output.value = result.text;
      const unverified = mode === 'decode' && !result.verified;
      unverifiedRow.hidden = !unverified;
      allowUnverified.checked = false;
      node('copy').disabled = Boolean(result.previewEscaped);
      node('download').disabled = unverified;
      const ext = mode === 'encode' ? '.vbe' : '.vbs';
      node('download').textContent = `Download Result ${ext}${unverified ? ' (Unverified)' : ''}`;
      const inherited = result.previewEscaped ? 'Escaped byte preview only; download to obtain exact VBE bytes. ' :
        uploadedInfo ? 'Original uploaded file format retained. ' : 'Automatic encoding from current characters. ';
      resultMeta.textContent = `Result download encoding: ${label(result.encoding)}${stored.bom ? ' (BOM)' : ''}. ${inherited}${unverified ? 'Recovery is UNVERIFIED.' : ''}`;
      if (mode === 'encode') {
        status(result.previewEscaped ? 'Native-style 8-bit VBE generated. Download the exact bytes; the displayed byte escapes are not a pasteable VBE.' :
          `VBE generated. Download format: ${label(result.encoding)}.${result.verified === false ? ' Native screnc.exe parity is not verified.' : ''}`);
        details.textContent = result.warnings.length ? result.warnings.join('\n') : 'Windows Script Host execution has not been tested.';
      } else if (unverified) {
        status(`Unverified recovery: ${result.blockCount} VBE block(s), ${result.warnings.length} warning(s). Recovered text is shown for inspection only.`, true);
        details.textContent = diagnosticText(result);
      } else {
        const reinterpretation = result.interpretation?.method === 'legacy-byte-reinterpretation';
        const storageByteMode = result.interpretation?.method === 'storage-byte-recovery';
        status(storageByteMode
          ? `Recovered ${result.blockCount} VBE block(s) from storage bytes. VBE metadata matches, but the original Unicode text is NOT independently verified.`
          : reinterpretation
            ? `Recovered ${result.blockCount} VBE block(s) using automatic legacy-byte reinterpretation. Length and checksum match; character meaning and Windows execution are not guaranteed.`
            : `Decoded ${result.blockCount} VBE block(s). Format checks passed; Windows execution is untested.`);
        details.textContent = diagnosticText(result);
      }
    } catch (error) {
      result = null;
      status(`Conversion failed: ${error.message}`, true);
    }
  }

  allowUnverified.addEventListener('change', () => {
    node('download').disabled = !(result && lastMode === 'decode' && !result.verified && allowUnverified.checked);
  });

  node('encode').addEventListener('click', () => run('encode'));
  node('decode').addEventListener('click', () => run('decode'));
  node('validate').addEventListener('click', () => {
    try {
      const validation = originalReadInfo?.rawByteView ? (() => {
        const report = VbeCodec.decodeStorageBytes(originalBytes, 'raw-8bit');
        if (!report || report.ambiguous) throw new Error('No uniquely verified interpretation found for the uploaded raw VBE.');
        return { blocks: report.blockCount, warnings: report.warnings, valid: report.verified,
          diagnostics: report.diagnostics, controls: report.controls,
          interpretation: report.interpretation };
      })() : VbeCodec.validateVbe(sourceText());
      status(validation.valid
        ? `VBE format checks passed for ${validation.blocks} block(s). This is not an execution test.`
        : `VBE is unverified: ${validation.warnings.length} warning(s).`, !validation.valid);
      details.textContent = diagnosticText(validation);
    } catch (error) {
      status(`VBE validation failed: ${error.message}`, true);
      details.textContent = '';
    }
  });

  node('copy').addEventListener('click', async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      status(result.verified === false ? 'Unverified recovery copied. Do not execute without independent verification.' : 'Result copied.');
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
      if (!text.includes('#@~^') && !originalReadInfo?.rawByteView) VbeCodec.validateSourceControls(text);
      const isVbe = (text.includes('#@~^') && text.includes('^#~@')) || Boolean(originalReadInfo?.rawByteView);
      if (originalBytes && originalText === text) {
        download(originalBytes, `${fileName}${isVbe ? '.vbe' : '.vbs'}`);
        status('Input downloaded byte-for-byte unchanged from the uploaded file.');
      } else {
        const stored = VbeCodec.saveTextAuto(text);
        download(stored.bytes, `${fileName}${isVbe ? '.vbe' : '.vbs'}`);
        status(`Input saved as ${label(stored.encoding)}.`);
      }
    } catch (error) { status(`Download failed: ${error.message}`, true); }
  });

  node('download').addEventListener('click', () => {
    if (!result || node('download').disabled) return;
    const extension = lastMode === 'encode' ? '.vbe' : '.vbs';
    download(result.bytes, `${fileName}${extension}`);
    status(result.verified === false ? `UNVERIFIED output saved as ${label(result.encoding)}. Do not execute.` : `Result saved as ${label(result.encoding)}.`);
  });

  function sample(text, name, notice) {
    originalText = text;
    originalBytes = null;
    originalReadInfo = null;
    input.readOnly = false;
    input.value = text;
    upload.value = '';
    fileName = name;
    clearResult();
    refreshInputMeta();
    status(notice);
  }

  node('clear').addEventListener('click', () => {
    originalText = null;
    originalBytes = null;
    originalReadInfo = null;
    input.readOnly = false;
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
