Option Explicit

' This script is for testing Unicode preservation and VBE metadata.
' Test source only: do not execute untrusted script files.

Dim symbols, i, message
symbols = Array( _
    "ASCII words: Alpha Beta Gamma 1234567890", _
    "한국어: 안녕하세요 한글 가나다라", _
    "日本語: こんにちは 世界 ひらがな カタカナ", _
    "简体中文: 你好，世界！", _
    "繁體中文: 你好，世界！", _
    "Latin: Café résumé naïve Straße Ångström", _
    "Greek: Ελληνικά Κόσμε", _
    "Cyrillic: Привет мир", _
    "Arabic: مرحبا بالعالم", _
    "Hebrew: שלום עולם", _
    "Hindi: नमस्ते दुनिया", _
    "Thai: สวัสดีครับ", _
    "Emoji: 😀 🚀 🧑‍💻 🌈 🇰🇷 🇯🇵", _
    "Symbols: ∑ ∞ √ ≠ ≤ ≥ € ₩ ™ ©", _
    "Escapes: @ < > ! # $ & *", _
    "ASCII after Unicode: XYZabc789", _
    "Mixed: A한B日C中D😀EéFΩG" _
)

For i = 0 To UBound(symbols)
    message = CStr(i + 1) & ": " & symbols(i)
    WScript.Echo message
Next

WScript.Echo "AfterUnicode-ASCII-Check-12345"
