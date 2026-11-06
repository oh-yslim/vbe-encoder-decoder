# VBE Codec (Encoder & Decoder)

A dependency-free, client-side Microsoft Script Encoder (`.vbe`) encoder and decoder. **Not encryption.**

## Features

- Encode VBScript text or `.vbs` files into `.vbe` blocks.
- Decode one or multiple `.vbe` blocks, including surrounding unencoded text.
- File uploads are handled locally in the browser; no data is transmitted to a server.
- Handles UTF-8 and CP949 (Windows Korean) input, with auto-detection for files.
- Preserves original file bytes and line endings for file conversion (except optional UTF-8 BOM removal on encoding).
- Download actual UTF-8 or CP949 bytes, rather than replacing them with UTF-8.
- Shows VBE header-length/checksum validation warnings on decoding.
- No third-party scripts, libraries, external network APIs, backend or build tools.

## Deploy on GitHub Pages (GitHub Free)

1. Create a **public** repository named `vbe-codec`, or rename your existing repository at **Settings > General > Repository name**.
2. Upload **the extracted contents**, not the ZIP itself, to the root of the `main` branch: `index.html`, `style.css`, `codec.js`, `app.js`, `.nojekyll`, and `README.md`.
3. Open **Settings > Pages > Build and deployment**.
4. Choose **Deploy from a branch**, then `main` and `/(root)`, and click **Save**.
5. Visit `https://YOUR-USERNAME.github.io/vbe-codec/` once GitHub Pages has finished publishing.

**Upgrading from v1:** delete the obsolete `decoder.js` if it exists, and replace `index.html`, `app.js`, and `style.css`. Add `codec.js` in the repository root. On a renamed repository, update old site links, because GitHub does not redirect project Pages URLs automatically.

## Running offline

Open `index.html` directly in a modern browser. The site requires browser APIs `TextEncoder`, `TextDecoder`, `Blob` and `atob`/`btoa`.

## Encoding and limitations

- The browser's `TextEncoder` writes UTF-8. For CP949 text entered via paste, this project builds a reversible code-page mapping using `TextDecoder('euc-kr')` and refuses unmappable characters rather than silently replacing them.
- Files are transformed at the original byte level. CP949 DBCS pairs are preserved as a unit. UTF-8 continuation bytes are not transformed.
- Auto-detection of file encoding prefers valid UTF-8 and otherwise tries CP949. This is a heuristic; choose CP949 manually if the preview or output looks incorrect.
- Browser textareas may normalize pasted line endings to LF. **For byte-exact CRLF handling, upload a file** rather than pasting text.
- The historical Windows Script Host/Script Encoder may not accept UTF-8 output containing non-ASCII characters. Select CP949 for legacy Korean Windows VBE files.
- Non-ASCII legacy encodings other than CP949 are not implemented. Encrypted files are not supported.
- Input size is limited by the UI to 10 MiB. The decoder handles multi-block data but is not a VBScript interpreter.
- Decoded code is never executed; review any recovered code before running it elsewhere.

## Tests

Run `node tests/test.js` to test the underlying encoder and decoder without installing dependencies. A public VBE sample from Didier Stevens is included in the tests.

## Attribution

VBE substitution/selector format tables were checked against [Didier Stevens's public-domain decoder](https://github.com/DidierStevens/DidierStevensSuite/blob/master/decode-vbe.py). This is a standalone implementation and is not a fork of `61106960/VBE-Decoder`.
