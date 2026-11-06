# VBE Codec v3.0.0 — Encoder & Decoder

Standalone, client-side VBE codec compatible with the Microsoft Script Encoder substitution format. **VBE is obfuscation, not encryption.** The app does not execute scripts or upload their contents to a server.

## What's new

- Encoding and decoding with local byte-preserving file input.
- An explicit choice of UTF-8, CP949/EUC-KR, CP932/Shift-JIS, CP936/GBK, CP950/Big5, and Windows-1252; decoding of UTF-16LE/UTF-16BE BOM files via text transcoding to UTF-8.
- Rejects incorrectly decoded Unicode instead of silently outputting replacement characters.
- Multi-block decoding, checksum and payload-length warnings, downloads, and Unicode demo.
- 21 regression tests, including real Unicode-rich VBScript fixtures, and a GitHub Actions **test-only** workflow.

## GitHub Pages deployment

Use a **public** repository named `vbe-codec` on GitHub Free.

1. Replace `index.html`, `app.js`, `codec.js`, `style.css`, and `README.md`; include `.nojekyll`, `.github/workflows/test.yml`, `tests/test.js`, and `test-samples/`.
2. Remove the obsolete `decoder.js` from v1 if it still exists. The v3 sources do not depend on it.
3. `Settings > Pages > Build and deployment`: set `Source = Deploy from a branch`, `Branch = main`, `Folder = /(root)`.
4. Make the changes in **one commit** with https://github.dev/ (press `.` on your repository) or Git locally. GitHub's basic upload page does not conveniently stage deletions with uploads.
5. The site's URL is `https://USERNAME.github.io/vbe-codec/`.

**The Actions workflow runs tests only, and does not gate GitHub Pages deployments.** To prevent publishing failing commits, later switch to an Actions deployment workflow that depends on the test job (or use a protected branch with required test checks and pull requests).

## Unicode and legacy encoding caution

VBE is a historical **byte-oriented** obfuscation format. Passing UTF-8 multilingual and emoji roundtrip tests in this web application **does not mean Windows Script Host will run those `.vbe` files**. Legacy Windows Script Host commonly depends on the system's ANSI code page. CP949, Shift-JIS, GBK, and Big5 each represent only subsets of Unicode; emoji often cannot be represented at all. For legacy execution, prefer the actual code page of the original script, and use `Unicode_Runtime_ASCII_Source.vbs` for a portable ASCII-source test.

`Unicode_Stress_Test_UTF8.vbs` contains real Unicode string literals with UTF-8 BOM. `Unicode_Stress_Test_UTF16LE.vbs` contains the same source encoded in UTF-16LE with BOM. The UTF-16 input file is **transcoded to UTF-8** by the codec; this preserves characters but not original bytes. The original UTF-8 BOM is removed when encoding. Windows Script Host execution compatibility is distinct from codec roundtrip correctness.

**Do not rely on Auto detection for existing East Asian VBE files.** It checks BOM and UTF-8 validity; when bytes do not form valid UTF-8 it defaults to CP949 as a heuristic. If the original file was produced on a Japanese or Chinese system, choose CP932, CP936, or CP950 explicitly. For copied text, select the original code page if known. Bad code-page selection can produce incorrect text even if the file passes checksum validation. Correctly reconstructing an unknown legacy script encoding cannot be guaranteed from an encoded byte stream alone.

Text areas may normalize line endings. Prefer file upload and download for exact CRLF byte comparisons.

## Regression tests

```sh
node --test tests/test.js
```

The project includes:

- `test-samples/Unicode_Stress_Test_UTF8.vbs` — UTF-8 BOM source with Hangul, Japanese, simplified/traditional Chinese, Latin diacritics, Greek, Cyrillic, Arabic, Hebrew, Devanagari, Thai, emoji, combining marks, mathematical symbols, 64-character selector rollover, and escape sequences.
- `test-samples/Unicode_Stress_Test_UTF16LE.vbs` — the same source in UTF-16LE with BOM.
- `test-samples/Korean_CP949_Test.vbs` — Windows Korean CP949 bytes.
- `test-samples/Unicode_Runtime_ASCII_Source.vbs` — ASCII-only VBScript source that builds Unicode text using `ChrW` (including an emoji surrogate pair).
- Matching `.vbe` files for the UTF-8, CP949, and ASCII-only fixtures, ready for direct Decode tests.

The tests are **roundtrip and format-vector tests**, not an independent compatibility certification with the original `screnc.exe`/Windows Script Host. Actual third-party VBE samples are needed to diagnose any remaining errors reported by a user.

## References

The substitution tables are checked against the public-domain decoder by Didier Stevens: https://github.com/DidierStevens/DidierStevensSuite/blob/master/decode-vbe.py

This project is an independent implementation, not a fork of `61106960/VBE-Decoder`.
