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

  // VBE substitution works on Unicode code units, not encoded UTF-8 bytes.
  // Script Encoder declares the encoded body length, including both bytes of an escape.
  // Source character positions advance only for ASCII characters, not non-ASCII code units.
  const markers = /#@~\^(.{6}==)([\s\S]*?)(.{6}==)\^#~@/g;
  const escapeToChar = Object.freeze({ '#': '\r', '&': '\n', '!': '<', '*': '>', '$': '@' });
  const charToEscape = Object.freeze({ '\r': '#', '\n': '&', '<': '!', '>': '*', '@': '$' });
  const reverseLegacy = new Map();
  const cp1252Special = [
    '€', null, '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', null, 'Ž', null,
    null, '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', null, 'ž', 'Ÿ'
  ];

  function isDbcsLead(byte, encoding) {
    if (encoding === 'shift_jis') return (byte >= 0x81 && byte <= 0x9f) || (byte >= 0xe0 && byte <= 0xfc);
    if (encoding === 'euc-kr' || encoding === 'gbk' || encoding === 'big5') return byte >= 0x81 && byte <= 0xfe;
    return false;
  }

  function isDbcsTrail(byte, encoding) {
    if (encoding === 'euc-kr') return (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a) || (byte >= 0x81 && byte <= 0xfe);
    if (encoding === 'shift_jis') return (byte >= 0x40 && byte <= 0x7e) || (byte >= 0x80 && byte <= 0xfc);
    if (encoding === 'gbk') return (byte >= 0x40 && byte <= 0x7e) || (byte >= 0x80 && byte <= 0xfe);
    if (encoding === 'big5') return (byte >= 0x40 && byte <= 0x7e) || (byte >= 0xa1 && byte <= 0xfe);
    return false;
  }

  function normalizeEncoding(encoding, bytes) {
    if (!encoding || encoding === 'auto') return bytes ? detectEncoding(bytes) : 'utf-8';
    if (['utf-8', 'euc-kr', 'shift_jis', 'gbk', 'big5', 'windows-1252', 'utf-16le', 'utf-16be'].includes(encoding)) return encoding;
    throw new Error(`Unsupported text encoding: ${encoding}`);
  }

  function isUtf16(encoding) {
    return encoding === 'utf-16le' || encoding === 'utf-16be';
  }

  function intToBase64(value) {
    return btoa(String.fromCharCode(
      value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255
    ));
  }

  function base64ToInt(value) {
    try {
      const decoded = atob(value);
      if (decoded.length !== 4) return null;
      return (decoded.charCodeAt(0) | (decoded.charCodeAt(1) << 8) |
        (decoded.charCodeAt(2) << 16) | (decoded.charCodeAt(3) << 24)) >>> 0;
    } catch {
      return null;
    }
  }

  function validateScalarText(text) {
    for (let index = 0; index < text.length; index++) {
      const current = text.charCodeAt(index);
      if (current >= 0xd800 && current <= 0xdbff) {
        if (index + 1 >= text.length || text.charCodeAt(index + 1) < 0xdc00 ||
            text.charCodeAt(index + 1) > 0xdfff) {
          throw new Error(`Unpaired high surrogate at character ${index + 1}.`);
        }
        index++;
      } else if (current >= 0xdc00 && current <= 0xdfff) {
        throw new Error(`Unpaired low surrogate at character ${index + 1}.`);
      }
    }
  }

  function encodePayload(source) {
    const payload = [];
    let selectorIndex = 0;
    let checksum = 0;
    for (let i = 0; i < source.length; i++) {
      const code = source.charCodeAt(i);
      checksum = (checksum + code) >>> 0;
      const plain = source[i];
      if (Object.prototype.hasOwnProperty.call(charToEscape, plain)) {
        payload.push('@', charToEscape[plain]);
      } else if (code < 128) {
        const value = transformable(code) ? encodeMap[selectors[selectorIndex % 64]][code] : code;
        payload.push(String.fromCharCode(value));
      } else {
        payload.push(plain);
      }
      if (code < 128) selectorIndex++;
    }
    return { payload: payload.join(''), checksum, sourceUnits: source.length };
  }

  function decodePayload(payload) {
    let plain = '';
    let selectorIndex = 0;
    let checksum = 0;
    for (let i = 0; i < payload.length; i++) {
      let value = payload[i];
      if (value === '@') {
        const suffix = payload[++i];
        if (!Object.prototype.hasOwnProperty.call(escapeToChar, suffix)) {
          throw new Error(`Invalid VBE escape at encoded character ${i}.`);
        }
        value = escapeToChar[suffix];
      } else {
        const code = value.charCodeAt(0);
        if (code < 128 && transformable(code)) {
          value = String.fromCharCode(decodeMap[selectors[selectorIndex % 64]][code]);
        }
      }
      plain += value;
      const plainCode = value.charCodeAt(0);
      checksum = (checksum + plainCode) >>> 0;
      if (plainCode < 128) selectorIndex++;
    }
    return { plain, checksum };
  }

  function encodeText(source, encoding = 'utf-8') {
    if (typeof source !== 'string') throw new Error('Text input is required.');
    const charset = normalizeEncoding(encoding);
    validateScalarText(source);
    const prepared = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
    // Validate source representability in the selected file encoding first.
    // No fallback to replacement characters is permitted.
    encodeCharacters(prepared, charset);
    const transformed = encodePayload(prepared);
    const encoded = `#@~^${intToBase64(transformed.payload.length)}${transformed.payload}${intToBase64(transformed.checksum)}^#~@`;
    const bytes = encodeCharacters(encoded, charset, isUtf16(charset));
    const warnings = [];
    if (charset === 'utf-8' && /[^\x00-\x7f]/.test(prepared)) {
      warnings.push('UTF-8 preserves Unicode text, but Windows Script Host may not execute UTF-8 VBE files.');
    }
    return { text: encoded, bytes, encoding: charset, blockCount: 1, warnings,
      encodedUnits: transformed.payload.length, sourceUnits: transformed.sourceUnits, checksum: transformed.checksum };
  }

  function decodeText(source, encoding = 'utf-8') {
    if (typeof source !== 'string') throw new Error('Text input is required.');
    const charset = normalizeEncoding(encoding);
    const warnings = [];
    let blockCount = 0;
    markers.lastIndex = 0;
    const decoded = source.replace(markers, (match, declaredLength, payload, declaredChecksum) => {
      blockCount++;
      const result = decodePayload(payload);
      const length = base64ToInt(declaredLength);
      const checksum = base64ToInt(declaredChecksum);
      if (length !== null && length !== payload.length) {
        warnings.push(`Block ${blockCount}: encoded-body length mismatch (${length} vs ${payload.length}).`);
      }
      if (checksum !== null && checksum !== result.checksum) {
        warnings.push(`Block ${blockCount}: checksum mismatch (${checksum} vs ${result.checksum}).`);
      }
      if (length === null || checksum === null) {
        warnings.push(`Block ${blockCount}: noncanonical VBE metadata.`);
      }
      return result.plain;
    });
    if (!blockCount) throw new Error('No VBE block (#@~^...^#~@) found.');
    validateScalarText(decoded);
    // Encoding selection affects input/output bytes, never the character substitution.
    const bytes = encodeCharacters(decoded, charset, isUtf16(charset));
    return { text: decoded, bytes, encoding: charset, blockCount, warnings };
  }

  function encodeBytes(bytes, encoding = 'auto') {
    if (!(bytes instanceof Uint8Array)) throw new Error('Byte input is required.');
    const charset = normalizeEncoding(encoding, bytes);
    return encodeText(decodeCharacters(bytes, charset), charset);
  }

  function decodeBytes(bytes, encoding = 'auto') {
    if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error('Byte input is required.');
    const charset = normalizeEncoding(encoding, bytes);
    return decodeText(decodeCharacters(bytes, charset), charset);
  }

  function detectEncoding(bytes) {
    if (bytes.length >= 2) {
      if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
      if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
    }
    if (bytes.length >= 4) {
      let odd = 0;
      let even = 0;
      const sample = Math.min(bytes.length, 256);
      for (let i = 0; i < sample; i++) {
        if (bytes[i] === 0) { if (i & 1) odd++; else even++; }
      }
      if (odd >= 3 && odd >= 3 * (even + 1)) return 'utf-16le';
      if (even >= 3 && even >= 3 * (odd + 1)) return 'utf-16be';
    }
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return 'utf-8';
    } catch {
      // Legacy encodings cannot be reliably distinguished from raw bytes alone.
      return 'euc-kr';
    }
  }

  function decodeCharacters(bytes, charset) {
    if (charset === 'windows-1252') return Array.from(bytes, byte => {
      if (byte >= 0x80 && byte <= 0x9f) return cp1252Special[byte - 0x80] || String.fromCharCode(byte);
      return String.fromCharCode(byte);
    }).join('');
    try {
      return new TextDecoder(charset, { fatal: true }).decode(bytes);
    } catch {
      throw new Error(`Some bytes cannot be decoded as ${charset}. Select the original encoding manually.`);
    }
  }

  function buildLegacyMap(encoding) {
    if (reverseLegacy.has(encoding)) return reverseLegacy.get(encoding);
    const reverse = new Map();
    if (encoding === 'windows-1252') {
      for (let byte = 0x80; byte <= 0xff; byte++) {
        const character = byte <= 0x9f ? (cp1252Special[byte - 0x80] || String.fromCharCode(byte)) : String.fromCharCode(byte);
        reverse.set(character, [byte]);
      }
      reverseLegacy.set(encoding, reverse);
      return reverse;
    }
    const decoder = new TextDecoder(encoding, { fatal: true });
    for (let byte = 0x80; byte <= 0xff; byte++) {
      if (isDbcsLead(byte, encoding)) {
        for (let trail = 0x40; trail <= 0xfe; trail++) {
          if (!isDbcsTrail(trail, encoding)) continue;
          try {
            const character = decoder.decode(Uint8Array.of(byte, trail));
            if (Array.from(character).length === 1 && !reverse.has(character)) {
              reverse.set(character, [byte, trail]);
            }
          } catch {
            // Ignore invalid code-page byte pairs.
          }
        }
      } else {
        try {
          const character = decoder.decode(Uint8Array.of(byte));
          if (Array.from(character).length === 1 && !reverse.has(character)) reverse.set(character, [byte]);
        } catch {
          // Ignore unmappable single-byte values.
        }
      }
    }
    reverseLegacy.set(encoding, reverse);
    return reverse;
  }

  function encodeCharacters(text, encoding, withBom = false) {
    if (encoding === 'utf-8') return new TextEncoder().encode(text);
    if (isUtf16(encoding)) {
      const bytes = [];
      const little = encoding === 'utf-16le';
      if (withBom) bytes.push(...(little ? [255, 254] : [254, 255]));
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (little) bytes.push(code & 255, code >>> 8);
        else bytes.push(code >>> 8, code & 255);
      }
      return Uint8Array.from(bytes);
    }
    const reverse = buildLegacyMap(encoding);
    const output = [];
    for (const character of text) {
      const code = character.codePointAt(0);
      if (code < 128) output.push(code);
      else {
        const bytes = reverse.get(character);
        if (!bytes) {
          throw new Error(`Character ${JSON.stringify(character)} cannot be represented in ${encoding}. Use UTF-8 or UTF-16LE to preserve full Unicode.`);
        }
        output.push(...bytes);
      }
    }
    return Uint8Array.from(output);
  }

  return Object.freeze({ encodeText, decodeText, encodeBytes, decodeBytes,
    encodeCharacters, decodeCharacters, detectEncoding });

})();

if (typeof module !== 'undefined' && module.exports) module.exports = VbeCodec;
