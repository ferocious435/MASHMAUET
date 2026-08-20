$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$healthUrl = "http://127.0.0.1:3000/health"

$serverReady = $false
try {
  $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 1
  $serverReady = $response.StatusCode -eq 200
} catch {
  $serverReady = $false
}

if (-not $serverReady) {
  Start-Process -FilePath "npm.cmd" -ArgumentList "start" -WorkingDirectory $projectRoot -WindowStyle Hidden

  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    Start-Sleep -Milliseconds 250
    try {
      $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 1
      if ($response.StatusCode -eq 200) {
        $serverReady = $true
        break
      }
    } catch {
      $serverReady = $false
    }
  }
}

if (-not $serverReady) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    "Не удалось запустить локальную страницу MASHMAUET.",
    "MASHMAUET",
    "OK",
    "Error"
  ) | Out-Null
  exit 1
}

Start-Process "http://127.0.0.1:3000"
