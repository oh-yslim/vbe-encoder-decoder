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
    (ChrW(&HC548) & ChrW(&HB155) & ChrW(&HD558) & ChrW(&HC138) & ChrW(&HC694) & " " & ChrW(&HD55C) & ChrW(&HAE00) & " " & ChrW(&HD14C) & ChrW(&HC2A4) & ChrW(&HD2B8) & " " & ChrW(&HC11C) & ChrW(&HC6B8) & " " & ChrW(&HB300) & ChrW(&HD55C) & ChrW(&HBBFC) & ChrW(&HAD6D)), _
    (ChrW(&H3053) & ChrW(&H3093) & ChrW(&H306B) & ChrW(&H3061) & ChrW(&H306F) & " " & ChrW(&H4E16) & ChrW(&H754C) & " " & ChrW(&H65E5) & ChrW(&H672C) & ChrW(&H8A9E) & " " & ChrW(&H30AB) & ChrW(&H30BF) & ChrW(&H30AB) & ChrW(&H30CA) & " " & ChrW(&H3072) & ChrW(&H3089) & ChrW(&H304C) & ChrW(&H306A)), _
    (ChrW(&H4F60) & ChrW(&H597D) & ChrW(&HFF0C) & ChrW(&H4E16) & ChrW(&H754C) & ChrW(&HFF01) & ChrW(&H7B80) & ChrW(&H4F53) & ChrW(&H4E2D) & ChrW(&H6587) & " " & ChrW(&H7F16) & ChrW(&H7801) & ChrW(&H6D4B) & ChrW(&H8BD5)), _
    (ChrW(&H4F60) & ChrW(&H597D) & ChrW(&HFF0C) & ChrW(&H4E16) & ChrW(&H754C) & ChrW(&HFF01) & ChrW(&H7E41) & ChrW(&H9AD4) & ChrW(&H4E2D) & ChrW(&H6587) & " " & ChrW(&H7DE8) & ChrW(&H78BC) & ChrW(&H6E2C) & ChrW(&H8A66)), _
    ("Caf" & ChrW(&H00E9) & " na" & ChrW(&H00EF) & "ve fa" & ChrW(&H00E7) & "ade Stra" & ChrW(&H00DF) & "e pi" & ChrW(&H00F1) & "ata " & ChrW(&H00C5) & "ngstr" & ChrW(&H00F6) & "m " & ChrW(&H0153) & " " & ChrW(&H00E6) & " " & ChrW(&H00DF)), _
    (ChrW(&H0395) & ChrW(&H03BB) & ChrW(&H03BB) & ChrW(&H03B7) & ChrW(&H03BD) & ChrW(&H03B9) & ChrW(&H03BA) & ChrW(&H03AC) & ": " & ChrW(&H039A) & ChrW(&H03B1) & ChrW(&H03BB) & ChrW(&H03B7) & ChrW(&H03BC) & ChrW(&H03AD) & ChrW(&H03C1) & ChrW(&H03B1) & " " & ChrW(&H03BA) & ChrW(&H03CC) & ChrW(&H03C3) & ChrW(&H03BC) & ChrW(&H03B5) & " " & ChrW(&H03B1) & ChrW(&H03B2) & ChrW(&H03B3) & " " & ChrW(&H03A9)), _
    (ChrW(&H0420) & ChrW(&H0443) & ChrW(&H0441) & ChrW(&H0441) & ChrW(&H043A) & ChrW(&H0438) & ChrW(&H0439) & ": " & ChrW(&H041F) & ChrW(&H0440) & ChrW(&H0438) & ChrW(&H0432) & ChrW(&H0435) & ChrW(&H0442) & " " & ChrW(&H043C) & ChrW(&H0438) & ChrW(&H0440) & " " & ChrW(&H0401) & ChrW(&H0436) & ChrW(&H0438) & ChrW(&H043A)), _
    (ChrW(&H0627) & ChrW(&H0644) & ChrW(&H0639) & ChrW(&H0631) & ChrW(&H0628) & ChrW(&H064A) & ChrW(&H0629) & ": " & ChrW(&H0645) & ChrW(&H0631) & ChrW(&H062D) & ChrW(&H0628) & ChrW(&H0627) & " " & ChrW(&H0628) & ChrW(&H0627) & ChrW(&H0644) & ChrW(&H0639) & ChrW(&H0627) & ChrW(&H0644) & ChrW(&H0645) & " | " & ChrW(&H05E2) & ChrW(&H05D1) & ChrW(&H05E8) & ChrW(&H05D9) & ChrW(&H05EA) & ": " & ChrW(&H05E9) & ChrW(&H05DC) & ChrW(&H05D5) & ChrW(&H05DD) & " " & ChrW(&H05E2) & ChrW(&H05D5) & ChrW(&H05DC) & ChrW(&H05DD)), _
    (ChrW(&H0939) & ChrW(&H093F) & ChrW(&H0928) & ChrW(&H094D) & ChrW(&H0926) & ChrW(&H0940) & ": " & ChrW(&H0928) & ChrW(&H092E) & ChrW(&H0938) & ChrW(&H094D) & ChrW(&H0924) & ChrW(&H0947) & " " & ChrW(&H0926) & ChrW(&H0941) & ChrW(&H0928) & ChrW(&H093F) & ChrW(&H092F) & ChrW(&H093E) & " | " & ChrW(&H0E44) & ChrW(&H0E17) & ChrW(&H0E22) & ": " & ChrW(&H0E2A) & ChrW(&H0E27) & ChrW(&H0E31) & ChrW(&H0E2A) & ChrW(&H0E14) & ChrW(&H0E35) & ChrW(&H0E0A) & ChrW(&H0E32) & ChrW(&H0E27) & ChrW(&H0E42) & ChrW(&H0E25) & ChrW(&H0E01)), _
    (ChrW(&HD83D) & ChrW(&HDE00) & " " & ChrW(&HD83D) & ChrW(&HDE0E) & " " & ChrW(&HD83D) & ChrW(&HDE80) & " " & ChrW(&HD83D) & ChrW(&HDD25) & " " & ChrW(&HD83E) & ChrW(&HDDEA) & " " & ChrW(&HD83E) & ChrW(&HDDD1) & ChrW(&H200D) & ChrW(&HD83D) & ChrW(&HDCBB) & " " & ChrW(&HD83C) & ChrW(&HDDF0) & ChrW(&HD83C) & ChrW(&HDDF7) & " " & ChrW(&HD83C) & ChrW(&HDDEF) & ChrW(&HD83C) & ChrW(&HDDF5) & " " & ChrW(&HD83C) & ChrW(&HDDE8) & ChrW(&HD83C) & ChrW(&HDDF3)), _
    (ChrW(&H2211) & " " & ChrW(&H222B) & " " & ChrW(&H221E) & " " & ChrW(&H2260) & " " & ChrW(&H2264) & " " & ChrW(&H2265) & " " & ChrW(&H221A) & " " & ChrW(&H03C0) & " " & ChrW(&H03BB) & " " & ChrW(&H2202) & " " & ChrW(&H2207) & " " & ChrW(&H21D4) & " " & ChrW(&H2192) & " " & ChrW(&H2234) & " " & ChrW(&H2295) & " " & ChrW(&H2318)), _
    (ChrW(&H20AC) & " " & ChrW(&H00A3) & " " & ChrW(&H00A5) & " " & ChrW(&H20A9) & " " & ChrW(&H20B9) & " " & ChrW(&H00A9) & " " & ChrW(&H00AE) & " " & ChrW(&H2122) & " " & ChrW(&H00A7) & " " & ChrW(&H00B6) & " " & ChrW(&H2020) & " " & ChrW(&H2021) & " " & ChrW(&H2022) & " " & ChrW(&H2030) & " " & ChrW(&H2605) & " " & ChrW(&H2603) & " " & ChrW(&H262F)), _
    ("Caf" & ChrW(&H00E9) & " vs Cafe" & ChrW(&H0301) & " | " & ChrW(&H00C5) & " vs A" & ChrW(&H030A) & " | " & ChrW(&H2665) & " vs " & ChrW(&H2665) & ChrW(&HFE0F)), _
    (ChrW(&H05E9) & ChrW(&H05DC) & ChrW(&H05D5) & ChrW(&H05DD) & " " & ChrW(&H2190) & " " & ChrW(&H0645) & ChrW(&H0631) & ChrW(&H062D) & ChrW(&H0628) & ChrW(&H0627) & " " & ChrW(&H2192) & " ABC") _
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
