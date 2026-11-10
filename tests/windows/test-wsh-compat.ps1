param(
    [switch]$SkipExecution
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fixtures = Join-Path $root 'test-samples'
$cases = @(
    @{ Name = 'ASCII'; Source = 'WSH_Probe_ASCII.vbs'; Encoded = 'WSH_Probe_ASCII.vbe'; Encoding = 'ASCII'; Expected = 'VBE_WSH_ASCII_PASS' },
    @{ Name = 'Unicode'; Source = 'WSH_Probe_Unicode_UTF16LE.vbs'; Encoded = 'WSH_Probe_Unicode_UTF16LE.vbe'; Encoding = 'Unicode'; Expected = 'VBE_WSH_UNICODE_PASS' },
    @{ Name = 'UnicodeComment'; Source = 'WSH_Probe_Unicode_Comments_UTF16LE.vbs'; Encoded = 'WSH_Probe_Unicode_Comments_UTF16LE.vbe'; Encoding = 'Unicode'; Expected = 'VBE_WSH_UNICODE_COMMENT_PASS' }
)

function Get-UnitLabel([string]$value, [int]$index) {
    if ($index -ge $value.Length) { return '<END>' }
    return 'U+' + ([int][char]$value[$index]).ToString('X4')
}

function Show-EncodedMetadata([string]$name, [string]$value) {
    $match = [regex]::Match($value, '(?s)^#@~\^(.{8})(.*)(.{8})\^#~@$')
    if (-not $match.Success) {
        Write-Host ($name + ': VBE_HEADER_PARSE_FAIL')
        return
    }
    try {
        $declaredLength = [BitConverter]::ToUInt32([Convert]::FromBase64String($match.Groups[1].Value), 0)
        $declaredChecksum = [BitConverter]::ToUInt32([Convert]::FromBase64String($match.Groups[3].Value), 0)
        Write-Host ($name + ': METADATA declared_body_length=' + $declaredLength +
            ' actual_body_units=' + $match.Groups[2].Value.Length +
            ' declared_checksum=' + $declaredChecksum)
    } catch {
        Write-Host ($name + ': VBE_METADATA_PARSE_FAIL ' + $_.Exception.Message)
    }
}

function Show-EncodedDifference([string]$caseName, [string]$nativeText, [string]$webText) {
    $limit = [Math]::Min($nativeText.Length, $webText.Length)
    $index = 0
    while ($index -lt $limit -and $nativeText[$index] -ceq $webText[$index]) { $index++ }
    Write-Host ($caseName + ': ENCODE_MISMATCH first_index_1based=' + ($index + 1) +
        ' native_length=' + $nativeText.Length + ' web_length=' + $webText.Length)
    Show-EncodedMetadata ($caseName + '/NATIVE') $nativeText
    Show-EncodedMetadata ($caseName + '/WEB') $webText
    $first = [Math]::Max(0, $index - 6)
    $last = [Math]::Min([Math]::Max($nativeText.Length, $webText.Length) - 1, $index + 9)
    for ($position = $first; $position -le $last; $position++) {
        Write-Host ('  CHAR ' + ($position + 1) + ': native=' + (Get-UnitLabel $nativeText $position) +
            ' web=' + (Get-UnitLabel $webText $position))
    }
    $nativeExtraNull = $nativeText.IndexOf([char]0) -ge 0
    Write-Host ($caseName + ': NATIVE_CONTAINS_NUL=' + $nativeExtraNull)
}

function Invoke-CScript([string]$path, [string]$expected) {
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = Join-Path $env:SystemRoot 'System32\cscript.exe'
    # Do not use //B: batch mode suppresses WScript.Echo, creating a false failure.
    $start.Arguments = '//nologo //I //T:10 "' + $path + '"'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $start
    try {
        if (-not $process.Start()) { throw 'Cannot start cscript.exe.' }
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        $success = $process.ExitCode -eq 0 -and $stdout.Contains($expected)
        return @{ Success = $success; ExitCode = $process.ExitCode;
            Stdout = $stdout.Trim(); Stderr = $stderr.Trim() }
    } finally {
        $process.Dispose()
    }
}

function Report-Execution([string]$name, [string]$path, [string]$expected) {
    try {
        $result = Invoke-CScript $path $expected
        if ($result.Success) {
            Write-Host ($name + ': WSH_EXECUTION_PASS')
            return $true
        }
        Write-Warning ($name + ': WSH_EXECUTION_FAIL exit=' + $result.ExitCode +
            ' stdout=' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($result.Stdout)) +
            ' stderr=' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($result.Stderr)))
        # Print output separately so it remains readable in GitHub Actions logs.
        if ($result.Stdout) { Write-Host ($name + ': STDOUT ' + $result.Stdout) }
        if ($result.Stderr) { Write-Host ($name + ': STDERR ' + $result.Stderr) }
        return $false
    } catch {
        Write-Warning ($name + ': WSH_LAUNCH_ERROR ' + $_.Exception.Message)
        return $false
    }
}

