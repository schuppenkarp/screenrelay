$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskData = Join-Path $taskRoot 'data'
if (-not (Test-Path -LiteralPath (Join-Path $taskData 'managed-server.json'))) {
    Write-Output 'Kein verwalteter Bilderwand-Server aktiv.'
    exit 0
}
Set-Content -LiteralPath (Join-Path $taskData 'managed-server.stop') -Value 'stop' -Encoding ascii
Write-Output 'Der lokale Bilderwand-Server wird beendet. Autostart bleibt eingerichtet.'
