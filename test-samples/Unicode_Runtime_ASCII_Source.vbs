Option Explicit

' The source uses ASCII only to avoid legacy text file code-page problems.
' U() converts Unicode scalar values in the BMP into VBScript UTF-16 code units.
Dim out
out = "Korean: " & U(50504) & U(45397) & U(54616) & U(49464) & U(50836)
out = out & vbCrLf & "Japanese: " & U(26085) & U(26412) & U(35486)
out = out & vbCrLf & "Chinese: " & U(20320) & U(22909) & U(19990) & U(30028)
out = out & vbCrLf & "Latin: Caf" & U(233) & ", pi" & U(241) & "ata"
out = out & vbCrLf & "Greek: " & U(937) & U(960) & U(955)
out = out & vbCrLf & "Emoji: " & U(55357) & U(56832) & " " & U(55357) & U(56960)
out = out & vbCrLf & "Math: " & U(8721) & " " & U(8734) & " " & U(8800)
WScript.Echo out

Function U(ByVal point)
    If point >= 32768 Then point = point - 65536
    U = ChrW(point)
End Function
