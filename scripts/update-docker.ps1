param(
  [Parameter(Mandatory=$true)][string]$InstallDirectory,
  [string]$Version = 'latest',
  [string]$ProjectName = 'wallrelay'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
if ($ProjectName -notmatch '^[a-z0-9][a-z0-9_-]*$') { throw 'Invalid Compose project name.' }
if ($Version -ne 'latest' -and $Version -notmatch '^v\d+\.\d+\.\d+$') { throw 'Use a stable version such as v1.1.0.' }
$root = (Resolve-Path -LiteralPath $InstallDirectory).Path
if ($root.Contains(',')) { throw 'Installation paths containing commas are not supported.' }
$composeFile = Join-Path $root 'compose.proxy.yaml'
$envFile = Join-Path $root '.env'
if (!(Test-Path -LiteralPath $composeFile) -or !(Test-Path -LiteralPath $envFile)) { throw 'Run in an existing proxy installation with compose.proxy.yaml and .env.' }
function Docker-Run { param([string[]]$Arguments)
  & docker @Arguments | Out-Host
  if ($LASTEXITCODE -ne 0) { throw ('Docker failed: ' + ($Arguments | Select-Object -First 2) -join ' ') }
}
function Docker-Read { param([string[]]$Arguments)
  $result = & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Docker inspection failed.' }
  return ($result -join "`n")
}
$lock = $null
$stopped = $false
$switched = $false
$composeArgs = @('compose','--project-directory',$root,'--env-file',$envFile,'-p',$ProjectName,'-f',$composeFile)
$override = Join-Path $root 'compose.version.yaml'
if (Test-Path -LiteralPath $override) { $composeArgs += @('-f',$override) }
try {
  $lock = [IO.File]::Open((Join-Path $root 'update.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
  $ids = Docker-Read -Arguments @('ps','-a','--filter',"label=com.docker.compose.project=$ProjectName",'--filter','label=com.docker.compose.service=wall','--format','{{.ID}}')
  if ($ids -notmatch '^[a-f0-9]{12,64}$') { throw 'Exactly one existing application container is required.' }
  $current = @(ConvertFrom-Json (Docker-Read -Arguments @('inspect',$ids)))[0]
  $dataMount = @($current.Mounts | Where-Object { $_.Destination -eq '/app/data' -and $_.Type -eq 'volume' })
  if ($dataMount.Count -ne 1) { throw 'Expected one named app data volume.' }
  $volume = $dataMount[0].Name
  $api = 'https://api.github.com/repos/schuppenkarp/screenrelay/releases/'
  if ($Version -eq 'latest') { $api += 'latest' } else { $api += 'tags/' + $Version }
  $release = Invoke-RestMethod -Uri $api -Headers @{ Accept='application/vnd.github+json' }
  if ($release.draft -or $release.prerelease -or $release.tag_name -notmatch '^v\d+\.\d+\.\d+$') { throw 'No stable release found.' }
  $tag = $release.tag_name
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
  # Retain the exact running image before a build can replace any tag.
  $previousImage = 'screenrelay:backup-' + $ProjectName + '-' + $stamp
  Docker-Run -Arguments @('image','tag',$current.Image,$previousImage)
  $work = Join-Path $root ('updates\' + $tag + '-' + $stamp)
  New-Item -ItemType Directory -Path $work -Force | Out-Null
  $archive = Join-Path $work 'source.zip'
  Write-Host "Downloading ScreenRelay $tag ..."
  Invoke-WebRequest -UseBasicParsing -Uri "https://codeload.github.com/schuppenkarp/screenrelay/zip/refs/tags/$tag" -OutFile $archive
  $unpack = Join-Path $work 'source'
  Expand-Archive -LiteralPath $archive -DestinationPath $unpack
  $folders = @(Get-ChildItem -LiteralPath $unpack -Directory)
  if ($folders.Count -ne 1) { throw 'Unexpected source archive.' }
  $source = $folders[0].FullName
  $package = Get-Content -LiteralPath (Join-Path $source 'package.json') -Raw | ConvertFrom-Json
  if ('v' + $package.version -ne $tag) { throw 'Release tag and package version differ.' }
  $image = 'screenrelay:' + $tag + '-' + $stamp
  Docker-Run -Arguments @('build','-t',$image,$source)
  $newImage = $image
  $backupDir = Join-Path $root ('backups\' + $stamp)
  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
  Copy-Item -LiteralPath $envFile -Destination (Join-Path $backupDir '.env')
  Copy-Item -LiteralPath $composeFile -Destination (Join-Path $backupDir 'compose.proxy.yaml')
  if (Test-Path -LiteralPath $override) { Copy-Item -LiteralPath $override -Destination (Join-Path $backupDir 'compose.version.yaml') }
  @{ image=$previousImage; volume=$volume; project=$ProjectName; target=$tag; sourceSha=$release.target_commitish } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupDir 'restore.json') -Encoding UTF8
  Write-Host 'Stopping the application and creating a complete backup ...'
  Docker-Run -Arguments ($composeArgs + @('stop','wall'))
  $stopped = $true
  Docker-Run -Arguments @('run','--rm','--user','0','--entrypoint','tar','--mount',"type=volume,source=$volume,target=/source,readonly",'--mount',"type=bind,source=$backupDir,target=/backup",$previousImage,'czf','/backup/data.tar.gz','-C','/source','.')
  Docker-Run -Arguments @('run','--rm','--user','0','--entrypoint','node','--mount',"type=volume,source=$volume,target=/app/data",'--mount',"type=bind,source=$source/scripts,target=/maintenance,readonly",$previousImage,'/maintenance/clear-profile-locks.js')
  # Keep private Compose settings, ports and volume name; replace only the image.
  [IO.File]::WriteAllText($override,"services:`n  wall:`n    image: $newImage`n",(New-Object Text.UTF8Encoding($false)))
  $switched = $true
  $newArgs = @('compose','--project-directory',$root,'--env-file',$envFile,'-p',$ProjectName,'-f',$composeFile,'-f',$override)
  Docker-Run -Arguments ($newArgs + @('up','-d','--no-deps','--wait','wall'))
  [IO.File]::WriteAllText((Join-Path $root 'installed-version.txt'),$tag,(New-Object Text.UTF8Encoding($false)))
  Write-Host "Installed $tag. Backup: $backupDir"
  Write-Host 'Check the monitor and WhatsApp connection in the admin area.'
} catch {
  if ($stopped -and !$switched) {
    & docker @composeArgs start wall | Out-Host
  } elseif ($switched) {
    & docker @newArgs stop wall | Out-Host
    Write-Warning 'New version failed its health check and was stopped. Backup and previous image remain available. See docs/updates.md; do not restore only the old image over a potentially migrated database.'
  }
  throw
} finally {
  if ($lock) { $lock.Dispose() }
}
