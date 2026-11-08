$ErrorActionPreference = 'Stop'
$practiceRoot = Split-Path -Parent $PSScriptRoot
$practicePython = Join-Path $practiceRoot '.venv/Scripts/python.exe'
$practiceVite = Join-Path $practiceRoot 'web/node_modules/vite/bin/vite.js'
if (!(Test-Path -LiteralPath $practicePython) -or !(Test-Path -LiteralPath $practiceVite)) {
    throw 'Install the project dependencies first; see README.md.'
}
$practiceData = Join-Path $practiceRoot 'data'
New-Item -ItemType Directory -Force -Path $practiceData | Out-Null
if (!(Get-NetTCPConnection -LocalPort 8017 -State Listen -ErrorAction SilentlyContinue)) {
    $practiceApi = Start-Process -FilePath $practicePython -ArgumentList @('-m','uvicorn','server.app:app','--host','127.0.0.1','--port','8017') -WorkingDirectory $practiceRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $practiceData 'api.log') -RedirectStandardError (Join-Path $practiceData 'api-error.log') -PassThru
    Write-Output "API process: $($practiceApi.Id)"
}
if (!(Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue)) {
    $practiceNode = (Get-Command node).Source
    $practiceWeb = Start-Process -FilePath $practiceNode -ArgumentList @(('"' + $practiceVite + '"')) -WorkingDirectory (Join-Path $practiceRoot 'web') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $practiceData 'web.log') -RedirectStandardError (Join-Path $practiceData 'web-error.log') -PassThru
    Write-Output "Web process: $($practiceWeb.Id)"
}
function Wait-PracticeReady {
    param([string]$Url, [scriptblock]$Check)
    for ($practiceAttempt = 0; $practiceAttempt -lt 40; $practiceAttempt++) {
        try {
            $practiceResponse = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if (& $Check $practiceResponse.Content) { return }
        } catch { }
        Start-Sleep -Milliseconds 250
    }
    throw "The expected practice service is unavailable at $Url. Check data/*-error.log and whether another program occupies ports 8017 or 4173."
}
Wait-PracticeReady 'http://127.0.0.1:8017/api/setup' {
    param($Content)
    $practiceSetup = $Content | ConvertFrom-Json
    return ('presets' -in $practiceSetup.PSObject.Properties.Name) -and ('lastConfig' -in $practiceSetup.PSObject.Properties.Name)
}
Wait-PracticeReady 'http://127.0.0.1:4173' {
    param($Content)
    return $Content.Contains('<title>Arithmetic practice')
}
Wait-PracticeReady 'http://127.0.0.1:4173/api/setup' {
    param($Content)
    $practiceSetup = $Content | ConvertFrom-Json
    return ('presets' -in $practiceSetup.PSObject.Properties.Name)
}
Write-Output 'Local practice: http://127.0.0.1:4173'
