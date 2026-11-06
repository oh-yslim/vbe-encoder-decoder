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
  const compatibleMarkers = /#@~\^.{6}==([\s\S]*?).{6}==\^#~@/g;
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

  function requireDbcsPair(bytes, index, encoding) {
    if (index + 1 >= bytes.length || !isDbcsTrail(bytes[index + 1], encoding)) {
      throw new Error(`Truncated or invalid ${encoding} multibyte sequence near byte ${index + 1}.`);
    }
  }

  function normalizeEncoding(encoding, bytes) {
    if (!encoding || encoding === 'auto') return bytes ? detectEncoding(bytes) : 'utf-8';
    if (['utf-8', 'euc-kr', 'shift_jis', 'gbk', 'big5', 'windows-1252', 'utf-16le', 'utf-16be'].includes(encoding)) return encoding;
    throw new Error(`Unsupported text encoding: ${encoding}`);
  }

  function isUtf16(encoding) {
    return encoding === 'utf-16le' || encoding === 'utf-16be';
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
    if (decoded.length !== 4) throw new Error('Invalid VBE Base64 metadata.');
    return (decoded.charCodeAt(0) | (decoded.charCodeAt(1) << 8) |
      (decoded.charCodeAt(2) << 16) | (decoded.charCodeAt(3) << 24)) >>> 0;
  }

  function encodedUnitCount(bytes, encoding) {
    let count = 0;
    for (let index = 0; index < bytes.length; index++) {
      const byte = bytes[index];
      if (isDbcsLead(byte, encoding)) {
        requireDbcsPair(bytes, index, encoding);
        index++;
      } else if (encoding === 'utf-8' && (byte & 0xc0) === 0x80) {
        continue;
      }
      count++;
    }
    return count;
  }

  function encodeBytes(inputBytes, encoding = 'utf-8') {
    if (!(inputBytes instanceof Uint8Array)) throw new Error('Byte input is required.');
    const charset = normalizeEncoding(encoding, inputBytes);
    if (isUtf16(charset)) {
      const text = decodeCharacters(inputBytes, charset);
      const result = encodeText(text, 'utf-8');
      result.warnings.push(`Input was ${charset} and was converted to UTF-8 VBE. Legacy Windows Script Host compatibility is not guaranteed.`);
      return result;
    }
    const input = charset === 'utf-8' && inputBytes[0] === 0xef &&
      inputBytes[1] === 0xbb && inputBytes[2] === 0xbf ? inputBytes.subarray(3) : inputBytes;
    const payload = [];
    let checksum = 0;
    let index = 0;

    for (let pos = 0; pos < input.length; pos++) {
      let byte = input[pos];
      if (isDbcsLead(byte, charset)) {
        requireDbcsPair(input, pos, charset);
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
        requireDbcsPair(bytes, pos, charset);
        output.push(byte, bytes[++pos]);
        continue;
      }
      if (byte === 64) {
        if (pos + 1 >= bytes.length ||
            !Object.prototype.hasOwnProperty.call(escapeToByte, bytes[pos + 1])) {
          throw new Error(`Invalid VBE escape near byte ${pos + 1}.`);
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
      throw new Error('Enter VBE data.');
    }
    const charset = normalizeEncoding(encoding, source);
    if (isUtf16(charset)) {
      const text = decodeCharacters(source, charset);
      const result = decodeText(text, 'utf-8');
      result.warnings.push(`${charset} VBE text was transcoded to UTF-8.`);
      return result;
    }
    const actualSource = charset === 'utf-8' && source.length >= 3 && source[0] === 0xef &&
      source[1] === 0xbb && source[2] === 0xbf ? source.subarray(3) : source;
    const original = binaryString(actualSource);
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
        warnings.push(`Block ${count}: encoded length mismatch (declared ${declaredUnits}, actual ${actualUnits})`);
      }
      if (declaredChecksum !== result.checksum) {
        warnings.push(`Block ${count}: checksum mismatch (declared ${declaredChecksum}, actual ${result.checksum})`);
      }
      return binaryString(result.bytes);
    });
    if (count === 0) {
      throw new Error('No valid VBE block (#@~^...^#~@) was found. Check the format and markers.');
    }
    const resultBytes = binaryBytes(decoded);
    return { bytes: resultBytes, text: decodeCharacters(resultBytes, charset), encoding: charset,
      blockCount: count, warnings };
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

  function encodeCharacters(text, encoding) {
    if (encoding === 'utf-8') return new TextEncoder().encode(text);
    if (isUtf16(encoding)) {
      const bytes = [];
      const little = encoding === 'utf-16le';
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
        if (!bytes) throw new Error(`Character ${JSON.stringify(character)} cannot be represented in ${encoding}. Choose UTF-8 for a raw roundtrip or WSH-safe Encode for string literals.`);
        output.push(...bytes);
      }
    }
    return Uint8Array.from(output);
  }

  function encodeText(text, encoding = 'utf-8') {
    if (typeof text !== 'string') throw new Error('Text input is required.');
    const charset = normalizeEncoding(encoding);
    if (isUtf16(charset)) throw new Error('For UTF-16 text, upload a file. Use UTF-8 for pasted Unicode text.');
    return encodeBytes(encodeCharacters(text, charset), charset);
  }

  function decodeText(text, encoding = 'utf-8') {
    if (typeof text !== 'string') throw new Error('Text input is required.');
    const charset = normalizeEncoding(encoding);
    if (isUtf16(charset)) throw new Error('For pasted text, select UTF-8 or the original Windows code page.');
    return decodeBytes(encodeCharacters(text, charset), charset);
  }


  // Decode text with the same character-level substitution semantics as the
  // public-domain VBE reference decoder. This can recover externally generated
  // scripts that fail strict byte-level escape or metadata validation.
  function decodeTextCompatible(source, encoding = 'utf-8') {
    if (typeof source !== 'string') throw new Error('Text input is required.');
    const charset = normalizeEncoding(encoding);
    if (isUtf16(charset)) throw new Error('For UTF-16 VBE input, upload a file.');
    let count = 0;
    const warnings = [];
    const recovered = source.replace(compatibleMarkers, (match, payload) => {
      count++;
      const expanded = payload.replace(/@&/g, '\n').replace(/@#/g, '\r')
        .replace(/@\*/g, '>').replace(/@!/g, '<').replace(/@\$/g, '@');
      let index = -1;
      let plain = '';
      for (const character of expanded) {
        const code = character.codePointAt(0);
        if (code < 128) index++;
        if (code < 128 && transformable(code)) {
          plain += String.fromCharCode(decodeMap[selectors[index % 64]][code]);
        } else {
          plain += character;
        }
      }
      return plain;
    });
    if (!count) throw new Error('No VBE block was found. Check the marker format (#@~^...^#~@).');
    // Compare against the strict byte-oriented decoder when possible. Do not
    // discard recovered source solely because metadata validation fails.
    try {
      const strict = decodeText(source, charset);
      if (strict.text !== recovered) {
        warnings.push('Character-level and strict byte-level decoding differ. Verify the original code page.');
      }
      warnings.push(...strict.warnings);
    } catch (error) {
      warnings.push(`Strict verification unavailable: ${error.message}`);
    }
    const bytes = encodeCharacters(recovered, charset);
    return { text: recovered, bytes, encoding: charset, blockCount: count, warnings };
  }

  function decodeBytesCompatible(bytes, encoding = 'auto') {
    if (!(bytes instanceof Uint8Array)) throw new Error('Byte input is required.');
    const charset = normalizeEncoding(encoding, bytes);
    if (isUtf16(charset)) {
      const sourceText = decodeCharacters(bytes, charset);
      const recovered = decodeTextCompatible(sourceText, 'utf-8');
      recovered.warnings.push(`Input VBE was ${charset}; decoded output was converted to UTF-8.`);
      return recovered;
    }
    return decodeTextCompatible(decodeCharacters(bytes, charset), charset);
  }

  // Convert Unicode inside quoted VBScript literals to ASCII-only expressions.
  // This intentionally rejects any remaining non-ASCII outside strings.
  // It does not parse arbitrary VBScript grammar or validate execution.
  function unicodeLiteralsToAsciiSource(source) {
    if (typeof source !== 'string') throw new Error('Text input is required.');
    const value = source.charCodeAt(0) === 0xFEFF ? source.slice(1) : source;
    let output = '';
    let index = 0;
    while (index < value.length) {
      if (value[index] !== '"') {
        const code = value.charCodeAt(index);
        if (code > 127) {
          const prior = value.slice(0, index);
          const line = prior.split(/\r\n|\r|\n/).length;
          const column = index - Math.max(prior.lastIndexOf('\r'), prior.lastIndexOf('\n'));
          throw new Error(`Non-ASCII character outside a quoted string at line ${line}, column ${column}. Remove or rewrite it manually.`);
        }
        output += value[index++];
        continue;
      }
      const start = index++;
      let literal = '';
      let closed = false;
      while (index < value.length) {
        const character = value[index++];
        if (character === '"') {
          if (value[index] === '"') {
            literal += '"';
            index++;
          } else {
            closed = true;
            break;
          }
        } else {
          if (character === '\r' || character === '\n') {
            throw new Error('Unterminated or multiline VBScript string literal.');
          }
          literal += character;
        }
      }
      if (!closed) throw new Error('Unterminated VBScript string literal.');
      if (!/[\u0080-\uFFFF]/.test(literal)) {
        output += value.slice(start, index);
        continue;
      }
      const pieces = [];
      let buffer = '';
      const flush = () => {
        if (buffer) pieces.push(`"${buffer.replace(/"/g, '""')}"`);
        buffer = '';
      };
      for (let offset = 0; offset < literal.length; offset++) {
        const code = literal.charCodeAt(offset);
        if (code < 128) {
          buffer += literal[offset];
        } else {
          flush();
          pieces.push(`ChrW(&H${code.toString(16).toUpperCase().padStart(4, '0')})`);
        }
      }
      flush();
      output += `(${pieces.join(' & ')})`;
    }
    return output;
  }

  return Object.freeze({ encodeText, decodeText, encodeBytes, decodeBytes,
    decodeTextCompatible, decodeBytesCompatible, unicodeLiteralsToAsciiSource,
    encodeCharacters, decodeCharacters, detectEncoding });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = VbeCodec;
