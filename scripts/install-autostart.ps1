$ErrorActionPreference = 'Stop'
$taskStart = Join-Path $PSScriptRoot 'start-server.ps1'
$taskCommand = 'powershell.exe -NoProfile -WindowStyle Hidden -File "' + $taskStart + '"'
$taskRunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if (-not (Test-Path -LiteralPath $taskRunKey)) { New-Item -Path $taskRunKey -Force | Out-Null }
New-ItemProperty -LiteralPath $taskRunKey -Name 'ScreenRelay' -PropertyType String -Value $taskCommand -Force | Out-Null
Write-Output 'Autostart eingerichtet: Bilderwand startet nach der Windows-Anmeldung dieses Benutzers.'
