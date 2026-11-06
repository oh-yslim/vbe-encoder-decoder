/* Browser-only interface. User-supplied scripts are never executed. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const input = $('input');
  const output = $('output');
  const upload = $('upload');
  const encoding = $('encoding');
  const message = $('message');
  const details = $('details');
  let fileBytes = null;
  let fileName = 'decoded';
  let currentText = '';

  function status(text, isError = false) {
    message.textContent = text;
    message.classList.toggle('error', isError);
  }

  function clearResults() {
    output.value = '';
    currentText = '';
    details.textContent = '';
    $('copy').disabled = true;
    $('download').disabled = true;
  }

  function showFile() {
    if (!fileBytes) return;
    const selected = encoding.value === 'auto'
      ? VbeDecoder.detectEncoding(fileBytes) : encoding.value;
    input.value = new TextDecoder(selected).decode(fileBytes);
    clearResults();
    status(`파일을 읽었습니다. 입력 인코딩: ${selected === 'euc-kr' ? 'CP949' : 'UTF-8'}`);
  }

  upload.addEventListener('change', async () => {
    const file = upload.files && upload.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      upload.value = '';
      status('10MB 이하의 파일을 선택하세요.', true);
      return;
    }
    try {
      fileBytes = new Uint8Array(await file.arrayBuffer());
      fileName = file.name.replace(/\.[^.]+$/, '') || 'decoded';
      showFile();
    } catch (error) {
      status(`파일을 읽지 못했습니다: ${error.message}`, true);
    }
  });

  input.addEventListener('input', () => {
    fileBytes = null;
    upload.value = '';
    clearResults();
    status('입력한 문자열을 디코딩할 수 있습니다.');
  });
  encoding.addEventListener('change', showFile);

  $('decode').addEventListener('click', () => {
    clearResults();
    try {
      const result = fileBytes
        ? VbeDecoder.decodeFile(fileBytes, encoding.value)
        : VbeDecoder.decode(input.value);
      currentText = result.text;
      output.value = result.text;
      $('copy').disabled = false;
      $('download').disabled = false;
      status(`${result.blockCount}개 VBE 블록을 디코딩했습니다.`);
      details.textContent = result.warnings.length
        ? `검증 경고: ${result.warnings.join(' / ')}\n손상된 입력이거나 인코딩 선택이 다른 경우 결과를 확인하세요.`
        : '길이 및 체크섬 검사 통과';
    } catch (error) {
      status(`디코딩 실패: ${error.message}`, true);
    }
  });

  $('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(currentText);
      status('결과를 클립보드에 복사했습니다.');
    } catch {
      output.focus();
      output.select();
      status('자동 복사가 제한되었습니다. 결과를 선택했으니 Ctrl+C를 누르세요.', true);
    }
  });

  $('download').addEventListener('click', () => {
    const blob = new Blob([currentText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileName}.vbs`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    status('UTF-8 형식으로 .vbs 파일 다운로드를 시작했습니다.');
  });

  $('clear').addEventListener('click', () => {
    input.value = '';
    upload.value = '';
    fileBytes = null;
    fileName = 'decoded';
    clearResults();
    status('입력과 결과를 지웠습니다.');
  });

  $('sample').addEventListener('click', () => {
    input.value = '#@~^DgAAAA==\\ko$K6,JC\x7fV^GJqAQAAA==^#~@';
    upload.value = '';
    fileBytes = null;
    fileName = 'sample-decoded';
    clearResults();
    status('예제를 불러왔습니다. 디코딩 버튼을 누르세요.');
  });
})();
