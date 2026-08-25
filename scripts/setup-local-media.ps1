$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$toolsRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot ".local-tools"))
$temporaryRoot = [System.IO.Path]::GetFullPath((Join-Path $toolsRoot "setup-temp"))

if (-not $toolsRoot.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Invalid local tools path."
}

$assets = @(
  @{
    Name = "FFmpeg 6.1.1"
    Url = "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64"
    Sha256 = "04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00"
    Download = "ffmpeg-win32-x64"
    Target = "ffmpeg/b6.1.1/ffmpeg.exe"
  },
  @{
    Name = "FFprobe 6.1.1"
    Url = "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffprobe-win32-x64"
    Sha256 = "3a7e2dc003dc2cd1472827e4c7c4f056ae1ae0ae7c5bbc580c99b49827351ba4"
    Download = "ffprobe-win32-x64"
    Target = "ffmpeg/b6.1.1/ffprobe.exe"
  },
  @{
    Name = "whisper.cpp 1.9.1"
    Url = "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.1/whisper-bin-x64.zip"
    Sha256 = "7d8be46ecd31828e1eb7a2ecdd0d6b314feafd82163038ab6092594b0a063539"
    InstalledSha256 = "58245314fb73b30fbd0cf0542c5c172e23f02b6eb7cad7b51e792439cf5e1755"
    Download = "whisper-bin-x64.zip"
    Target = "whisper/v1.9.1/Release/whisper-cli.exe"
  },
  @{
    Name = "Whisper large-v3-turbo-q5_0 model"
    Url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin"
    Sha256 = "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"
    Download = "ggml-large-v3-turbo-q5_0.bin"
    Target = "whisper/models/ggml-large-v3-turbo-q5_0.bin"
  }
)

New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null

foreach ($asset in $assets) {
  $targetPath = [System.IO.Path]::GetFullPath((Join-Path $toolsRoot $asset.Target))
  if (-not $targetPath.StartsWith($toolsRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Invalid destination path: $($asset.Name)"
  }

  if (Test-Path -LiteralPath $targetPath) {
    $existingHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $expectedInstalledHash = if ($asset.ContainsKey("InstalledSha256")) { $asset.InstalledSha256 } else { $asset.Sha256 }
    if ($existingHash -eq $expectedInstalledHash) {
      Write-Host "$($asset.Name): already installed and verified."
      continue
    }
  }

  $downloadPath = Join-Path $temporaryRoot $asset.Download
  Invoke-WebRequest -Uri $asset.Url -OutFile $downloadPath -UseBasicParsing
  $downloadHash = (Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($downloadHash -ne $asset.Sha256) {
    throw "$($asset.Name) checksum mismatch. The file was not installed."
  }

  if ($asset.Download -like "*.zip") {
    $extractPath = Join-Path $temporaryRoot "whisper-extracted"
    Expand-Archive -LiteralPath $downloadPath -DestinationPath $extractPath -Force
    $releaseSource = Join-Path $extractPath "Release"
    $releaseTarget = Join-Path $toolsRoot "whisper/v1.9.1/Release"
    New-Item -ItemType Directory -Path $releaseTarget -Force | Out-Null
    Copy-Item -Path (Join-Path $releaseSource "*") -Destination $releaseTarget -Recurse -Force
  } else {
    New-Item -ItemType Directory -Path (Split-Path -Parent $targetPath) -Force | Out-Null
    Copy-Item -LiteralPath $downloadPath -Destination $targetPath -Force
  }

  Write-Host "$($asset.Name): installed after SHA-256 verification."
}

if ($temporaryRoot.StartsWith($toolsRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
}

Write-Host "Local audio processing is ready. Start MASHMAUET with START-MASHMAUET.cmd."
