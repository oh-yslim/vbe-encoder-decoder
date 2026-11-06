Option Explicit

' Korean legacy CP949 VBE compatibility test.
Dim line, i
line = "한글 인코딩 테스트: 안녕하세요 대한민국"
For i = 1 To 5
    WScript.Echo CStr(i) & ": " & line
Next
WScript.Echo "Escapes: @# @& @! @* @$ < > @"
