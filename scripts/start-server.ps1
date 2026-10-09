$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskNode = (Get-Command node.exe -ErrorAction Stop).Source
$taskSupervisor = Join-Path $PSScriptRoot 'supervisor.js'
Start-Process -FilePath $taskNode -ArgumentList ('"' + $taskSupervisor + '"') -WorkingDirectory $taskRoot -WindowStyle Hidden
Write-Output 'Bilderwand startet im Hintergrund: http://127.0.0.1:3000'
