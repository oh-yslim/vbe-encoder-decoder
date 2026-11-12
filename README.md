# VBE Codec v3.6.0

A self-contained Microsoft Script Encoder (`.vbs` / `.vbe`) tool for GitHub Pages. There is **no backend, no external JavaScript dependency, and no execution of submitted VBScript**. The interface, documentation, and source comments are in English. The project is an independently authored browser implementation of the publicly described VBE format, not a fork of the PowerShell repository.

VBE is **obfuscation, not encryption**. Do not execute untrusted scripts.

## v3.6.0: Independent legacy-byte interpretation for VBE decoding

The v3.5 decoder assumed that the Unicode characters displayed in the Input
were the same units that the Script Encoder used for its length and checksum.
This is not always true for encoded scripts stored as UTF-8 and later read as
an ANSI/DBCS code page by Windows Script Host.

The new `decodeTextAuto()`:

1. Decodes the displayed Unicode text directly. If all block lengths and
   checksums match and no unusual source controls are found, **stops**. Normal
   files and the existing independent VBE fixtures remain unchanged.
2. When direct integrity checks fail and the text contains non-ASCII units,
   obtains the UTF-8 byte representation and tests strict, byte-reversible
   legacy interpretations (CP949-compatible, Shift-JIS, GBK, Big5, Windows-1252).
3. Runs the same VBE marker, length, checksum and recovered-control checks on
   every interpretation. A candidate with even one mismatch is not accepted.
4. If exactly one **distinct decoded source** passes, displays it with the
   code page recorded in the diagnostic panel. Passing format checks **does
   not** establish the original semantic meaning or WSH execution.
5. If multiple distinct sources pass, the original code page is **not
   mathematically identifiable from the VBE checksum**: high Unicode units do
   not contribute to the checksum. Where a strong Hangul/Kana pattern is found,
   the UI shows a *heuristic, unverified preview* with a separate download
   acknowledgement. Otherwise the original, unverified direct interpretation
   stays visible. No manual encoding dropdown has been reintroduced.

**Warning:** The heuristic preview is not proof of the original character
encoding. It can be wrong. Never run a recovered script from an untrusted
source; compare with an independent decoder or known original when possible.

The user's original `N.vbe` is **not included** in this public project or any
fixture. It was locally checked using its original upload and two possible
code-page interpretations; both passed metadata tests in Chromium while
recovering different Unicode text. All published fixtures are synthetic and
contain no user data or tokens.

## Testing and release confidence

- `node --test tests/*.js`: 51 JavaScript regression tests passed locally.
- Headless Chromium UI checks: original `N.vbe` loaded, Unicode/DBCS
  reinterpretation recognized, candidate lengths/checksums matched, encoded
  DEL accepted, and unchanged uploaded Input bytes downloaded exactly.
- The existing GitHub Actions workflow continues to include Windows Script
  Host checks against trusted non-sensitive sample files. The v3.6 build has
  **not** been executed on a Windows runner in this session.
- Format validity is not a security assessment or an execution guarantee.

## Automatic encoding and download rules (retained from v3.4.0)

- **Download Input** and **Download Result** are separate actions. When an uploaded file is unchanged, Download Input preserves the uploaded bytes exactly; otherwise new text exports use the rules below.
- **No output code-page dropdown.** The text content alone determines download encoding:
  - If *every* character is in `U+0000`–`U+007F`, save ASCII without a BOM.
  - If *any* character is outside that range, save UTF-16 little-endian with exactly one `FF FE` BOM.
  - The entire text is analyzed, including **VBScript comments**, string literals, identifiers, Chinese/Japanese/Korean characters, Latin accents, and emoji.
- ASCII/UTF-16LE choice is applied **independently** to newly generated Input and Result text exports. An unchanged uploaded UTF-32 source is downloaded in its original UTF-32 bytes; after editing, ASCII-only content is exported as ASCII.
- Invalid source control characters are rejected (TAB, CR, and LF are allowed), and unpaired UTF-16 surrogates are rejected. Encoded `.vbe` data may legitimately contain `DEL` (U+007F), which is not incorrectly rejected during file import.
- File imports use original bytes: BOM first, then strong UTF-16/UTF-32 byte patterns, strict UTF-8, and finally conservative, verified legacy code-page detection. Ambiguous legacy encodings produce an error instead of a silent replacement.
- An uploaded file's full decoded content (including CRLF) is retained until edited, even if the browser textarea displays normalized newlines.
- A **Validate VBE** button checks marker format, decoded length/checksum warnings, and source control characters. This is **not** a Windows Script Host execution test.
- Windows interoperability tests retain the native `Scripting.Encoder` COM reference. A new Unicode-comments-only fixture is checked against the native encoder and executed with `cscript.exe` on GitHub's Windows runner.
- `Encode (WSH-safe)` and all `ChrW()` source-rewriting features remain absent.

## Output examples

| Source content | Download encoding |
| --- | --- |
| `WScript.Echo "Hello"` | ASCII, no BOM |
| `WScript.Echo "Hello"` plus `' 한글` comment | UTF-16 LE, BOM |
| `' 日本語 / 中文 / Café / 😀` | UTF-16 LE, BOM |
| Unicode source pasted from an old UTF-32 file | ASCII if text is ASCII-only; UTF-16LE otherwise |

This rule is about **download file encoding**, not the JavaScript string representation or the encoding originally used to read an uploaded file. It is a deliberate Windows Script Host interoperability preference. UTF-8 can represent all valid Unicode characters; using UTF-16LE here is not because UTF-8 lacks coverage.