try {
    $encoder = New-Object -ComObject 'Scripting.Encoder'
} catch {
    Write-Warning ('Scripting.Encoder COM is unavailable: ' + $_.Exception.Message)
    Write-Host 'RESULT: NATIVE_ENCODER_UNAVAILABLE'
    exit 2
}

$failed = $false
$tempDir = Join-Path ([IO.Path]::GetTempPath()) ('vbe-codec-wsh-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($tempDir) | Out-Null
try {
    foreach ($case in $cases) {
        $sourcePath = Join-Path $fixtures $case.Source
        $webPath = Join-Path $fixtures $case.Encoded
        $fileEncoding = [Text.Encoding]::ASCII
        if ($case.Encoding -eq 'Unicode') { $fileEncoding = [Text.Encoding]::Unicode }
        $sourceText = [IO.File]::ReadAllText($sourcePath, $fileEncoding)
        $nativeRaw = [string]$encoder.EncodeScriptFile('.vbs', $sourceText, 0, '')
        $nativeText = $nativeRaw
        # Some Scripting.Encoder COM versions append one terminal NUL after the closing marker.
        # Normalize only that exact terminator for string comparison, never an embedded NUL.
        if ($nativeText.EndsWith(('^#~@' + [char]0))) {
            $nativeText = $nativeText.Substring(0, $nativeText.Length - 1)
            Write-Host ($case.Name + ': NATIVE_TRAILING_NUL_NORMALIZED')
        }
        if ($nativeText.Contains([string][char]0)) {
            $failed = $true
            Write-Warning ($case.Name + ': NATIVE_INTERIOR_NUL at_index_0based=' + $nativeText.IndexOf([char]0))
        }
        $webText = [IO.File]::ReadAllText($webPath, $fileEncoding)

        if ($nativeText -ceq $webText) {
            Write-Host ($case.Name + ': NATIVE_ENCODE_MATCH')
        } else {
            $failed = $true
            Show-EncodedDifference $case.Name $nativeText $webText
        }

        if (-not $SkipExecution) {
            # Establish whether the source VBScript itself runs on this Windows host.
            if (-not (Report-Execution ($case.Name + '/SOURCE') $sourcePath $case.Expected)) {
                $failed = $true
            }
            if (-not (Report-Execution ($case.Name + '/WEB') $webPath $case.Expected)) {
                $failed = $true
            }

            # Compare Web VBE execution against Microsoft COM output in the same file encoding.
            $nativePath = Join-Path $tempDir ($case.Name + '_NATIVE.vbe')
            # Execute the untouched native result to retain a true COM-generated reference.
            [IO.File]::WriteAllText($nativePath, $nativeRaw, $fileEncoding)
            if (-not (Report-Execution ($case.Name + '/NATIVE') $nativePath $case.Expected)) {
                $failed = $true
            }
        }
    }
} catch {
    $failed = $true
    Write-Warning ('UNEXPECTED_TEST_ERROR ' + $_.Exception.ToString())
} finally {
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

if ($failed) {
    Write-Host 'RESULT: FAIL'
    exit 1
}
Write-Host 'RESULT: PASS'
