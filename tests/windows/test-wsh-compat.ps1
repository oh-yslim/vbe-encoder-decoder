param(
    [switch]$SkipExecution
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$cases = @(
    @{ Name = 'ASCII'; Source = 'WSH_Probe_ASCII.vbs'; Encoded = 'WSH_Probe_ASCII.vbe'; Encoding = 'ASCII'; Expected = 'VBE_WSH_ASCII_PASS' },
    @{ Name = 'Unicode'; Source = 'WSH_Probe_Unicode_UTF16LE.vbs'; Encoded = 'WSH_Probe_Unicode_UTF16LE.vbe'; Encoding = 'Unicode'; Expected = 'VBE_WSH_UNICODE_PASS' }
)

try {
    $encoder = New-Object -ComObject 'Scripting.Encoder'
} catch {
    Write-Warning ('Scripting.Encoder COM is unavailable: ' + $_.Exception.Message)
    Write-Host 'RESULT: NATIVE_ENCODER_UNAVAILABLE'
    exit 2
}

$failed = $false
    foreach ($case in $cases) {
        $sourcePath = Join-Path (Join-Path $root 'test-samples') $case.Source
        $encodedPath = Join-Path (Join-Path $root 'test-samples') $case.Encoded
        if ($case.Encoding -eq 'ASCII') {
            $sourceText = [IO.File]::ReadAllText($sourcePath, [Text.Encoding]::ASCII)
        } else {
            $sourceText = [IO.File]::ReadAllText($sourcePath, [Text.Encoding]::Unicode)
        }

        $officialText = [string]$encoder.EncodeScriptFile('.vbs', $sourceText, 0, '')
        $codecText = [IO.File]::ReadAllText($encodedPath)
        if ($officialText -ceq $codecText) {
            Write-Host ($case.Name + ': NATIVE_ENCODE_MATCH')
        } else {
            $failed = $true
            $diff = 0
            $limit = [Math]::Min($officialText.Length, $codecText.Length)
            while ($diff -lt $limit -and $officialText[$diff] -ceq $codecText[$diff]) { $diff++ }
            Write-Warning ($case.Name + ': ENCODE_MISMATCH at character ' + ($diff + 1) +
                ' (native=' + $officialText.Length + ', web=' + $codecText.Length + ')')
        }

        if (-not $SkipExecution) {
            $runner = Join-Path $env:SystemRoot 'System32\cscript.exe'
            $result = @(& $runner '//nologo' '//B' $encodedPath 2>&1)
            $exitCode = $LASTEXITCODE
            if ($exitCode -eq 0 -and ($result -join "`n").Contains($case.Expected)) {
                Write-Host ($case.Name + ': WSH_EXECUTION_PASS')
            } else {
                $failed = $true
                Write-Warning ($case.Name + ': WSH_EXECUTION_FAIL exit=' + $exitCode + ' output=' + ($result -join ' | '))
            }
        }
    }
if ($failed) {
    Write-Host 'RESULT: FAIL'
    exit 1
}
Write-Host 'RESULT: PASS'
