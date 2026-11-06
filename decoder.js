/*
 * VBE Decoder — browser-compatible Microsoft Script Encoder decoder.
 * The format tables were checked against Didier Stevens's public-domain
 * decode-vbe.py: https://github.com/DidierStevens/DidierStevensSuite
 * No code from 61106960/VBE-Decoder is included.
 */

const VbeDecoder = (() => {
  'use strict';

  // Three candidate output bytes per encoded ASCII byte (0x20 through 0x7f).
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
  const triplets = rows.join(' ').split(' ');
  const selectors = [
    0,1,2,0,1,2,1,2,2,1,2,1,0,2,1,2,
    0,2,1,2,0,0,1,2,2,1,0,2,1,2,2,1,
    0,0,2,1,2,1,2,0,2,0,0,1,2,0,2,1,
    0,2,1,2,0,0,1,2,2,0,0,1,2,0,2,1
  ];
  const escaped = Object.freeze({ '#': 13, '&': 10, '!': 60, '*': 62, '$': 64 });
  const marker = /#@~\^([A-Za-z0-9+/]{6}==)([\s\S]*?)([A-Za-z0-9+/]{6}==)\^#~@/g;

  function isDbcsLead(byte, codePage) {
    if (codePage === 949) return byte >= 0x81 && byte <= 0xfe;
    return false;
  }

  function readUInt32(base64) {
    const binary = atob(base64);
    if (binary.length !== 4) throw new Error('VBE 메타데이터가 올바르지 않습니다.');
    return ((binary.charCodeAt(0)) |
      (binary.charCodeAt(1) << 8) |
      (binary.charCodeAt(2) << 16) |
      (binary.charCodeAt(3) << 24)) >>> 0;
  }

  function decodePayload(payload, codePage, byteMode) {
    const out = [];
    let selectorIndex = 0;
    let checksum = 0;
    let encodedUnits = 0;

    for (let i = 0; i < payload.length; i++) {
      let value = payload.charCodeAt(i);

      // A DBCS lead and its trail byte are preserved as a single character.
      if (byteMode && isDbcsLead(value, codePage)) {
        if (i + 1 >= payload.length) throw new Error('CP949 다중 바이트 문자가 잘렸습니다.');
        out.push(payload[i], payload[++i]);
        encodedUnits++;
        continue;
      }

      if (value === 64) {
        const next = payload[i + 1];
        if (!Object.prototype.hasOwnProperty.call(escaped, next)) {
          throw new Error('알 수 없는 VBE 이스케이프가 있습니다.');
        }
        value = escaped[next];
        i++;
        encodedUnits += 2;
      } else if (value < 128 || !byteMode) {
        encodedUnits++;
      } else if (codePage === 949 || (value & 0xc0) !== 0x80) {
        encodedUnits++;
      }

      if (value < 128) {
        if (value === 9) {
          value = [0x57, 0x6e, 0x7b][selectors[selectorIndex % 64]];
        } else if (value >= 32 && value <= 127 && value !== 60 && value !== 62 && value !== 64) {
          const hex = triplets[value - 32];
          value = parseInt(hex.slice(selectors[selectorIndex % 64] * 2, selectors[selectorIndex % 64] * 2 + 2), 16);
        }
        selectorIndex++;
        checksum = (checksum + value) >>> 0;
      }
      out.push(String.fromCharCode(value));
    }

    return { text: out.join(''), checksum, encodedUnits };
  }

  function decode(source, options = {}) {
    if (typeof source !== 'string' || source.length === 0) {
      throw new Error('VBE 데이터 또는 파일을 입력하세요.');
    }
    const codePage = options.codePage === 949 ? 949 : null;
    const byteMode = options.byteMode === true;
    const warnings = [];
    let blockCount = 0;
    marker.lastIndex = 0;

    const text = source.replace(marker, (_full, len, payload, sum) => {
      blockCount++;
      const decoded = decodePayload(payload, codePage, byteMode);
      const expectedLength = readUInt32(len);
      const expectedChecksum = readUInt32(sum);
      if (decoded.encodedUnits !== expectedLength) {
        warnings.push(`블록 ${blockCount}: 길이 검증 불일치 (헤더 ${expectedLength}, 계산 ${decoded.encodedUnits})`);
      }
      if (decoded.checksum !== expectedChecksum) {
        warnings.push(`블록 ${blockCount}: 체크섬 검증 불일치 (헤더 ${expectedChecksum}, 계산 ${decoded.checksum})`);
      }
      return decoded.text;
    });
    if (!blockCount) throw new Error('완전한 VBE 블록(#@~^ ... ^#~@)을 찾지 못했습니다.');
    return { text, blockCount, warnings };
  }

  function bytesToBinary(bytes) {
    let value = '';
    const chunkSize = 16384;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      value += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return value;
  }

  function binaryToBytes(binary) {
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function detectEncoding(bytes) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return 'utf-8';
    } catch {
      return 'euc-kr';
    }
  }

  function decodeFile(bytes, encoding = 'auto') {
    const selected = encoding === 'auto' ? detectEncoding(bytes) : encoding;
    const parsed = decode(bytesToBinary(bytes), { byteMode: true, codePage: selected === 'euc-kr' ? 949 : null });
    return { ...parsed, text: new TextDecoder(selected).decode(binaryToBytes(parsed.text)), encoding: selected };
  }

  return Object.freeze({ decode, decodeFile, detectEncoding });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = VbeDecoder;
