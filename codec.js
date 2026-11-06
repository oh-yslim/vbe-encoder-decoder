/*
 * VBE Codec: standalone browser-side Microsoft Script Encoder implementation.
 * Substitution values based on the VBE format tables in public-domain work by
 * Didier Stevens: https://github.com/DidierStevens/DidierStevensSuite/blob/master/decode-vbe.py
 * No source code from 61106960/VBE-Decoder is copied into this project.
 */
const VbeCodec = (() => {
  'use strict';

  // Each triplet is a decoded byte for one encoded byte in ASCII 0x20..0x7F.
  const rows = [
    '2E2D32 477530 7A5221 566029 42715B 6A5E38 2F4933 265C3D',
    '496258 417D3A 342935 323665 5B2039 767C5C 727A56 437F73',
    '386B66 39634E 703345 452B6B 686862 715159 4F6678 09765E',
    '62317D 44644A 23546D 754371 4A4C41 7E3A60 4A4C41 5E7E53',
    '404C40 774542 4A2C27 612A48 5D7472 222775 4B3731 6F4437',
    '4E794D 3B5952 4C2F22 506F54 67266A 2A7247 7D6A64 74392D',
    '547B20 2B3F7F 2D382E 2C774C 30675D 6E537E 6B476C 66346F',
    '357879 255D74 213043 642326 4D5A76 525B25 636C24 3F482B',
    '7B5528 787023 296941 282E34 734C09 59212A 332444 7F4E3F',
    '6D5077 55093B 535655 7C7369 3A3561 5F6163 654B50 465867',
    '583B51 315749 69224F 6C6D46 5A4D68 48257C 272836 5C4670',
    '3D4A6E 24327A 79412F 373D5F 605F4B 514F5A 20422C 366557'
  ];
  const selectors = [
    0,1,2,0,1,2,1,2,2,1,2,1,0,2,1,2,
    0,2,1,2,0,0,1,2,2,1,0,2,1,2,2,1,
    0,0,2,1,2,1,2,0,2,0,0,1,2,0,2,1,
    0,2,1,2,0,0,1,2,2,0,0,1,2,0,2,1
  ];
  const escapeToByte = Object.freeze({ 35: 13, 38: 10, 33: 60, 42: 62, 36: 64 });
  const byteToEscape = Object.freeze({ 13: 35, 10: 38, 60: 33, 62: 42, 64: 36 });
  const decodeMap = Array.from({ length: 3 }, () => Uint8Array.from({ length: 128 }, (_, index) => index));
  const encodeMap = Array.from({ length: 3 }, () => Uint8Array.from({ length: 128 }, (_, index) => index));
  const triplets = rows.join(' ').split(' ');

  function transformable(byte) {
    return byte === 9 || (byte >= 32 && byte <= 127 && byte !== 60 && byte !== 62 && byte !== 64);
  }

  for (let encodedByte = 9; encodedByte < 128; encodedByte++) {
    if (!transformable(encodedByte)) continue;
    const hex = encodedByte === 9 ? '576E7B' : triplets[encodedByte - 32];
    for (let pick = 0; pick < 3; pick++) {
      const plainByte = parseInt(hex.slice(pick * 2, pick * 2 + 2), 16);
      decodeMap[pick][encodedByte] = plainByte;
      encodeMap[pick][plainByte] = encodedByte;
    }
  }

  const markers = /#@~\^([A-Za-z0-9+/]{6}==)([\s\S]*?)([A-Za-z0-9+/]{6}==)\^#~@/g;
  let reverseCp949 = null;

  function isDbcsLead(byte, encoding) {
    return encoding === 'euc-kr' && byte >= 0x81 && byte <= 0xfe;
  }

  function isDbcsTrail(byte) {
    return (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a) || (byte >= 0x81 && byte <= 0xfe);
  }

  function requireDbcsPair(bytes, index) {
    if (index + 1 >= bytes.length || !isDbcsTrail(bytes[index + 1])) {
      throw new Error(`CP949 문자가 ${index + 1}번째 바이트 부근에서 잘렸거나 잘못되었습니다.`);
    }
  }

  function normalizeEncoding(encoding, bytes) {
    if (!encoding || encoding === 'auto') return bytes ? detectEncoding(bytes) : 'utf-8';
    if (encoding === 'utf-8' || encoding === 'euc-kr') return encoding;
    throw new Error('지원하지 않는 문자 인코딩입니다.');
  }

  function binaryString(bytes) {
    const chunks = [];
    for (let index = 0; index < bytes.length; index += 16384) {
      chunks.push(String.fromCharCode(...bytes.subarray(index, index + 16384)));
    }
    return chunks.join('');
  }

  function binaryBytes(value) {
    const bytes = new Uint8Array(value.length);
    for (let index = 0; index < value.length; index++) bytes[index] = value.charCodeAt(index);
    return bytes;
  }

  function intToBase64(value) {
    return btoa(String.fromCharCode(
      value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255
    ));
  }

  function base64ToInt(value) {
    const decoded = atob(value);
    if (decoded.length !== 4) throw new Error('VBE 메타데이터(Base64)가 잘못되었습니다.');
    return (decoded.charCodeAt(0) | (decoded.charCodeAt(1) << 8) |
      (decoded.charCodeAt(2) << 16) | (decoded.charCodeAt(3) << 24)) >>> 0;
  }

  function encodedUnitCount(bytes, encoding) {
    let count = 0;
    for (let index = 0; index < bytes.length; index++) {
      const byte = bytes[index];
      if (isDbcsLead(byte, encoding)) {
        requireDbcsPair(bytes, index);
        index++;
      } else if (encoding === 'utf-8' && (byte & 0xc0) === 0x80) {
        continue;
      }
      count++;
    }
    return count;
  }

  function encodeBytes(inputBytes, encoding = 'utf-8') {
    const charset = normalizeEncoding(encoding, inputBytes);
    if (!(inputBytes instanceof Uint8Array)) throw new Error('바이트 데이터가 필요합니다.');
    const input = charset === 'utf-8' && inputBytes[0] === 0xef &&
      inputBytes[1] === 0xbb && inputBytes[2] === 0xbf ? inputBytes.subarray(3) : inputBytes;
    const payload = [];
    let checksum = 0;
    let index = 0;

    for (let pos = 0; pos < input.length; pos++) {
      let byte = input[pos];
      if (isDbcsLead(byte, charset)) {
        requireDbcsPair(input, pos);
        payload.push(byte, input[++pos]);
        continue;
      }
      if (byte < 128) {
        checksum = (checksum + byte) >>> 0;
        if (transformable(byte)) byte = encodeMap[selectors[index % 64]][byte];
        index++;
        if (Object.prototype.hasOwnProperty.call(byteToEscape, byte)) {
          payload.push(64, byteToEscape[byte]);
        } else {
          payload.push(byte);
        }
      } else {
        payload.push(byte);
      }
    }

    const bodyBytes = Uint8Array.from(payload);
    const units = encodedUnitCount(bodyBytes, charset);
    const result = `#@~^${intToBase64(units)}${binaryString(bodyBytes)}${intToBase64(checksum)}^#~@`;
    const resultBytes = binaryBytes(result);
    return { bytes: resultBytes, text: decodeCharacters(resultBytes, charset), encoding: charset,
      blockCount: 1, warnings: [], encodedUnits: units, checksum };
  }

  function decodePayload(bytes, charset) {
    const output = [];
    let index = 0;
    let checksum = 0;
    for (let pos = 0; pos < bytes.length; pos++) {
      let byte = bytes[pos];
      if (isDbcsLead(byte, charset)) {
        requireDbcsPair(bytes, pos);
        output.push(byte, bytes[++pos]);
        continue;
      }
      if (byte === 64) {
        if (pos + 1 >= bytes.length ||
            !Object.prototype.hasOwnProperty.call(escapeToByte, bytes[pos + 1])) {
          throw new Error(`VBE 이스케이프가 ${pos + 1}번째 바이트 부근에서 잘못되었습니다.`);
        }
        byte = escapeToByte[bytes[++pos]];
      } else if (byte < 128 && transformable(byte)) {
        byte = decodeMap[selectors[index % 64]][byte];
      }
      if (byte < 128) {
        index++;
        checksum = (checksum + byte) >>> 0;
      }
      output.push(byte);
    }
    return { bytes: Uint8Array.from(output), checksum };
  }

  function decodeBytes(source, encoding = 'auto') {
    if (!(source instanceof Uint8Array) || !source.length) {
      throw new Error('VBE 데이터를 입력하세요.');
    }
    const charset = normalizeEncoding(encoding, source);
    const original = binaryString(source);
    let count = 0;
    const warnings = [];
    markers.lastIndex = 0;
    const decoded = original.replace(markers, (match, len, payload, check) => {
      count++;
      const bytes = binaryBytes(payload);
      const result = decodePayload(bytes, charset);
      const declaredUnits = base64ToInt(len);
      const declaredChecksum = base64ToInt(check);
      const actualUnits = encodedUnitCount(bytes, charset);
      if (declaredUnits !== actualUnits) {
        warnings.push(`블록 ${count}: 길이 불일치 (헤더 ${declaredUnits}, 실제 ${actualUnits})`);
      }
      if (declaredChecksum !== result.checksum) {
        warnings.push(`블록 ${count}: 체크섬 불일치 (헤더 ${declaredChecksum}, 실제 ${result.checksum})`);
      }
      return binaryString(result.bytes);
    });
    if (count === 0) {
      throw new Error('유효한 VBE 블록(#@~^...^#~@)을 찾지 못했습니다. 파일 형식과 마커를 확인하세요.');
    }
    const resultBytes = binaryBytes(decoded);
    return { bytes: resultBytes, text: decodeCharacters(resultBytes, charset), encoding: charset,
      blockCount: count, warnings };
  }

  function detectEncoding(bytes) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return 'utf-8';
    } catch {
      return 'euc-kr';
    }
  }

  function decodeCharacters(bytes, charset) {
    try {
      return new TextDecoder(charset, { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder(charset).decode(bytes);
    }
  }

  function buildCp949Map() {
    if (reverseCp949) return reverseCp949;
    const reverse = new Map();
    const decoder = new TextDecoder('euc-kr', { fatal: true });
    for (let lead = 0x81; lead <= 0xfe; lead++) {
      for (let trail = 0x41; trail <= 0xfe; trail++) {
        if (!isDbcsTrail(trail)) continue;
        try {
          const character = decoder.decode(Uint8Array.of(lead, trail));
          if (character.length === 1 && !reverse.has(character)) {
            reverse.set(character, [lead, trail]);
          }
        } catch {
          // Ignore pairs not mapped by the browser's CP949 decoder.
        }
      }
    }
    reverseCp949 = reverse;
    return reverse;
  }

  function encodeCharacters(text, encoding) {
    if (encoding === 'utf-8') return new TextEncoder().encode(text);
    const reverse = buildCp949Map();
    const output = [];
    for (const character of text) {
      const code = character.codePointAt(0);
      if (code < 128) {
        output.push(code);
      } else {
        const pair = reverse.get(character);
        if (!pair) throw new Error(`CP949로 표현할 수 없는 문자: ${JSON.stringify(character)}`);
        output.push(...pair);
      }
    }
    return Uint8Array.from(output);
  }

  function encodeText(text, encoding = 'utf-8') {
    if (typeof text !== 'string') throw new Error('문자열을 입력하세요.');
    const charset = normalizeEncoding(encoding);
    return encodeBytes(encodeCharacters(text, charset), charset);
  }

  function decodeText(text, encoding = 'utf-8') {
    if (typeof text !== 'string') throw new Error('문자열을 입력하세요.');
    const charset = normalizeEncoding(encoding);
    return decodeBytes(encodeCharacters(text, charset), charset);
  }

  return Object.freeze({ encodeText, decodeText, encodeBytes, decodeBytes,
    encodeCharacters, decodeCharacters, detectEncoding });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = VbeCodec;
