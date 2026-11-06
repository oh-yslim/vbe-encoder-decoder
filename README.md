# VBE Decoder for GitHub Pages

A small, dependency-free, client-side VBE (Microsoft Script Encoder) decoder.

## Features

- Paste VBE text or select a `.vbe` file.
- Decode one or more VBE blocks without executing the script.
- Preserve surrounding non-VBE text.
- Copy the result or download a UTF-8 `.vbs` file.
- Read UTF-8 and CP949 input files (auto detection or manual selection).
- Entirely static: no backend, package manager, or third-party assets.

## Deploy to GitHub Pages

1. Create a new **public** GitHub repository named `vbe-decoder`.
2. Upload `index.html`, `style.css`, `decoder.js`, `app.js`, `.nojekyll`, and this `README.md` to the repository root on `main`.
3. Open **Settings > Pages**.
4. Select **Deploy from a branch**, branch `main`, directory `/(root)`, and click **Save**.
5. Open `https://YOUR-USERNAME.github.io/vbe-decoder/` after deployment.

You can also open `index.html` directly in a modern browser for offline use.

## Safety and limitations

This tool decodes obfuscation; it does not decrypt encrypted data. Decoded scripts are **not** run. Inspect any recovered code before executing it elsewhere. The downloaded file is UTF-8; older Windows Script Host environments may require re-saving it in a Windows-compatible encoding. Invalid/legacy encodings may require selecting CP949 manually. Auto detection uses UTF-8 validity then falls back to CP949; it does not detect every possible code page.

Input files are limited to 10 MiB by the user interface. The decoder reports length/checksum mismatches as warnings so damaged scripts can still be inspected.

## Credits

The VBE format substitution and selector tables were checked against Didier Stevens's [public-domain VBE decoder](https://github.com/DidierStevens/DidierStevensSuite/blob/master/decode-vbe.py). This project is a new standalone browser implementation, and is **not a fork** of `61106960/VBE-Decoder`.
