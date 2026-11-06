Option Explicit

' Unicode literal stress test for reversible VBE conversion.
' Do not execute unknown scripts downloaded from other sources.
Dim categories, values, i
categories = Array( _
    "ASCII and punctuation", _
    "Korean Hangul", _
    "Japanese", _
    "Chinese Simplified", _
    "Chinese Traditional", _
    "Latin diacritics", _
    "Greek", _
    "Cyrillic", _
    "Arabic and Hebrew", _
    "Devanagari and Thai", _
    "Emoji", _
    "Mathematical and technical", _
    "Currency and symbols", _
    "Combining and normalization", _
    "Right-to-left example" _
)
values = Array( _
    "Hello, World! 0123456789 !@#$%^&*()_+-=[]{};:,.?/~", _
    "안녕하세요 한글 테스트 서울 대한민국", _
    "こんにちは 世界 日本語 カタカナ ひらがな", _
    "你好，世界！简体中文 编码测试", _
    "你好，世界！繁體中文 編碼測試", _
    "Café naïve façade Straße piñata Ångström œ æ ß", _
    "Ελληνικά: Καλημέρα κόσμε αβγ Ω", _
    "Русский: Привет мир Ёжик", _
    "العربية: مرحبا بالعالم | עברית: שלום עולם", _
    "हिन्दी: नमस्ते दुनिया | ไทย: สวัสดีชาวโลก", _
    "😀 😎 🚀 🔥 🧪 🧑‍💻 🇰🇷 🇯🇵 🇨🇳", _
    "∑ ∫ ∞ ≠ ≤ ≥ √ π λ ∂ ∇ ⇔ → ∴ ⊕ ⌘", _
    "€ £ ¥ ₩ ₹ © ® ™ § ¶ † ‡ • ‰ ★ ☃ ☯", _
    "Café vs Café | Å vs Å | ♥ vs ♥️", _
    "שלום ← مرحبا → ABC" _
)

For i = 0 To UBound(categories)
    WScript.Echo CStr(i + 1) & ". " & categories(i) & ": " & values(i)
Next

' Escapes used by Microsoft's Script Encoder need special testing.
WScript.Echo "Escape check: @# @& @! @* @$ < > @"
WScript.Echo "String quotes: ""double-quoted value"""
WScript.Echo "Loop test: " & RepeatText("ABCdef012", 20)

Function RepeatText(ByVal value, ByVal count)
    Dim n, result
    result = ""
    For n = 1 To count
        result = result & value
    Next
    RepeatText = result
End Function
