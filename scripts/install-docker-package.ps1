param(
  [Parameter(Mandatory=$true)][string]$PublicOrigin,
  [ValidateRange(1,65535)][int]$Port = 8045,
  [string]$BindAddress = '0.0.0.0',
  [string]$ProjectName = 'wallrelay',
  [switch]$Start
)
$ErrorActionPreference = 'Stop'
$taskPackage = Split-Path -Parent $PSScriptRoot
$taskCompose = Join-Path $taskPackage 'compose.proxy.yaml'
$taskDataArchive = Join-Path $taskPackage 'private-data.tar.gz'
$taskImageArchive = Join-Path $taskPackage 'wallrelay-image.tar'
$taskManifest = Join-Path $taskPackage 'DEPLOYMENT-SHA256.json'
$taskUrl = [Uri]$PublicOrigin
if ($taskUrl.Scheme -ne 'https' -or $taskUrl.AbsolutePath -ne '/' -or $taskUrl.Query -or $taskUrl.Fragment -or $taskUrl.UserInfo) { throw 'PublicOrigin muss eine HTTPS-Adresse ohne Pfad sein.' }
if ($ProjectName -notmatch '^[a-z0-9][a-z0-9_-]+$') { throw 'Ungültiger Compose-Projektname.' }
$taskAddress = $null
if (-not [Net.IPAddress]::TryParse($BindAddress, [ref]$taskAddress)) { throw 'BindAddress muss eine IP-Adresse sein.' }
$taskEngine = docker info --format '{{.OSType}}'
if ($LASTEXITCODE -ne 0 -or $taskEngine -ne 'linux') { throw 'Ein erreichbarer Linux-Docker-Dienst ist erforderlich. Windows-Container können dieses Image nicht starten.' }
foreach ($taskEntry in (Get-Content -LiteralPath $taskManifest -Raw | ConvertFrom-Json)) {
  $taskFile = [IO.Path]::GetFullPath((Join-Path $taskPackage $taskEntry.file))
  if (-not $taskFile.StartsWith([IO.Path]::GetFullPath($taskPackage) + [IO.Path]::DirectorySeparatorChar)) { throw 'Ungültiger Manifestpfad.' }
  if ((Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash -ne $taskEntry.sha256) { throw ('Prüfsummenfehler: ' + $taskEntry.file) }
}
$env:PUBLIC_ORIGIN = $taskUrl.GetLeftPart([UriPartial]::Authority)
$env:PORT = [string]$Port
$env:BIND_ADDRESS = $BindAddress
$taskEnvFile = Join-Path $taskPackage '.env'
if (-not (Test-Path -LiteralPath $taskEnvFile)) { throw 'Private .env fehlt.' }
# These contain deployment addresses, not secret values. Existing private API keys stay intact.
$taskLines = @(Get-Content -LiteralPath $taskEnvFile | Where-Object { $_ -notmatch '^(PUBLIC_ORIGIN|PORT|BIND_ADDRESS)=' })
$taskLines += "PUBLIC_ORIGIN=$env:PUBLIC_ORIGIN", "PORT=$Port", "BIND_ADDRESS=$BindAddress"
[IO.File]::WriteAllLines($taskEnvFile, $taskLines, [Text.UTF8Encoding]::new($false))
$taskComposeArgs = @('compose','--project-name',$ProjectName,'--env-file',$taskEnvFile,'-f',$taskCompose)
docker load --input $taskImageArchive
if ($LASTEXITCODE -ne 0) { throw 'Image konnte nicht geladen werden.' }
# Refuse to overwrite any existing installation. Archive extraction runs only into an empty volume.
$taskMount = "${taskPackage}:/restore:ro"
docker @taskComposeArgs run --rm --no-deps --user root --volume $taskMount --entrypoint sh wall /restore/scripts/import-docker-data.sh
if ($LASTEXITCODE -ne 0) { throw 'Datenimport fehlgeschlagen. Vorhandene Daten werden nicht überschrieben.' }
docker @taskComposeArgs run --rm --no-deps --volume $taskMount --entrypoint node wall /restore/scripts/configure-migrated-data.js
if ($LASTEXITCODE -ne 0) { throw 'Migrationseinstellungen konnten nicht gesetzt werden.' }
Write-Output "Import abgeschlossen. Reverse Proxy: HTTP an ${BindAddress}:$Port, extern $env:PUBLIC_ORIGIN"
Write-Output "Entra-Redirect-URI: $env:PUBLIC_ORIGIN/api/auth/entra/callback"
if ($Start) {
  docker @taskComposeArgs up -d --wait
  if ($LASTEXITCODE -ne 0) { throw 'Container ist nicht gesund gestartet.' }
} else {
  Write-Output "Erst Quellinstanz stoppen und Entra-Redirect-URI ergänzen. Danach: docker compose --project-name $ProjectName --env-file .env -f compose.proxy.yaml up -d --wait"
}
