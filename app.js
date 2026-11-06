/* Browser-only VBE encoder/decoder UI. User scripts are never executed. */
(() => {
  'use strict';

  const element = (id) => document.getElementById(id);
  const input = element('input');
  const output = element('output');
  const upload = element('upload');
  const encoding = element('encoding');
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

  function selectedEncoding() {
    return encoding.value === 'auto'
      ? (fileBytes ? VbeCodec.detectEncoding(fileBytes) : 'utf-8')
      : encoding.value;
  }

  function updateFilePreview() {
    if (!fileBytes) return;
    const charset = selectedEncoding();
    resetResult();
    try {
      input.value = VbeCodec.decodeCharacters(fileBytes, charset);
      setStatus(`파일을 읽었습니다. 문자 인코딩: ${charsetName(charset)}. 인식이 잘못됐다면 직접 변경하세요.`);
    } catch (error) {
      input.value = '';
      setStatus(`선택한 인코딩으로 파일을 표시할 수 없습니다: ${error.message}`, true);
    }
  }

  upload.addEventListener('change', async () => {
    const file = upload.files && upload.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      upload.value = '';
      setStatus('10MB 이하의 파일을 선택하세요.', true);
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      fileBytes = bytes;
      fileName = (file.name.replace(/\.[^.]+$/, '') || 'script').replace(/[\\/:*?"<>|]/g, '_');
      updateFilePreview();
    } catch (error) {
      setStatus(`파일을 읽지 못했습니다: ${error.message}`, true);
    }
  });

  input.addEventListener('input', () => {
    fileBytes = null;
    upload.value = '';
    resetResult();
    setStatus('Encode 또는 Decode를 선택하세요.');
  });
  encoding.addEventListener('change', updateFilePreview);

  function convert(mode) {
    resetResult();
    lastMode = mode;
    try {
      if (!fileBytes && !input.value) throw new Error('파일을 선택하거나 내용을 입력하세요.');
      const charset = selectedEncoding();
      result = fileBytes
        ? mode === 'encode'
          ? VbeCodec.encodeBytes(fileBytes, charset)
          : VbeCodec.decodeBytes(fileBytes, charset)
        : mode === 'encode'
          ? VbeCodec.encodeText(input.value, charset)
          : VbeCodec.decodeText(input.value, charset);
      output.value = result.text;
      element('copy').disabled = false;
      element('download').disabled = false;
      const ext = mode === 'encode' ? '.vbe' : '.vbs';
      element('download').textContent = `${ext} 다운로드`;
      const charsetLabel = charsetName(result.encoding);
      setStatus(mode === 'encode'
        ? `VBE 인코딩 완료 (${charsetLabel})`
        : `${result.blockCount}개 VBE 블록 디코딩 완료 (${charsetLabel})`);
      details.textContent = result.warnings.length
        ? `주의: ${result.warnings.join(' / ')}\n손상된 VBE 데이터 또는 문자 인코딩 오류일 수 있습니다.`
        : mode === 'decode' ? 'VBE 메타데이터 길이 및 체크섬 검증 통과' : '결과를 복사하거나 .vbe 파일로 저장할 수 있습니다.';
    } catch (error) {
      setStatus(`변환 실패: ${error.message}`, true);
    }
  }

  element('encode').addEventListener('click', () => convert('encode'));
  element('decode').addEventListener('click', () => convert('decode'));

  element('copy').addEventListener('click', async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setStatus('결과를 클립보드에 복사했습니다.');
    } catch {
      output.focus();
      output.select();
      setStatus('자동 복사가 제한되었습니다. 결과가 선택된 상태이므로 Ctrl+C를 누르세요.', true);
    }
  });

  element('download').addEventListener('click', () => {
    if (!result) return;
    const ext = lastMode === 'encode' ? '.vbe' : '.vbs';
    const blob = new Blob([result.bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}${ext}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`${ext} 파일 저장을 시작했습니다. 문자 인코딩은 ${charsetName(result.encoding)}입니다.`);
  });

  element('clear').addEventListener('click', () => {
    input.value = '';
    upload.value = '';
    fileBytes = null;
    fileName = 'script';
    resetResult();
    setStatus('입력과 결과를 지웠습니다.');
  });

  function setSample(text, sampleName) {
    input.value = text;
    upload.value = '';
    fileBytes = null;
    fileName = sampleName;
    encoding.value = 'utf-8';
    resetResult();
  }

  element('samplePlain').addEventListener('click', () => {
    setSample('MsgBox "Hello"', 'example');
    setStatus('원문 예제를 불러왔습니다. Encode 버튼을 누르세요.');
  });
  element('sampleEncoded').addEventListener('click', () => {
    setSample('#@~^DgAAAA==\\ko$K6,JC\x7fV^GJqAQAAA==^#~@', 'example');
    setStatus('VBE 예제를 불러왔습니다. Decode 버튼을 누르세요.');
  });
  element('sampleUnicode').addEventListener('click', () => {
    setSample('Option Explicit\r\nWScript.Echo "한글 日本語 简体中文 繁體中文 Café Ελληνικά Русский 😀 🚀 ∑ ∞"\r\n', 'unicode-test');
    setStatus('다국어 원문을 불러왔습니다. UTF-8 Encode 후 결과를 Decode하세요. 레거시 Windows 실행 호환성과는 별개입니다.');
  });
})();
