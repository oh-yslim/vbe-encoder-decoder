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
  // Non-ASCII UTF-16 code units neither advance the selector nor contribute to the checksum.
  // This behavior is verified against the Windows Scripting.Encoder COM reference.
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

  const dbcsPairValidCache = new Map();

  function validDbcsPair(lead, trail, encoding) {
    if (!isDbcsLead(lead, encoding) || !isDbcsTrail(trail, encoding)) return false;
    const key = `${encoding}:${lead}:${trail}`;
    if (dbcsPairValidCache.has(key)) return dbcsPairValidCache.get(key);
    let valid = false;
    try {
      const value = new TextDecoder(encoding, { fatal: true }).decode(Uint8Array.of(lead, trail));
      valid = value.length > 0 && !value.includes('\uFFFD');
    } catch { /* Invalid two-byte code-page sequence. */ }
    dbcsPairValidCache.set(key, valid);
    return valid;
  }

  function normalizeEncoding(encoding, bytes) {
    if (!encoding || encoding === 'auto') return bytes ? detectEncoding(bytes) : 'utf-8';
    if (['utf-8', 'euc-kr', 'shift_jis', 'gbk', 'big5', 'windows-1252', 'utf-16le', 'utf-16be', 'utf-32le', 'utf-32be'].includes(encoding)) return encoding;
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
      if (code < 128) checksum = (checksum + code) >>> 0;
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
      if (plainCode < 128) checksum = (checksum + plainCode) >>> 0;
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

  // Diagnostic decoding is intentionally separate from integrity validation.
  // Never claim that a decoded script is safe or executable just because text was recovered.
  function sourceControlIssues(text, maximum = 12) {
    const issues = [];
    let count = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if ((code < 32 && code !== 9 && code !== 10 && code !== 13) ||
          code === 127 || (code >= 128 && code <= 159)) {
        count++;
        if (issues.length < maximum) {
          issues.push({ position: i + 1, unicode: `U+${code.toString(16).toUpperCase().padStart(4, '0')}` });
        }
      }
    }
    return { count, items: issues };
  }

  function decodeText(source, encoding = 'utf-8') {
    if (typeof source !== 'string') throw new Error('Text input is required.');
    const charset = normalizeEncoding(encoding);
    const warnings = [];
    const notices = [];
    const diagnostics = [];
    let blockCount = 0;
    // Some native COM encoder outputs have a single NUL after the closing marker.
    // Only this exact placement is treated as a terminator, not NULs inside a payload.
    const hasTerminalNul = source.endsWith('^#~@\0');
    const input = hasTerminalNul ? source.slice(0, -1) : source;
    if (hasTerminalNul) {
      notices.push('One terminal NUL after the VBE closing marker was ignored for decoding.');
    }
    markers.lastIndex = 0;
    const decoded = input.replace(markers, (match, declaredLength, payload, declaredChecksum) => {
      blockCount++;
      const result = decodePayload(payload);
      const length = base64ToInt(declaredLength);
      const checksum = base64ToInt(declaredChecksum);
      const block = {
        index: blockCount,
        declaredLength: length,
        actualLength: payload.length,
        declaredChecksum: checksum,
        calculatedChecksum: result.checksum,
        encodedDelCount: [...payload].filter(ch => ch.charCodeAt(0) === 127).length,
        encodedUnicodeUnits: [...payload].filter(ch => ch.charCodeAt(0) > 127).length,
        lengthMatch: length !== null && length === payload.length,
        checksumMatch: checksum !== null && checksum === result.checksum
      };
      diagnostics.push(block);
      if (!block.lengthMatch) {
        warnings.push(`Block ${blockCount}: encoded-body length mismatch (${length === null ? 'invalid' : length} vs ${payload.length}).`);
      }
      if (!block.checksumMatch) {
        warnings.push(`Block ${blockCount}: checksum mismatch (${checksum === null ? 'invalid' : checksum} vs ${result.checksum}).`);
      }
      return result.plain;
    });
    if (!blockCount) throw new Error('No VBE block (#@~^...^#~@) found.');
    validateScalarText(decoded);
    const controls = sourceControlIssues(decoded);
    if (controls.count > 0) {
      warnings.push(`Decoded text contains ${controls.count} unusual control character(s). Review the recovery before use.`);
    }
    const verified = warnings.length === 0;
    // Encoding selection affects input/output bytes, never the character substitution.
    const bytes = encodeCharacters(decoded, charset, isUtf16(charset));
    return { text: decoded, bytes, encoding: charset, blockCount, warnings, notices,
      diagnostics, controls, terminalNulIgnored: hasTerminalNul, verified };
  }

  // Recover VBE substitutions from storage bytes before interpreting recovered text.
  // In legacy Windows code pages, a DBCS lead byte and its trail byte occupy
  // one VBE logical unit. Treating both bytes as separate Unicode characters
  // can change the selector position and corrupt otherwise intact ASCII.
  function decodeBytePayload(payload, codePage) {
    const output = [];
    let selectorIndex = 0;
    let checksum = 0;
    let encodedUnits = 0;
    for (let i = 0; i < payload.length; i++) {
      const byte = payload[i];
      if (codePage && i + 1 < payload.length && validDbcsPair(byte, payload[i + 1], codePage)) {
        output.push(byte, payload[++i]);
        encodedUnits++;
        continue;
      }
      if (byte >= 128) {
        output.push(byte);
        encodedUnits++;
        continue;
      }
      let plain = byte;
      if (byte === 64) {
        const suffix = payload[++i];
        if (!Object.prototype.hasOwnProperty.call(escapeToByte, suffix)) {
          throw new Error('Invalid VBE byte escape.');
        }
        plain = escapeToByte[suffix];
        encodedUnits += 2;
      } else {
        if (transformable(byte)) plain = decodeMap[selectors[selectorIndex % 64]][byte];
        encodedUnits++;
      }
      output.push(plain);
      checksum = (checksum + plain) >>> 0;
      selectorIndex++;
    }
    return { bytes: Uint8Array.from(output), checksum, encodedUnits };
  }

  function decodeStorageBytes(bytes, storageEncoding = 'utf-8') {
    if (!(bytes instanceof Uint8Array)) throw new Error('Byte input is required.');
    const input = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? bytes.subarray(3) : bytes;
    // This path is for ASCII-compatible file encodings. UTF-16/32 are first
    // converted to displayed Unicode text by the normal importer.
    const asBytes = Array.from(input, byte => String.fromCharCode(byte)).join('');
    const pattern = /#@~\^([A-Za-z0-9+/]{6}==)([\s\S]*?)([A-Za-z0-9+/]{6}==)\^#~@/g;
    const candidates = [];
    const options = [
      ['euc-kr', 'Korean DBCS / CP949'],
      ['gbk', 'Chinese DBCS / CP936'],
      ['shift_jis', 'Japanese DBCS / CP932'],
      ['big5', 'Traditional Chinese DBCS / CP950'],
      [null, 'Single-byte / UTF-8 byte scan']
    ];
    for (const [codePage, description] of options) {
      const output = [];
      let lastEnd = 0;
      let blocks = 0;
      let valid = true;
      const diagnostics = [];
      pattern.lastIndex = 0;
      for (const match of asBytes.matchAll(pattern)) {
        blocks++;
        const offset = match.index;
        for (let i = lastEnd; i < offset; i++) output.push(input[i]);
        const payloadOffset = offset + 12;
        const payload = input.subarray(payloadOffset, payloadOffset + match[2].length);
        let transformed;
        try { transformed = decodeBytePayload(payload, codePage); }
        catch { valid = false; break; }
        const declaredLength = base64ToInt(match[1]);
        const declaredChecksum = base64ToInt(match[3]);
        const lengthMatch = declaredLength === transformed.encodedUnits;
        const checksumMatch = declaredChecksum === transformed.checksum;
        diagnostics.push({ index: blocks, declaredLength, actualLength: transformed.encodedUnits,
          declaredChecksum, calculatedChecksum: transformed.checksum,
          lengthMatch, checksumMatch,
          encodedDelCount: Array.from(payload).filter(byte => byte === 127).length,
          encodedUnicodeUnits: Array.from(payload).filter(byte => byte >= 128).length });
        if (!lengthMatch || !checksumMatch) { valid = false; break; }
        output.push(...transformed.bytes);
        lastEnd = offset + match[0].length;
      }
      if (!blocks || !valid) continue;
      for (let i = lastEnd; i < input.length; i++) {
        if (!(i === input.length - 1 && input[i] === 0 && asBytes.slice(0, -1).endsWith('^#~@'))) {
          output.push(input[i]);
        }
      }
      const recoveredBytes = Uint8Array.from(output);
      let text = null;
      let recoveredEncoding = storageEncoding;
      const decoders = [...new Set([storageEncoding, 'utf-8'])];
      for (const decoder of decoders) {
        try {
          text = decodeCharacters(recoveredBytes, decoder === 'ascii' ? 'utf-8' : decoder);
          if (sameBytes(encodeCharacters(text, decoder === 'ascii' ? 'utf-8' : decoder), recoveredBytes)) {
            recoveredEncoding = decoder;
            break;
          }
          text = null;
        } catch { text = null; }
      }
      if (text === null) continue;
      try { validateScalarText(text); }
      catch { continue; }
      const controls = sourceControlIssues(text);
      if (controls.count) continue;
      candidates.push({ text, codePage, description, diagnostics, controls,
        recoveredEncoding, recoveredBytes });
    }
    if (!candidates.length) return null;
    const distinct = [];
    for (const candidate of candidates) {
      const same = distinct.find(item => item.text === candidate.text &&
        sameBytes(item.recoveredBytes, candidate.recoveredBytes));
      if (same) same.descriptions.push(candidate.description);
      else distinct.push({ ...candidate, descriptions: [candidate.description] });
    }
    if (distinct.length !== 1) return { ambiguous: true,
      candidates: distinct.map(item => item.descriptions.join(' / ')) };
    const chosen = distinct[0];
    return {
      text: chosen.text,
      bytes: chosen.recoveredBytes,
      encoding: chosen.recoveredEncoding,
      blockCount: chosen.diagnostics.length,
      warnings: [],
      notices: ['Byte-oriented VBE metadata matched. This does not prove that screnc.exe preserved the original Unicode text.'],
      diagnostics: chosen.diagnostics,
      controls: chosen.controls,
      verified: true,
      interpretation: {
        method: 'storage-byte-recovery',
        label: chosen.descriptions.join(' / '),
        candidates: chosen.descriptions,
        candidateCount: chosen.descriptions.length,
        note: 'Encoded bytes were processed before decoding recovered script text.'
      }
    };
  }

  // Decode the displayed Unicode text normally first. Only if its integrity
  // checks fail, interpret its UTF-8 byte representation with legacy code pages.
  // This handles VBE data whose original encoded-body metadata was computed
  // after an ANSI/DBCS interpretation of the UTF-8 bytes. It is not a general
  // purpose character-encoding detection algorithm.
  function decodeTextAuto(source) {
    let direct = null;
    let directError = null;
    try { direct = decodeText(source); }
    catch (error) { directError = error; }
    if (direct) {
      direct.interpretation = {
        method: 'direct',
        label: 'Unicode text as displayed',
        candidateCount: 0
      };
      if (direct.verified) return direct;
    }
    if (!/[\u0080-\uFFFF]/.test(source)) {
      if (directError) throw directError;
      return direct;
    }

    validateScalarText(source);
    const bytes = new TextEncoder().encode(source.replace(/^\uFEFF/, ''));
    const byteResult = decodeStorageBytes(bytes, 'utf-8');
    if (byteResult && !byteResult.ambiguous) return byteResult;

    const candidates = [];
    const codePages = [
      ['euc-kr', 'Korean (CP949-compatible browser decoder)'],
      ['shift_jis', 'Japanese (Shift-JIS / CP932)'],
      ['gbk', 'Chinese (GBK / CP936)'],
      ['big5', 'Chinese (Big5 / CP950)'],
      ['windows-1252', 'Western European (Windows-1252)']
    ];
    for (const [encoding, label] of codePages) {
      try {
        // Fatal decoding prevents silent U+FFFD replacement. Round-trip
        // verification prevents accepting a noncanonical byte mapping.
        const candidateText = decodeCharacters(bytes, encoding);
        if (candidateText === source) continue;
        if (!sameBytes(bytes, encodeCharacters(candidateText, encoding))) continue;
        const report = decodeText(candidateText, encoding);
        if (report.verified && report.controls.count === 0) {
          candidates.push({ encoding, label, report });
        }
      } catch {
        // Reject this code-page candidate without changing the input.
      }
    }

    const distinct = [];
    for (const item of candidates) {
      const existing = distinct.find(candidate => candidate.report.text === item.report.text);
      if (existing) existing.labels.push(item.label);
      else distinct.push({ ...item, labels: [item.label] });
    }
    if (distinct.length === 1) {
      const selected = distinct[0];
      return {
        ...selected.report,
        interpretation: {
          method: 'legacy-byte-reinterpretation',
          label: selected.labels.join(' / '),
          encoding: selected.encoding,
          candidateCount: 1,
          note: 'Encoded UTF-8 bytes were interpreted as a legacy code page to match the VBE length and checksum. Original language and Windows execution are not guaranteed.'
        }
      };
    }
    if (distinct.length > 1) {
      if (!direct) {
        throw new Error('Several alternate code pages decode successfully, but the direct VBE input could not be parsed. No source was selected.');
      }
      // Metadata alone cannot distinguish a Korean DBCS interpretation from
      // a Chinese one: non-ASCII units are excluded from the VBE checksum.
      // A strong script-language signal may select a diagnostic PREVIEW only.
      // Such a preview is never marked verified and requires confirmation
      // before it can be downloaded.
      const languageCounts = text => {
        let hangul = 0, kana = 0;
        for (const character of text) {
          const cp = character.codePointAt(0);
          if (cp >= 0xac00 && cp <= 0xd7a3) hangul++;
          else if ((cp >= 0x3040 && cp <= 0x30ff) ||
                   (cp >= 0xff66 && cp <= 0xff9f)) kana++;
        }
        return { hangul, kana };
      };
      const annotated = distinct.map(candidate => ({
        ...candidate, counts: languageCounts(candidate.report.text)
      }));
      const selected = annotated.find(candidate => {
        const key = candidate.encoding === 'euc-kr' ? 'hangul'
          : candidate.encoding === 'shift_jis' ? 'kana' : null;
        if (!key || candidate.counts[key] < 8) return false;
        return annotated.every(other => other === candidate ||
          candidate.counts[key] >= (other.counts[key] * 3 + 4));
      });
      const names = annotated.map(candidate => candidate.labels.join(' / '));
      if (selected) {
        return {
          ...selected.report,
          verified: false,
          warnings: [
            `Multiple legacy code pages pass VBE integrity checks. Showing a heuristic ${selected.label} preview, which is NOT independently verified.`
          ],
          interpretation: {
            method: 'heuristic-legacy-byte-reinterpretation',
            label: selected.label,
            encoding: selected.encoding,
            candidateCount: distinct.length,
            candidates: names,
            note: 'The preview was selected from a strong language-script signal, not from a unique proof of the original code page. Confirm decoded text independently.'
          }
        };
      }
      direct.verified = false;
      direct.warnings.push('Multiple legacy interpretations pass VBE integrity checks but recover different text. No interpretation was automatically selected.');
      direct.interpretation = {
        method: 'ambiguous',
        label: 'Multiple interpretations',
        candidateCount: distinct.length,
        candidates: names
      };
    } else if (direct) {
      direct.interpretation.candidateCount = 0;
    }
    if (directError) throw directError;
    return direct;
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
    if (encoding === 'utf-8') {
      const bytes = new TextEncoder().encode(text);
      return withBom ? Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes]) : bytes;
    }
    if (encoding === 'ascii') {
      if (!/^[\x00-\x7f]*$/.test(text)) throw new Error('Non-ASCII character cannot be written as ASCII.');
      return Uint8Array.from(text, character => character.charCodeAt(0));
    }
    if (encoding === 'utf-32le' || encoding === 'utf-32be') {
      validateScalarText(text);
      const bytes = [];
      const little = encoding === 'utf-32le';
      if (withBom) bytes.push(...(little ? [255, 254, 0, 0] : [0, 0, 254, 255]));
      for (const symbol of text) {
        const code = symbol.codePointAt(0);
        if (little) bytes.push(code & 255, (code >>> 8) & 255, (code >>> 16) & 255, code >>> 24);
        else bytes.push(code >>> 24, (code >>> 16) & 255, (code >>> 8) & 255, code & 255);
      }
      return Uint8Array.from(bytes);
    }
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

  // Output format is based exclusively on the text, not its original file encoding.
  // Check the entire text, including VBScript comments and quoted literals.
  function chooseDownloadEncoding(text) {
    if (typeof text !== 'string') throw new Error('Text input is required.');
    validateScalarText(text);
    return /^[\x00-\x7f]*$/.test(text) ? 'ascii' : 'utf-16le';
  }

  function validateSourceControls(text) {
    validateScalarText(text);
    for (let i = 0; i < text.length; i++) {
      const unit = text.charCodeAt(i);
      if ((unit < 32 && ![9, 10, 13].includes(unit)) || unit === 127 ||
          (unit >= 128 && unit <= 159)) {
        throw new Error(`Invalid source control character U+${unit.toString(16).toUpperCase().padStart(4, '0')} at position ${i + 1}.`);
      }
    }
  }

  function saveTextAuto(text) {
    const encoding = chooseDownloadEncoding(text);
    // Encoded VBE bodies may contain DEL (0x7f). Text is not a VBScript source
    // until it has been decoded, so control validation happens separately.
    const bytes = encoding === 'ascii'
      ? Uint8Array.from(text, character => character.charCodeAt(0))
      : encodeCharacters(text, 'utf-16le', true);
    return { encoding, bytes, bom: encoding === 'utf-16le' };
  }

  function decodeUtf32(bytes, littleEndian, start) {
    if ((bytes.length - start) % 4) throw new Error('Truncated UTF-32 data.');
    const points = [];
    for (let index = start; index < bytes.length; index += 4) {
      const cp = littleEndian
        ? ((bytes[index] | (bytes[index + 1] << 8) | (bytes[index + 2] << 16) | (bytes[index + 3] << 24)) >>> 0)
        : (((bytes[index] << 24) | (bytes[index + 1] << 16) | (bytes[index + 2] << 8) | bytes[index + 3]) >>> 0);
      if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
        throw new Error(`Invalid UTF-32 code point at byte ${index + 1}.`);
      }
      points.push(cp);
    }
    // Avoid stack overflow for large files.
    let result = '';
    for (let index = 0; index < points.length; index += 4096) {
      result += String.fromCodePoint(...points.slice(index, index + 4096));
    }
    return result;
  }

  function encodeTextForDetection(text, charset) {
    if (charset === 'windows-1252') return encodeCharacters(text, charset);
    return encodeCharacters(text, charset);
  }

  function sameBytes(first, second) {
    return first.length === second.length && first.every((byte, index) => byte === second[index]);
  }

  // Only a single NUL immediately following a complete VBE closing marker
  // is a permissible input terminator; embedded NULs remain invalid.
  function plausibleImportedText(text) {
    const hasTerminalNul = text.endsWith('^#~@\0');
    return plausibleScriptText(hasTerminalNul ? text.slice(0, -1) : text);
  }

  function plausibleScriptText(text) {
    if (!text.length || text.includes('\ufffd')) return false;
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if ((code < 32 && code !== 9 && code !== 10 && code !== 13) ||
          (code >= 128 && code <= 159)) return false;
    }
    return true;
  }

  function scoreLegacyText(text, charset) {
    let hangul = 0, kana = 0, han = 0, latin = 0, odd = 0;
    for (const symbol of text) {
      const cp = symbol.codePointAt(0);
      if ((cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0x1100 && cp <= 0x11ff)) hangul++;
      else if ((cp >= 0x3040 && cp <= 0x30ff) || (cp >= 0xff66 && cp <= 0xff9f)) kana++;
      else if (cp >= 0x3400 && cp <= 0x9fff) han++;
      else if ((cp >= 0xc0 && cp <= 0x024f) || cp === 0x20ac) latin++;
      else if (cp > 127) odd++;
    }
    const tailored = charset === 'euc-kr' ? hangul * 8 :
      charset === 'shift_jis' ? kana * 8 :
      charset === 'windows-1252' ? latin * 7 :
      (charset === 'gbk' || charset === 'big5') ? han * 2 : 0;
    const mismatch = charset === 'euc-kr' ? kana * 2 :
      charset === 'shift_jis' ? hangul * 2 :
      charset === 'windows-1252' ? (han + hangul + kana) * 3 : hangul * 4 + kana * 3;
    return tailored + han - mismatch - odd;
  }

  // Strict import: BOM and valid Unicode are deterministic. Legacy code pages
  // are heuristic and are accepted only if there is one clear winning candidate.
  // A roundtrip check prevents replacement-character corruption, but cannot
  // mathematically prove which legacy code page was used.
  function readFileAuto(bytes) {
    if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error('The file is empty.');
    const b = bytes;
    const starts = (...values) => values.every((value, index) => b[index] === value);
    let text, encoding, method;
    if (b.length >= 4 && starts(0xff, 0xfe, 0, 0)) {
      encoding = 'utf-32le'; text = decodeUtf32(b, true, 4); method = 'UTF-32 BOM';
    } else if (b.length >= 4 && starts(0, 0, 0xfe, 0xff)) {
      encoding = 'utf-32be'; text = decodeUtf32(b, false, 4); method = 'UTF-32 BOM';
    } else if (b.length >= 3 && starts(0xef, 0xbb, 0xbf)) {
      encoding = 'utf-8'; text = new TextDecoder('utf-8', { fatal: true }).decode(b); method = 'UTF-8 BOM';
    } else if (b.length >= 2 && starts(0xff, 0xfe)) {
      encoding = 'utf-16le'; text = new TextDecoder('utf-16le', { fatal: true }).decode(b); method = 'UTF-16 BOM';
    } else if (b.length >= 2 && starts(0xfe, 0xff)) {
      encoding = 'utf-16be'; text = new TextDecoder('utf-16be', { fatal: true }).decode(b); method = 'UTF-16 BOM';
    } else if (b.every(value => value < 128 && value !== 0) ||
        (b[b.length - 1] === 0 && b.subarray(0, -1).every(value => value > 0 && value < 128) &&
        new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(0, -1)).endsWith('^#~@'))) {
      encoding = 'ascii';
      // TextDecoder avoids argument count limits for long ASCII files.
      text = new TextDecoder('utf-8', { fatal: true }).decode(b); method = 'ASCII bytes';
    } else {
      const size = b.length;
      // Recognize BOM-free UTF-16/32 only when there are clear NUL alignment patterns.
      if (size >= 12 && size % 4 === 0) {
        const positions = [0, 0, 0, 0];
        const count = Math.min(256, size);
        for (let i = 0; i < count; i++) if (b[i] === 0) positions[i % 4]++;
        const frames = count / 4;
        const likely32le = positions[2] >= frames * 0.8 && positions[3] >= frames * 0.8;
        const likely32be = positions[0] >= frames * 0.8 && positions[1] >= frames * 0.8;
        if (likely32le !== likely32be) {
          try {
            text = decodeUtf32(b, likely32le, 0);
            encoding = likely32le ? 'utf-32le' : 'utf-32be'; method = 'UTF-32 byte pattern';
          } catch { /* Continue to other signatures. */ }
        }
      }
      if (!encoding && size >= 8 && size % 2 === 0) {
        let odd = 0, even = 0;
        const count = Math.min(size, 512);
        for (let i = 0; i < count; i++) {
          if (b[i] === 0) { if (i % 2) odd++; else even++; }
        }
        if (odd >= 4 && odd > even * 5 || even >= 4 && even > odd * 5) {
          const label = odd > even ? 'utf-16le' : 'utf-16be';
          try { text = new TextDecoder(label, { fatal: true }).decode(b); encoding = label; method = 'UTF-16 byte pattern'; }
          catch { /* Continue to UTF-8 or legacy candidates. */ }
        }
      }
      if (!encoding) {
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(b);
          if (plausibleImportedText(text)) { encoding = 'utf-8'; method = 'Valid UTF-8'; }
        } catch { /* Try legacy encodings. */ }
      }
      if (!encoding) {
        if (b.includes(0)) throw new Error('Undetermined Unicode encoding or binary data. No lossy import was performed.');
        const candidates = [];
        for (const label of ['euc-kr', 'shift_jis', 'gbk', 'big5', 'windows-1252']) {
          try {
            const candidate = decodeCharacters(b, label);
            if (!plausibleScriptText(candidate)) continue;
            if (!sameBytes(b, encodeTextForDetection(candidate, label))) continue;
            candidates.push({ encoding: label, text: candidate, score: scoreLegacyText(candidate, label) });
          } catch { /* Unsupported or irreversible encoding. */ }
        }
        candidates.sort((a, z) => z.score - a.score);
        const winner = candidates[0];
        if (!winner || winner.score < 8 || (candidates.length > 1 && winner.score - candidates[1].score < 7)) {
          throw new Error('File encoding is ambiguous. The file was not imported to avoid corrupting its characters. Use a BOM-tagged Unicode source file.');
        }
        text = winner.text; encoding = winner.encoding; method = 'Heuristic legacy encoding (not guaranteed)';
      }
    }
    validateScalarText(text);
    // Accept only a final NUL after a complete VBE closing marker. Keep the
    // original text for export; the diagnostic decoder ignores the terminator.
    const terminalNul = text.endsWith('^#~@\0');
    if (!plausibleImportedText(text)) {
      throw new Error('The file contains invalid text control characters or undecodable data.');
    }
    return { text, encoding, method, outputEncoding: chooseDownloadEncoding(text), terminalNul };
  }

  function validateVbe(source) {
    const result = decodeTextAuto(source);
    return { blocks: result.blockCount, warnings: result.warnings,
      valid: result.verified, recoveredEncoding: chooseDownloadEncoding(result.text),
      diagnostics: result.diagnostics, controls: result.controls,
      interpretation: result.interpretation,
      terminalNulIgnored: result.terminalNulIgnored };
  }

  return Object.freeze({ encodeText, decodeText, decodeTextAuto, decodeStorageBytes, encodeBytes, decodeBytes,
    encodeCharacters, decodeCharacters, detectEncoding, validateScalarText,
    validateSourceControls, chooseDownloadEncoding, saveTextAuto,
    readFileAuto, validateVbe, sourceControlIssues });

})();

if (typeof module !== 'undefined' && module.exports) module.exports = VbeCodec;