## Reading files and auto-detection limits

`Read uploaded file as` and `Save result as` manual menus were removed. The importer checks:

1. UTF-32 LE/BE BOM, UTF-8 BOM, UTF-16 LE/BE BOM.
2. ASCII bytes (not including NUL) and likely BOM-less UTF-32/UTF-16 byte patterns.
3. Strict UTF-8 (`TextDecoder` with `fatal: true`).
4. Legacy CP949, Shift-JIS, GBK, Big5, or Windows-1252 only if the decoded content is plausible, re-encodes to exactly the same bytes, and a language-based heuristic identifies one clear candidate.

**Important limitations:** No library, strict parser, or round-trip check can always establish the original encoding of a BOM-less legacy text file. Multiple code pages may yield different valid strings from the same bytes. This application refuses uncertain files. To use such a file, convert it to a BOM-marked UTF-16/UTF-32 or a valid UTF-8 file with a trusted text editor *before* importing. Legacy detection is a conservative heuristic, not a general-purpose `chardet` replacement.

An uploaded file **is downloaded unchanged** using `Download Input` until you edit the Input. After editing or pasting new Input, new ASCII/UTF-16LE output encoding is selected from the entire text. `Download Result` is always a newly generated text export.

## Source structure

```text
index.html
style.css
codec.js
app.js
.nojekyll
README.md
tests/test-auto-io.js
tests/test-ui.js
tests/test-independent.js
tests/test.js
tests/windows/test-wsh-compat.ps1
test-samples/WSH_Probe_*.vbs

test-samples/WSH_Probe_*.vbe
.github/workflows/test.yml
```

## GitHub Pages deployment

1. Create a **public** repository (`vbe-codec` recommended) or open your existing repository.
2. Extract the ZIP and upload **the extracted files**, including the `.github` folder, to the repository root. Replace old files with the same names. Prefer `github.dev` to stage additions, changes, and deletions in a single commit.
3. Under **Settings → Pages**, choose **Deploy from a branch**, `main`, and `/(root)`.
4. Commit. Pages deploys the static site. The GitHub Actions workflow runs tests separately and **does not block branch-based Pages deployment**.

To run automated tests locally with Node.js 22+:

```sh
node --test tests/*.js
```

For Windows native-reference and real WSH execution tests (run only with trusted bundled fixtures):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\windows\test-wsh-compat.ps1
```

Do not pass untrusted visitor scripts to GitHub Actions or invoke `cscript.exe` from the browser. A browser-only GitHub Pages website cannot execute Windows Script Host locally.

## Verification status

- Published independent ASCII VBE decoding/encoding fixtures: included in automated tests.
- JavaScript tests cover Unicode only in comments, Unicode strings, emoji, ASCII, CRLF, UTF-32 imports, CP949 input, and VBE metadata.
- Browser UI was manually exercised in a Chromium sandbox using no network: ASCII and Unicode exports, Input/Result download, upload, Encode, and Decode.
- The **Windows interoperability job has not been run for this release in this development environment**. It must pass on GitHub Actions before compatibility is claimed for the newly added Unicode-comment fixture. Even a passing fixture suite does not guarantee arbitrary user scripts are safe or executable.

### Relevant references

- Microsoft Script Encoder / `Scripting.Encoder` COM interface (native reference available in Windows runner)
- Didier Stevens' public-domain VBE decoder: <https://github.com/DidierStevens/DidierStevensSuite/blob/master/decode-vbe.py>
- Web Encoding API: <https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder>

## v3.5.0: Diagnostic Decode and integrity isolation

The decoder can now show a **best-effort recovered text preview** even when an encoded
block fails its declared length, checksum, or recovered-control checks. It does **not**
claim that unverified output is correct, executable, or safe. This change is intended
to help compare output from independent decoders without treating a warning as a hard
failure to view the text.

- `Validate VBE` reports encoded body length, declared and computed checksums,
  the number of encoded DEL (`U+007F`) units, Unicode units in the encoded body,
  and unusual control characters in the decoded text. It does not execute code.
- `Decode` shows the recovered text even if there are integrity warnings. If the
  output is unverified, **Download Result** stays disabled until the user explicitly
  acknowledges the risk. Copying the output also displays a warning.
- One `NUL (U+0000)` immediately after the terminal `^#~@` marker is now accepted
  during file import and ignored only for decoding, with a warning. A NUL *inside*
  the encoded body is not silently stripped.
- Valid encoded `DEL` characters remain permitted. An unexpected control character
  in *decoded* script text is a warning and no longer prevents the diagnostic preview.
- Healthy inputs still use the original encoding/decoding and automatic download
  rules: ASCII only -> ASCII; any non-ASCII -> UTF-16 LE with BOM.
- Browser-only: the page never executes VBScript and never sends the script to a server.

### Important security and correctness notes

Unverified recovered scripts must not be executed without an independent review.
The tool never automatically repairs a mismatched header, checksum, or substitution
phase. A readable-looking script is not proof of valid decoding. A mismatch may be
due to an altered encoded body, a noncanonical producer, or an algorithmic mismatch.
Keep actual private or credential-bearing VBE files out of public repositories and
regression fixtures. Diagnostic details show numeric metadata rather than uploading
or logging script text.

The test suite includes synthetic, non-sensitive corrupted VBE cases, including
mismatched metadata, encoded DEL and a trailing NUL. Windows interoperability must
still be verified independently with the trusted GitHub Actions Windows runner.
