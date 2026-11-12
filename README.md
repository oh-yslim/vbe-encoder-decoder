# VBE Codec v3.7.0

A standalone, browser-only Microsoft Script Encoder (VBE) encoder and decoder for GitHub Pages. All interface text, documentation and code comments are English. No backend, package manager, external runtime dependency or execution of submitted scripts is required.

> VBE is obfuscation, not encryption. A valid checksum is not evidence that the script is benign. The website never runs a VBS/VBE file.

## Changes in v3.7.0

### Recover encoded storage bytes **before** interpreting Unicode

Older releases decoded a UTF-8 VBE as its displayed Unicode text, then tried decoding the *encoded text* as CP949/GBK. This sometimes produced valid-looking metadata but showed mojibake in comments and other Unicode characters.

`decodeStorageBytes()` is a separate, byte-oriented recovery route:

1. Detect encoded VBE markers in the original ASCII-compatible byte stream.
2. Try legacy DBCS byte-pair boundaries independently for CP949, GBK, Shift-JIS and Big5, plus the unpaired byte stream.
3. Decode ASCII substitution bytes using the VBE selector table. Preserve non-ASCII bytes and DBCS pairs unchanged.
4. Validate each candidate against the encoded-body length and checksum fields.
5. Decode the **recovered source bytes** with strict text decoding, preferring the imported storage encoding; do not convert the recovered data into CP949 just because CP949 was used to determine the VBE byte boundaries.
6. If several candidates yield identical recovered bytes, merge their labels; if the candidates yield different texts, do not silently declare one interpretation to be correct.

**Scope:** This byte route can correct the earlier `容붵...`-style display caused by interpreting UTF-8 bytes as CP949 *text*. It cannot reconstruct Unicode that was already altered or replaced by the source encoder or by an earlier conversion. Length/checksum matches prove only the respective metadata. For Unicode-heavy VBE files, independently compare the recovered content with the original script.

### Preserve the original **file encoding on Result export**, until the Input changes

For an uploaded file that has not been edited:

- **Download Input:** exact original uploaded bytes, including BOM or terminal NUL.
- **Download Result:** encode the new VBS/VBE text with the detected file encoding, preserving the presence or absence of a BOM. ASCII, UTF-8 (BOM or no BOM), UTF-16 LE/BE, UTF-32 LE/BE, and representable legacy encodings are handled. Unrepresentable characters cause an explicit error rather than replacement with `?`.
- The original text (and original CRLF) remains available to the conversion engine even when the browser's textarea visually normalizes newlines.

If the user **pastes** text or **edits** an uploaded Input, the old automatic output policy applies:

- All characters in `U+0000..U+007F`: ASCII without BOM.
- Any Unicode character outside that range, **including in comments**: UTF-16 LE with BOM (`FF FE`).

There is no manual output-encoding selector.

### Important native Encoder parity limitation

`encodeText()` is the existing Unicode-code-unit encoder. Its outputs match the included independent ASCII examples and earlier selected Windows tests, **but native `screnc.exe` does not necessarily produce the same output for complex UTF-8 Unicode**. Byte-oriented DBCS handling can change logical lengths and selector positions, and some legacy conversions lose characters. The page warns about this on Unicode Encode. v3.7.0 does **not** claim that it reproduces the native Encoder for all Unicode inputs.

The string "뭵" uses UTF-8 bytes `EB AD B5`, while its CP949 encoding uses `92 84`. Interpreting UTF-8 bytes with a DBCS parser can alter character boundaries; such damage must not be mistaken for Unicode-safe obfuscation.

The site does not attempt to reconstruct missing Unicode characters by guessing. When testing Windows execution compatibility, use `screnc.exe`/the native COM encoder and `cscript.exe` against **trusted** test samples in a controlled environment; do not send arbitrary visitor-provided scripts to GitHub Actions.

## Tests

Run the JavaScript tests with Node.js 22+:

```sh
node --test tests/*.js
```

A dedicated Windows runner check remains available at:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\windows\test-wsh-compat.ps1
```

The tests include synthetic ASCII, multilingual Unicode/emoji, CRLF, UTF-8/UTF-16/UTF-32 file formats, independent published ASCII VBE vectors, terminal-NUL handling, byte-verified recovery without mojibake and original-output-encoding retention until editing. **Private user-uploaded scripts, recovered credentials and tokens are not included** in the public distribution.

The JavaScript test suite passed locally for this build. Real WSH execution and byte-for-byte comparison with native `screnc.exe` for the newly reported extreme Unicode examples are still unverified. Automated browser DOM tests are included; a fresh, direct Chromium navigation could not be completed in the build sandbox because local navigation was blocked.

## Deployment to GitHub Pages

1. Create or open a public GitHub repository (for example, `vbe-codec`).
2. Extract the ZIP and upload the extracted files into the repository root, replacing older versions. For additions/deletions in one commit, use the `github.dev` editor (`.` shortcut).
3. Configure **Settings → Pages → Deploy from a branch → main → /(root)**.
4. Commit, confirm the GitHub Actions results, and visit the Pages site.

The workflow file `.github/workflows/test.yml` runs JavaScript and Windows native-reference tests. With `Deploy from a branch`, a test failure does not by itself prevent Pages from publishing, so check Actions before declaring a release stable.

## Source structure

```text
index.html
style.css
codec.js
app.js
.nojekyll
README.md
.github/workflows/test.yml
tests/*.js
tests/windows/test-wsh-compat.ps1
test-samples/
```

## References

- Microsoft: <https://learn.microsoft.com/en-us/windows/win32/intl/double-byte-character-sets>
- Didier Stevens' public-domain VBE decoder: <https://github.com/DidierStevens/DidierStevensSuite/blob/master/decode-vbe.py>
- Additional byte-oriented VBE comparison: <https://github.com/nao-sec/screnc.php> (MIT-licensed independent implementation; not copied into this project)
