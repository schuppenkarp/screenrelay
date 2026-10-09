$ErrorActionPreference = 'Stop'
$taskRunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
Remove-ItemProperty -LiteralPath $taskRunKey -Name 'ScreenRelay' -ErrorAction SilentlyContinue
Write-Output 'Autostart der Bilderwand entfernt. Den laufenden Server beendet stop-server.ps1.'
